// $lib/services/mockLocationService.js
//
// JS wrapper around the native MockLocation Capacitor plugin.
// Starts/stops a native Android ForegroundService that injects mock GPS
// coordinates into the system.  The transistorsoft BackgroundGeolocation
// plugin picks these up as real GPS — so the full pipeline is exercised:
//
//   mock GPS → onLocation → native HTTP POST → background_sync RPC → DB → CDC → observer
//
// PREREQUISITES (one-time setup on the test device):
//   1. Settings → Developer Options → enabled
//   2. Developer Options → "Select mock location app" → AgSKAN
//
// Usage:
//   import mockLocationService from '$lib/services/mockLocationService';
//   await mockLocationService.startSimulation(-33.87, 151.21);
//   await mockLocationService.stopSimulation();

import { Capacitor, registerPlugin } from '@capacitor/core'

const MockLocation = Capacitor.isNativePlatform()
  ? registerPlugin('MockLocation')
  : null

class MockLocationService {
  constructor() {
    this.running = false
  }

  /**
   * Start the native GPS simulation.
   * @param {number} latitude  Starting latitude
   * @param {number} longitude Starting longitude
   * @param {object} [opts]
   * @param {number} [opts.intervalMs=3000]   Time between mock locations (ms)
   * @param {number} [opts.stepMeters=15]     Distance per tick (meters)
   * @param {string} [opts.pattern='rectangle']  'rectangle' or 'circle'
   */
  async startSimulation(latitude, longitude, opts = {}) {
    if (!MockLocation) {
      console.warn('[MockLocation] Not available on this platform')
      return false
    }

    const { intervalMs = 3000, stepMeters = 15, pattern = 'rectangle' } = opts

    try {
      await MockLocation.start({ latitude, longitude, intervalMs, stepMeters, pattern })
      this.running = true
      console.log(`[MockLocation] ✅ Simulation started at ${latitude}, ${longitude} (${pattern}, every ${intervalMs}ms)`)
      return true
    } catch (e) {
      console.error('[MockLocation] Failed to start:', e)
      return false
    }
  }

  /**
   * Stop the native GPS simulation.
   */
  async stopSimulation() {
    if (!MockLocation) return false

    try {
      await MockLocation.stop()
      this.running = false
      console.log('[MockLocation] ⏹️ Simulation stopped')
      return true
    } catch (e) {
      console.error('[MockLocation] Failed to stop:', e)
      return false
    }
  }

  /**
   * Check if the simulation is currently running.
   */
  async isRunning() {
    if (!MockLocation) return false

    try {
      const { running } = await MockLocation.isRunning()
      this.running = running
      return running
    } catch (e) {
      return false
    }
  }
}

const mockLocationService = new MockLocationService()
export default mockLocationService
