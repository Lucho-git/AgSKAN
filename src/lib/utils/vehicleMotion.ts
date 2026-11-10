// src/lib/utils/vehicleMotion.ts
// Per-fix decisions for the user's own vehicle in VehicleTracker: distance,
// speed from successive fixes, heading choice, the GPS accuracy gate and
// when a fix is worth pushing to the stores / trail buffer.
//
// The stateful pieces are small factories so the component holds one
// instance each instead of a dozen loose `let`s.

import { courseOverGround, isValidHeading, smoothHeading } from "./heading"

export interface LatLng {
  latitude: number
  longitude: number
}

/** Haversine distance in metres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Vehicle coordinates come either as `{ latitude, longitude }` or as the
 * Postgres point text "(lng,lat)". Returns null when neither.
 */
export function parseCoordinates(coords: unknown): LatLng | null {
  if (!coords) return null

  if (typeof coords === "object") {
    const c = coords as Partial<LatLng>
    if (c.latitude && c.longitude) {
      return { latitude: c.latitude, longitude: c.longitude }
    }
  }

  if (typeof coords === "string") {
    const [longitude, latitude] = coords.slice(1, -1).split(",").map(parseFloat)
    return { latitude, longitude }
  }

  return null
}

/**
 * Like parseCoordinates for the "(lng,lat)" string form, but rejects
 * non-numeric parts (a vehicle_state row may exist before its first fix).
 */
export function parsePointString(coords: unknown): [number, number] | null {
  if (!coords || typeof coords !== "string") return null
  const [longitude, latitude] = coords.slice(1, -1).split(",").map(parseFloat)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return [longitude, latitude]
}

/** ISO string / epoch ms → epoch ms, falling back to `now` when unusable. */
export function resolveFixTime(
  gpsTimestamp: string | number | null | undefined,
  now: number = Date.now(),
): number {
  const parsed = gpsTimestamp
    ? typeof gpsTimestamp === "string"
      ? new Date(gpsTimestamp).getTime()
      : gpsTimestamp
    : null
  return Number.isFinite(parsed) ? (parsed as number) : now
}

// ── Speed ────────────────────────────────────────────────────────────────

export const SPEED_MIN_CALC_INTERVAL_MS = 1000
export const SPEED_MIN_MOVEMENT_M = 0.8
export const SPEED_HISTORY_SIZE = 5
export const SPEED_SMOOTHING_ALPHA = 0.6
/** Implied speeds above this are treated as a glitch and ignored. */
export const SPEED_MAX_PLAUSIBLE_KMH = 200

/**
 * Speed (km/h) from successive fixes, exponentially smoothed over the last
 * few samples and blended with the currently displayed speed.
 */
export function createSpeedEstimator() {
  let lastPosition: LatLng | null = null
  let lastTime: number | null = null
  const history: number[] = []

  return {
    /**
     * @param currentSpeed the speed currently shown — returned unchanged when
     *   this fix is too soon or implausible, and blended into the result.
     */
    update(
      latitude: number,
      longitude: number,
      timestamp: number,
      currentSpeed: number,
    ): number {
      if (!lastPosition || !lastTime) {
        lastPosition = { latitude, longitude }
        lastTime = timestamp
        return currentSpeed || 0
      }

      const timeDiff = timestamp - lastTime
      if (timeDiff < SPEED_MIN_CALC_INTERVAL_MS) return currentSpeed

      const distance = haversineMeters(
        lastPosition.latitude,
        lastPosition.longitude,
        latitude,
        longitude,
      )
      const speedKmh = (distance / (timeDiff / 1000)) * 3.6
      if (speedKmh > SPEED_MAX_PLAUSIBLE_KMH) return currentSpeed

      lastPosition = { latitude, longitude }
      lastTime = timestamp

      history.push(
        distance < SPEED_MIN_MOVEMENT_M ? Math.min(speedKmh, 0.5) : speedKmh,
      )
      if (history.length > SPEED_HISTORY_SIZE) history.shift()

      let smoothed = history[0]
      for (let i = 1; i < history.length; i++) {
        smoothed =
          SPEED_SMOOTHING_ALPHA * history[i] +
          (1 - SPEED_SMOOTHING_ALPHA) * smoothed
      }
      const final =
        SPEED_SMOOTHING_ALPHA * smoothed +
        (1 - SPEED_SMOOTHING_ALPHA) * currentSpeed
      return Math.round(final * 10) / 10
    },
  }
}

// ── Heading ──────────────────────────────────────────────────────────────
// Two sources, because neither alone is reliable:
//   • course-over-ground (COG) from our own accepted fixes — steady, but
//     needs a few metres of travel before it means anything
//   • the GNSS chip's bearing — responsive on bends, but Doppler-derived
//     and effectively noise below a walking pace (and 0 when unavailable)
// COG wins whenever we have moved far enough; the chip is the fallback at
// speed. If neither is usable we hold the last known heading rather than
// snapping to north. See heading.ts for the smoothing maths.

export const HEADING_COG_MIN_M = 5 // travel needed before COG is trustworthy
export const HEADING_COG_MIN_GAP_MS = 1000 // ...and a >=1s baseline
export const HEADING_COG_MAX_M = 40 // stale anchor — chord no longer a bearing
export const HEADING_COG_MAX_GAP_MS = 10000 // anchor expiry
export const HEADING_CHIP_MIN_SPEED_KMH = 4 // trust the chip above this

