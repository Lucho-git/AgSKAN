// $lib/services/foregroundGpsService.js
// Manages the RawGps native plugin for foreground use.
// Provides raw GNSS chip fixes at true 1Hz, bypassing TransistorSoft's
// Fused Location Provider caching on Android.
//
// Architecture:
//   Foreground + 1Hz enabled  → RawGps plugin (this service)
//   Background / non-1Hz      → TransistorSoft (backgroundService.js)
//
// Both emit the same { coords, timestamp } shape so VehicleTracker
// can consume them identically.

import { Capacitor } from '@capacitor/core';
import RawGps from '$lib/plugins/rawGps';

class ForegroundGpsService {
  constructor() {
    this.isRunning = false;
    this.listeners = [];
    this._pluginListener = null;
    this.eventCount = 0;
    this.lastLocation = null;
  }

  /**
   * Start receiving raw GPS fixes from the native GNSS chip.
   * If already running, stops the current session first and restarts
   * with the new options (handles interval changes and remount races).
   * @param {object} opts
   * @param {number} opts.intervalMs - Minimum interval between fixes (default 1000)
   * @param {number} opts.minDistanceM - Minimum distance filter (default 0 = every fix)
   * @returns {Promise<boolean>} true if started successfully
   */
  async start(opts = {}) {
    if (!Capacitor.isNativePlatform()) {
      console.warn('[ForegroundGPS] Not a native platform, skipping');
      return false;
    }

    // If already running, stop first then restart with new params
    if (this.isRunning) {
      console.log('[ForegroundGPS] Restarting with new params:', opts);
      await this.stop();
    }

    try {
      // Register the native event listener BEFORE calling start()
      // so we don't miss the first fix
      this._pluginListener = await RawGps.addListener('rawLocation', (data) => {
        this.eventCount++;
        this.lastLocation = data;

        // Normalize to the same shape as backgroundService location events
        const coords = {
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          heading: data.heading || 0,
          speed: data.speed || 0,
          altitude: data.altitude || null,
          provider: data.provider || 'gps',
          satellites: data.satellites ?? null,
        };

        const normalized = {
          coords,
          timestamp: data.timestamp || Date.now(),
          source: 'raw-gps',
        };

        this._notifyListeners(normalized);
      });

      const result = await RawGps.start({
        intervalMs: opts.intervalMs ?? 1000,
        minDistanceM: opts.minDistanceM ?? 0,
      });

      if (result.started) {
        this.isRunning = true;
        this.eventCount = 0;
        console.log('[ForegroundGPS] Started raw GPS listener');
        return true;
      } else {
        console.warn('[ForegroundGPS] start() returned:', result.reason);
        return false;
      }
    } catch (error) {
      console.error('[ForegroundGPS] Failed to start:', error);
      return false;
    }
  }

  /**
   * Stop receiving raw GPS fixes.
   */
  async stop() {
    if (!this.isRunning) return;

    try {
      if (this._pluginListener) {
        await this._pluginListener.remove();
        this._pluginListener = null;
      }
      await RawGps.stop();
    } catch (error) {
      console.error('[ForegroundGPS] Failed to stop:', error);
    }

    this.isRunning = false;
    console.log(`[ForegroundGPS] Stopped after ${this.eventCount} events`);
  }

  /**
   * Register a listener for location events.
   * @param {function} callback - Called with { coords, timestamp, source }
   * @returns {function} Unsubscribe function
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  _notifyListeners(data) {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error('[ForegroundGPS] Listener error:', error);
      }
    }
  }

  /**
   * Check if the raw GPS plugin is currently active.
   */
  async checkRunning() {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const result = await RawGps.isRunning();
      return result.running;
    } catch {
      return false;
    }
  }
}

// Export singleton
export default new ForegroundGpsService();
