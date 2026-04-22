import Foundation
import CoreLocation
import UIKit
import Capacitor

/// Custom Capacitor plugin that reads raw GPS fixes directly from CLLocationManager.
/// On iOS, CLLocationManager already uses the raw GNSS chip (no FLP layer like Android),
/// but this plugin provides a unified API matching the Android RawGps plugin and gives
/// us direct control over update frequency without TransistorSoft's filtering.
///
/// NOTE: iOS CLLocationManager has no built-in interval parameter like Android's
/// LocationManager.requestLocationUpdates(intervalMs, ...).  We apply software-side
/// throttling: the hardware delivers fixes at ~1 Hz, and we only forward events to
/// JS when at least `intervalMs` milliseconds have elapsed since the last emission.
@objc(RawGpsPlugin)
public class RawGpsPlugin: CAPPlugin, CLLocationManagerDelegate {
    private var locationManager: CLLocationManager?
    private var running = false

    /// Minimum interval between emitted fixes, in milliseconds.
    /// Set from the JS `start({ intervalMs })` call.
    private var intervalMs: Double = 1000

    /// Timestamp (ms since epoch) of the last fix we forwarded to JS.
    private var lastEmittedMs: Double = 0

    @objc func start(_ call: CAPPluginCall) {
        // If already running, stop first then restart with new params
        if running {
            CAPLog.print("RawGpsPlugin: Already running — restarting with new params")
            stopInternal()
        }

        // Read options from the JS call (mirrors Android plugin API)
        let requestedIntervalMs = call.getDouble("intervalMs") ?? 1000
        let minDistanceM = call.getDouble("minDistanceM") ?? 0

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.intervalMs = requestedIntervalMs
            self.lastEmittedMs = 0

            let manager = CLLocationManager()
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyBest
            // Apply distance filter if caller specified one; otherwise report every fix
            manager.distanceFilter = minDistanceM > 0 ? minDistanceM : kCLDistanceFilterNone
            manager.allowsBackgroundLocationUpdates = false // Foreground only
            manager.pausesLocationUpdatesAutomatically = false

            // Check authorization
            let status = manager.authorizationStatus
            if status == .notDetermined {
                manager.requestWhenInUseAuthorization()
            } else if status == .denied || status == .restricted {
                call.reject("Location permission denied")
                return
            }

            manager.startUpdatingLocation()
            self.locationManager = manager
            self.running = true

            CAPLog.print("RawGpsPlugin: Started — intervalMs=\(requestedIntervalMs), distanceFilter=\(minDistanceM)")
            call.resolve(["started": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.stopInternal()
            call.resolve(["stopped": true])
        }
    }

    /// Internal stop — tears down CLLocationManager. Used by both stop() and start()-restart.
    private func stopInternal() {
        locationManager?.stopUpdatingLocation()
        locationManager?.delegate = nil
        locationManager = nil
        running = false
        lastEmittedMs = 0
        CAPLog.print("RawGpsPlugin: Stopped")
    }

    @objc func isRunning(_ call: CAPPluginCall) {
        call.resolve(["running": running])
    }

    /// Open the iOS Settings page for this app.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Could not create settings URL")
                return
            }
            UIApplication.shared.open(url, options: [:]) { success in
                call.resolve(["completed": success])
            }
        }
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        // Software-side interval throttle: skip this fix if it arrived
        // sooner than intervalMs since the last one we emitted.
        let nowMs = location.timestamp.timeIntervalSince1970 * 1000
        if lastEmittedMs > 0 && (nowMs - lastEmittedMs) < intervalMs {
            return // too soon — drop this fix
        }
        lastEmittedMs = nowMs

        let data: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "altitude": location.altitude,
            "speed": max(location.speed, 0),
            "heading": max(location.course, 0),
            "timestamp": Int64(nowMs),
            "provider": "gps"
        ]

        notifyListeners("rawLocation", data: data)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        CAPLog.print("RawGpsPlugin error: \(error.localizedDescription)")
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        let data: [String: Any] = [
            "provider": "gps",
            "enabled": status == .authorizedAlways || status == .authorizedWhenInUse
        ]
        notifyListeners("providerChange", data: data)
    }
}