export function createHeadingResolver() {
  let anchor: (LatLng & { timestamp: number }) | null = null
  let lastSmoothed: number | null = null

  return {
    /** Whole degrees clockwise from north, or null when nothing is known. */
    resolve(
      latitude: number,
      longitude: number,
      chipHeading: number | null | undefined,
      speedKmh: number,
      timestamp: number,
    ): number | null {
      let cog: number | null = null
      if (anchor) {
        const distance = haversineMeters(
          anchor.latitude,
          anchor.longitude,
          latitude,
          longitude,
        )
        const gap = timestamp - anchor.timestamp

        if (distance > HEADING_COG_MAX_M || gap > HEADING_COG_MAX_GAP_MS) {
          // Stale anchor: the chord no longer describes where we are heading.
          anchor = { latitude, longitude, timestamp }
        } else if (
          distance >= HEADING_COG_MIN_M &&
          gap >= HEADING_COG_MIN_GAP_MS
        ) {
          cog = courseOverGround(
            anchor.latitude,
            anchor.longitude,
            latitude,
            longitude,
          )
          anchor = { latitude, longitude, timestamp }
        }
        // Otherwise keep the anchor and accumulate a longer baseline.
      } else {
        anchor = { latitude, longitude, timestamp }
      }

      let raw: number | null = null
      if (cog !== null) {
        raw = cog
      } else if (
        isValidHeading(chipHeading) &&
        speedKmh >= HEADING_CHIP_MIN_SPEED_KMH
      ) {
        raw = chipHeading
      }

      lastSmoothed = smoothHeading(lastSmoothed, raw, speedKmh)
      return isValidHeading(lastSmoothed)
        ? Math.round(lastSmoothed) % 360
        : null
    },
  }
}

// ── GPS accuracy gate ────────────────────────────────────────────────────

/** Reject fixes worse than this (WiFi / cell-tower positions). */
export const GPS_MAX_ACCURACY_M = 100
/**
 * Guests (viewer accounts) are usually on desktops or phones using network /
 * IP-based location, which can be kilometres off. They still get a pointer
 * on the map, so give them an effectively unlimited gate.
 */
export const GPS_MAX_ACCURACY_GUEST_M = 500000

export type GpsGateResult =
  | { accepted: true }
  | { accepted: false; reason: string; category: "accuracy"; accuracy: number }

export function checkGpsAccuracy(
  accuracy: number | null | undefined,
  isGuest: boolean,
): GpsGateResult {
  const maxAccuracy = isGuest ? GPS_MAX_ACCURACY_GUEST_M : GPS_MAX_ACCURACY_M
  if (accuracy != null && accuracy > maxAccuracy) {
    return {
      accepted: false,
      reason: `Accuracy too low: ${Math.round(accuracy)}m (max ${maxAccuracy}m)`,
      category: "accuracy",
      accuracy,
    }
  }
  return { accepted: true }
}

// ── Recording decisions ──────────────────────────────────────────────────

export const LOCATION_TRACKING_INTERVAL_MIN_MS = 30
/** Heartbeat — push an update even when stationary. */
export const VEHICLE_DATA_HEARTBEAT_MS = 15000
/** UI update throttle for high-rate native fixes. */
export const USER_UI_UPDATE_INTERVAL_MS = 1000

/** Should the UI (marker / camera / stores) update for this fix? */
export function shouldUpdateUi(opts: {
  now: number
  lastUiUpdateTime: number
  forceUpdate: boolean
  full1Hz: boolean
}): boolean {
  return (
    opts.forceUpdate ||
    opts.full1Hz ||
    opts.now - opts.lastUiUpdateTime >= USER_UI_UPDATE_INTERVAL_MS
  )
}

/**
 * Should this fix be pushed into the vehicle store (and trail buffer)?
 * Yes when the position or heading changed, or the heartbeat elapsed —
 * but never more often than every LOCATION_TRACKING_INTERVAL_MIN_MS.
 */
export function shouldPushVehicleUpdate(opts: {
  now: number
  lastRecordedTime: number
  lastPushTime: number
  coords: LatLng
  heading: number | null
  lastCoords: LatLng | null
  lastHeading: number | null
}): boolean {
  if (opts.now - opts.lastRecordedTime < LOCATION_TRACKING_INTERVAL_MIN_MS) {
    return false
  }
  const moved =
    !opts.lastCoords ||
    opts.lastCoords.latitude !== opts.coords.latitude ||
    opts.lastCoords.longitude !== opts.coords.longitude
  const turned = opts.lastHeading !== opts.heading
  const heartbeat = opts.now - opts.lastPushTime >= VEHICLE_DATA_HEARTBEAT_MS
  return moved || turned || heartbeat
}

/**
 * While paused we record only when the vehicle has moved this far since the
 * last recorded pause point — keeps the dotted connector light, and lets a
 * parked vehicle go "idle" for the 4h stale-trail safety net.
 */
export const PAUSE_POINT_MIN_MOVE_M = 5

/**
 * Decides whether a trailing fix goes into the trail buffer. Unpaused: every
 * fix. Paused: the first fix only sets the reference; after that, only fixes
 * PAUSE_POINT_MIN_MOVE_M away from the last recorded pause point.
 */
export function createPausePointThinner() {
  let ref: LatLng | null = null
  return {
    shouldRecord(paused: boolean, coords: LatLng): boolean {
      if (!paused) {
        ref = null
        return true
      }
      if (!ref) {
        ref = { latitude: coords.latitude, longitude: coords.longitude }
        return false
      }
      if (
        haversineMeters(
          ref.latitude,
          ref.longitude,
          coords.latitude,
          coords.longitude,
        ) >= PAUSE_POINT_MIN_MOVE_M
      ) {
        ref = { latitude: coords.latitude, longitude: coords.longitude }
        return true
      }
      return false
    },
  }
}
