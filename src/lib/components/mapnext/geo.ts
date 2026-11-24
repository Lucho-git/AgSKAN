/** Small flat-earth geometry helpers for the map prototype. */

export type LngLat = [number, number]
/** Metres east and north of an anchor point. */
export type XY = [number, number]

const M_PER_DEG = 111320
const rad = (deg: number) => (deg * Math.PI) / 180

/** Converts between metres around `anchor` and longitude/latitude. */
export function projector(anchor: LngLat) {
  const kx = M_PER_DEG * Math.cos(rad(anchor[1]))
  return {
    anchor,
    toLngLat: ([x, y]: XY): LngLat => [
      anchor[0] + x / kx,
      anchor[1] + y / M_PER_DEG,
    ],
    toXY: ([lng, lat]: LngLat): XY => [
      (lng - anchor[0]) * kx,
      (lat - anchor[1]) * M_PER_DEG,
    ],
  }
}
export type Projector = ReturnType<typeof projector>

/** Distance in metres between two nearby points. */
export function distanceM(a: LngLat, b: LngLat) {
  const kx = M_PER_DEG * Math.cos(rad((a[1] + b[1]) / 2))
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * M_PER_DEG)
}

/** Compass bearing from a to b, in degrees (0 = north, 90 = east). */
export function bearingDeg(a: LngLat, b: LngLat) {
  const kx = Math.cos(rad((a[1] + b[1]) / 2))
  const deg = (Math.atan2((b[0] - a[0]) * kx, b[1] - a[1]) * 180) / Math.PI
  return (deg + 360) % 360
}

export const bearingXY = (a: XY, b: XY) =>
  ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360

/** Signed shortest turn from one heading to another, -180…180. */
export const turn = (from: number, to: number) =>
  ((((to - from) % 360) + 540) % 360) - 180

/** Step `from` towards `to` along the shortest arc. */
export const easeHeading = (from: number, to: number, alpha: number) =>
  (from + turn(from, to) * alpha + 360) % 360

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

/** Screen pixels per metre at a zoom level and latitude (512px tiles). */
export const pixelsPerMetre = (zoom: number, lat: number) =>
  Math.pow(2, zoom) / (78271.517 * Math.cos(rad(lat)))

export function ringAreaHa(ring: XY[]) {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return Math.abs(sum) / 2 / 10000
}

export function pointInRing(p: XY, ring: XY[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside
  }
  return inside
}

/** Inside the outer ring and not inside any hole. */
export const pointInPolygon = (p: XY, rings: XY[][]) =>
  pointInRing(p, rings[0]) && !rings.slice(1).some((h) => pointInRing(p, h))

const rotate = ([x, y]: XY, deg: number): XY => {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return [x * c - y * s, x * s + y * c]
}

/**
 * Where the vertical line at `x` is inside the polygon: sorted [y0, y1]
 * intervals, even-odd across the outer ring and its holes.
 */
function spansAt(x: number, rings: XY[][]): [number, number][] {
  const hits: number[] = []
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j]
      const [x2, y2] = ring[i]
      if (x1 > x !== x2 > x) hits.push(y1 + ((x - x1) / (x2 - x1)) * (y2 - y1))
    }
  }
  hits.sort((a, b) => a - b)
  const spans: [number, number][] = []
  for (let i = 0; i + 1 < hits.length; i += 2)
    spans.push([hits[i], hits[i + 1]])
  return spans
}

/** A point comfortably inside the polygon, for its name label. */
export function labelPoint(rings: XY[][]): XY {
  const xs = rings[0].map((p) => p[0])
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  let best: { len: number; at: XY } | null = null
  for (const f of [0.5, 0.38, 0.62, 0.26, 0.74]) {
    const x = lerp(lo, hi, f)
    for (const [y0, y1] of spansAt(x, rings)) {
      // Prefer the middle of the paddock; only move for a clearly longer span.
      const len = (y1 - y0) * (f === 0.5 ? 1.25 : 1)
      if (!best || len > best.len) best = { len, at: [x, (y0 + y1) / 2] }
    }
  }
  return best ? best.at : rings[0][0]
}

/**
 * Up-and-back working passes covering a paddock.
 *
 * `angle` is the compass direction the passes run (0 = north–south). Passes
 * are `spacing` apart and stop `inset` metres short of the fence. Where the
 * boundary is ragged, each pass keeps to its longest clear stretch.
 */
export function workingPasses(
  rings: XY[][],
  spacing: number,
  angle = 0,
  inset = spacing * 0.6,
): XY[] {
  const turned = rings.map((r) => r.map((p) => rotate(p, angle)))
  const xs = turned[0].map((p) => p[0])
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const path: XY[] = []
  let up = true
  for (let x = lo + spacing * 0.75; x < hi - spacing * 0.4; x += spacing) {
    const spans = spansAt(x, turned)
    if (!spans.length) continue
    const [y0, y1] = spans.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a))
    if (y1 - y0 < inset * 2 + 60) continue
    const a: XY = [x, y0 + inset]
    const b: XY = [x, y1 - inset]
    path.push(...(up ? [a, b] : [b, a]))
    up = !up
  }
  return path.map((p) => rotate(p, -angle))
}

/** A polyline you can walk along by distance. */
export class Track {
  readonly cum: number[] = [0]
  constructor(readonly points: XY[]) {
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1]
      const [bx, by] = points[i]
      this.cum.push(this.cum[i - 1] + Math.hypot(bx - ax, by - ay))
    }
  }
  get length() {
    return this.cum[this.cum.length - 1]
  }
  /** Index of the segment that contains distance `d`. */
  segmentAt(d: number) {
    let i = 1
    while (i < this.cum.length - 1 && this.cum[i] < d) i++
    return i
  }
  at(d: number): { xy: XY; heading: number; segment: number } {
    const dist = clamp(d, 0, this.length)
    const i = this.segmentAt(dist)
    const a = this.points[i - 1]
    const b = this.points[i]
    const span = this.cum[i] - this.cum[i - 1] || 1
    const t = (dist - this.cum[i - 1]) / span
    return {
      xy: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)],
      heading: bearingXY(a, b),
      segment: i,
    }
  }
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
export const compassPoint = (deg: number) =>
  COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
