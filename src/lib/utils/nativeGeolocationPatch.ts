/**
 * Patches navigator.geolocation on native Capacitor platforms to use
 * @capacitor/geolocation instead of the WKWebView browser API.
 *
 * This prevents iOS from showing the "Localhost would like to use your
 * current location" webview prompt, since the native plugin uses
 * CLLocationManager directly (which already has permission).
 *
 * Safe to call on web — it's a no-op when not running natively.
 */
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

let patched = false

export function patchGeolocationForNative(): void {
  if (patched) return
  if (!Capacitor.isNativePlatform()) return

  patched = true

  const nativeGetCurrentPosition: typeof navigator.geolocation.getCurrentPosition = (
    successCallback,
    errorCallback,
    options
  ) => {
    Geolocation.getCurrentPosition({
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeout ?? 10000,
      maximumAge: options?.maximumAge ?? 0,
    })
      .then((pos) => {
        // Build a GeolocationPosition-like object
        const position: GeolocationPosition = {
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            altitude: pos.coords.altitude,
            accuracy: pos.coords.accuracy,
            altitudeAccuracy: pos.coords.altitudeAccuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          },
          timestamp: pos.timestamp,
        } as GeolocationPosition
        successCallback(position)
      })
      .catch((err) => {
        if (errorCallback) {
          errorCallback({
            code: 2, // POSITION_UNAVAILABLE
            message: err?.message ?? 'Native geolocation error',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError)
        }
      })
  }

  // Track active watches so clearWatch works
  const watchMap = new Map<number, string>()
  let nextWatchId = 1000

  const nativeWatchPosition: typeof navigator.geolocation.watchPosition = (
    successCallback,
    errorCallback,
    options
  ) => {
    const watchId = nextWatchId++

    Geolocation.watchPosition(
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 10000,
        maximumAge: options?.maximumAge ?? 0,
      },
      (pos, err) => {
        if (err) {
          if (errorCallback) {
            errorCallback({
              code: 2,
              message: err.message ?? 'Native watch error',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError)
          }
          return
        }
        if (pos) {
          const position: GeolocationPosition = {
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              altitude: pos.coords.altitude,
              accuracy: pos.coords.accuracy,
              altitudeAccuracy: pos.coords.altitudeAccuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
            },
            timestamp: pos.timestamp,
          } as GeolocationPosition
          successCallback(position)
        }
      }
    ).then((callbackId) => {
      watchMap.set(watchId, callbackId)
    })

    return watchId
  }

  const nativeClearWatch: typeof navigator.geolocation.clearWatch = (watchId) => {
    const callbackId = watchMap.get(watchId)
    if (callbackId) {
      Geolocation.clearWatch({ id: callbackId })
      watchMap.delete(watchId)
    }
  }

  // Override the browser geolocation with native implementations
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition: nativeGetCurrentPosition,
      watchPosition: nativeWatchPosition,
      clearWatch: nativeClearWatch,
    },
    writable: false,
    configurable: true,
  })

  console.log('[AgSKAN] Patched navigator.geolocation → native Capacitor plugin')
}
