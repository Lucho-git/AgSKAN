// src/lib/utils/heading.ts
// Compass headings are circular: 359° and 1° are 2° apart, not 358°. Every
// filter here works on the shortest arc so crossing north never swings the
// icon the long way round.
//
// Values are degrees clockwise from true north. `null` means "no usable
// heading from this fix" (as opposed to 0°, which is a real bearing).

/** Wrap to [0, 360). */
export function normalizeHeading(deg: number): number {
  const wrapped = deg % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

/** Signed shortest angle from `from` to `to`, in (-180, 180]. */
export function shortestHeadingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

/**
 * Initial bearing (degrees clockwise from true north) travelling from one
 * point to another — i.e. "course over ground" from two GPS fixes. This is
 * independent of the GNSS chip's own bearing, which is derived from Doppler
 * and is unreliable at low speed.
 */
export function courseOverGround(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const lat1 = toRad(fromLat)
  const lat2 = toRad(toLat)
  const dLng = toRad(toLng - fromLng)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI)
}

/**
 * Smoothing weight for one fix. Trust the chip when moving; barely move the
 * needle when crawling, where GPS course-over-ground is noise.
 */
export function headingAlpha(speedKmh: number | null | undefined): number {
  const speed = Number.isFinite(speedKmh) ? (speedKmh as number) : 0
  if (speed < 2) return 0.08
  if (speed < 8) return 0.25
  return 0.45
}

/**
 * Circular exponential smoothing.
 *
 * - `raw === null` (no bearing from this fix) → hold the previous value
 *   instead of snapping to 0°/north.
 * - first fix → adopt it as-is.
 * - otherwise → step along the shortest arc by `headingAlpha(speed)`.
 *
 * Returns an unrounded heading, or `null` when nothing is known yet.
 */
export function smoothHeading(
  previous: number | null,
  raw: number | null,
  speedKmh: number | null | undefined,
): number | null {
  if (raw === null || !Number.isFinite(raw)) {
    return previous === null ? null : normalizeHeading(previous)
  }

  const target = normalizeHeading(raw)
  if (previous === null || !Number.isFinite(previous)) return target

  const alpha = headingAlpha(speedKmh)
  return normalizeHeading(
    previous + alpha * shortestHeadingDelta(previous, target),
  )
}

/**
 * True when a value can be used as a heading. Guards the `NaN` / `undefined`
 * cases that used to slip through `heading !== null`.
 */
export function isValidHeading(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
