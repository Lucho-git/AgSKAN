import backgroundService from "$lib/services/backgroundService"

// Adapter that implements the Geolocation API surface used by Mapbox's
// GeolocateControl: getCurrentPosition(success, error, options),
// watchPosition(success, error, options) -> id, clearWatch(id)
// It sources locations from our backgroundService native pipeline so the
// Mapbox control UI and behavior remain unchanged while using native GPS.

class NativeGeolocationAdapter {
  constructor() {
    this._lastCoords = null
    this._watchers = new Map() // id -> {success, error}
    this._nextId = 1
    this._emitInterval = 1000 // ms; default throttle for watcher callbacks
    this._lastEmitAt = 0

    // Subscribe to backgroundService location events to populate cache
    this._removeListener = backgroundService.addListener((event, data) => {
      if (event === "location" && data && data.coords) {
        this._lastCoords = {
          latitude: data.coords.latitude,
          longitude: data.coords.longitude,
          accuracy: data.coords.accuracy,
          heading: data.coords.heading,
          speed: data.coords.speed,
          timestamp: Date.now(),
        }

        // Throttle notifying active watchers to avoid UI desync with app markers
        const now = Date.now()
        if (now - this._lastEmitAt >= this._emitInterval) {
          this._lastEmitAt = now
          for (const { success } of this._watchers.values()) {
            try {
              success(this._toPosition(this._lastCoords))
            } catch (e) {
              console.warn("NativeGeolocationAdapter: watcher callback threw", e)
            }
          }
        }
      }
    })
  }

  setEmitInterval(ms) {
    if (typeof ms === 'number' && ms >= 0) this._emitInterval = ms
  }

  _toPosition(coords) {
    return {
      coords: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy || null,
        altitude: null,
        altitudeAccuracy: null,
        heading: coords.heading || null,
        speed: coords.speed || null,
      },
      timestamp: coords.timestamp || Date.now(),
    }
  }

  getCurrentPosition(success, error, options = {}) {
    // If we have a cached last location, return it immediately
    if (this._lastCoords) {
      try {
        success(this._toPosition(this._lastCoords))
        return true
      } catch (e) {
        console.warn("NativeGeolocationAdapter: getCurrentPosition success handler threw", e)
      }
    }

    // Otherwise wait for the next location event, with optional timeout
    let called = false
    const remove = backgroundService.addListener((event, data) => {
      if (event === "location" && data && data.coords && !called) {
        called = true
        try {
          success(this._toPosition({
            latitude: data.coords.latitude,
            longitude: data.coords.longitude,
            accuracy: data.coords.accuracy,
            heading: data.coords.heading,
            speed: data.coords.speed,
            timestamp: Date.now(),
          }))
        } catch (e) {
          console.warn("NativeGeolocationAdapter: getCurrentPosition callback threw", e)
        }
        remove()
        if (timeout) clearTimeout(timeout)
      }
    })

    const wait = (options && options.timeout) || 6000
    const timeout = setTimeout(() => {
      if (called) return
      called = true
      remove()
      if (typeof error === "function") {
        try {
          error({ code: 3, message: "Timeout waiting for native location" })
        } catch (e) {
          console.warn("NativeGeolocationAdapter: getCurrentPosition error handler threw", e)
        }
      }
    }, wait)

    return true
  }

  watchPosition(success, error, options = {}) {
    const id = this._nextId++
    this._watchers.set(id, { success, error, options })

    // If we already have a cached value, immediately invoke success once
    if (this._lastCoords) {
      try {
        success(this._toPosition(this._lastCoords))
      } catch (e) {
        console.warn("NativeGeolocationAdapter: watchPosition initial callback threw", e)
      }
    }

    return id
  }

  clearWatch(id) {
    this._watchers.delete(id)
  }

  destroy() {
    if (this._removeListener) this._removeListener()
    this._watchers.clear()
  }
}

const adapter = new NativeGeolocationAdapter()
export default adapter
