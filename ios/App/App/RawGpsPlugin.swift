import Foundation
import CoreLocation
import Capacitor

/// Custom Capacitor plugin that reads raw GPS fixes directly from CLLocationManager.
/// On iOS, CLLocationManager already uses the raw GNSS chip (no FLP layer like Android),
/// but this plugin provides a unified API matching the Android RawGps plugin and gives
/// us direct control over update frequency without TransistorSoft's filtering.
@objc(RawGpsPlugin)
public class RawGpsPlugin: CAPPlugin, CLLocationManagerDelegate {
    private var locationManager: CLLocationManager?
    private var running = false

    @objc func start(_ call: CAPPluginCall) {
        // If already running, stop first then restart with new params
        if running {
            CAPLog.print("RawGpsPlugin: Already running — restarting with new params")
            stopInternal()
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let manager = CLLocationManager()
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyBest
            manager.distanceFilter = kCLDistanceFilterNone // Report every fix
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
    }

    @objc func isRunning(_ call: CAPPluginCall) {
        call.resolve(["running": running])
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        var data: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "altitude": location.altitude,
            "speed": max(location.speed, 0),
            "heading": max(location.course, 0),
            "timestamp": Int64(location.timestamp.timeIntervalSince1970 * 1000),
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
