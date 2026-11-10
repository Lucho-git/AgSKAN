// src/lib/utils/gpsDebugOverlay.ts
// State for the "Full 1Hz" GPS debug overlay in VehicleTracker: raw vs.
// applied coordinates, event counters, and rolling events-per-second.

export interface GpsDebugOverlay {
  rawLat: number | null
  rawLng: number | null
  appliedLat: number | null
  appliedLng: number | null
  nativeEventCount: number
  uniqueCoordCount: number
  lastChangedAt: number | null
  prevRawLat: number | null
  prevRawLng: number | null
  accuracy: number | null
  heading: number | null
  speed: number | null
  timestamp: number | null
  source: string | null
  /** timestamps of recent events, for the rolling frequency */
  recentEventTimes: number[]
  /** timestamps of recent events whose coordinate changed */
  recentUniqueTimes: number[]
  eventsPerSec: number
  uniquePerSec: number
}

export const DEBUG_OVERLAY_WINDOW_MS = 5000

export function emptyDebugOverlay(): GpsDebugOverlay {
  return {
    rawLat: null,
    rawLng: null,
    appliedLat: null,
    appliedLng: null,
    nativeEventCount: 0,
    uniqueCoordCount: 0,
    lastChangedAt: null,
    prevRawLat: null,
    prevRawLng: null,
    accuracy: null,
    heading: null,
    speed: null,
    timestamp: null,
    source: null,
    recentEventTimes: [],
    recentUniqueTimes: [],
    eventsPerSec: 0,
    uniquePerSec: 0,
  }
}

/** Record a raw fix as received (before filtering). */
export function recordRawFix(
  state: GpsDebugOverlay,
  fix: {
    latitude: number
    longitude: number
    accuracy?: number | null
    heading?: number | null
    speed?: number | null
  },
  source: string,
  now: number,
): GpsDebugOverlay {
  const coordChanged =
    state.rawLat !== fix.latitude || state.rawLng !== fix.longitude
  return {
    ...state,
    rawLat: fix.latitude,
    rawLng: fix.longitude,
    prevRawLat: state.rawLat,
    prevRawLng: state.rawLng,
    accuracy: fix.accuracy as number | null,
    heading: fix.heading as number | null,
    speed: fix.speed as number | null,
    nativeEventCount: state.nativeEventCount + 1,
    uniqueCoordCount: state.uniqueCoordCount + (coordChanged ? 1 : 0),
    lastChangedAt: coordChanged ? now : state.lastChangedAt,
    timestamp: now,
    source,
    recentEventTimes: [...state.recentEventTimes, now],
    recentUniqueTimes: coordChanged
      ? [...state.recentUniqueTimes, now]
      : state.recentUniqueTimes,
  }
}

/** Drop events older than the window and recompute per-second rates. */
export function tickDebugOverlay(
  state: GpsDebugOverlay,
  now: number,
): GpsDebugOverlay {
  const cutoff = now - DEBUG_OVERLAY_WINDOW_MS
  const recentEvents = state.recentEventTimes.filter((t) => t > cutoff)
  const recentUniques = state.recentUniqueTimes.filter((t) => t > cutoff)
  const seconds = DEBUG_OVERLAY_WINDOW_MS / 1000
  return {
    ...state,
    recentEventTimes: recentEvents,
    recentUniqueTimes: recentUniques,
    eventsPerSec: recentEvents.length / seconds,
    uniquePerSec: recentUniques.length / seconds,
  }
}
