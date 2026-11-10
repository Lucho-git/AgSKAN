import { describe, expect, it } from "vitest"
import { filterGpsGlitches, type GpsPoint } from "./gpsGlitchFilter"

const T0 = Date.UTC(2026, 10, 10)
// ~11 m per step east at 10 s intervals (~4 km/h).
const track = (n: number, start = 0): GpsPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    longitude: 115.86 + (start + i) * 0.0001,
    latitude: -31.95,
    timestamp: T0 + (start + i) * 10_000,
  }))

const lngs = (pts: GpsPoint[]) => pts.map((p) => +p.longitude.toFixed(4))

describe("filterGpsGlitches", () => {
  it("leaves a clean trail untouched", () => {
    const pts = track(30)
    const { clean, glitchCount } = filterGpsGlitches(pts)
    expect(glitchCount).toBe(0)
    expect(clean).toEqual(pts)
  })

  it("passes through trails too short to judge", () => {
    expect(filterGpsGlitches([]).clean).toEqual([])
    expect(filterGpsGlitches(track(1)).clean).toHaveLength(1)
  })

  it("rejects a point that implies an impossible speed", () => {
    const pts = track(10)
    pts.splice(5, 0, {
      longitude: 116.5,
      latitude: -31.95,
      timestamp: pts[4].timestamp + 1_000,
    })

    const { clean, glitchCount } = filterGpsGlitches(pts)

    expect(glitchCount).toBeGreaterThanOrEqual(1)
    expect(lngs(clean)).toEqual(lngs(track(10)))
  })

  it("drops a far-away cluster that jumps back to the trail (teleport)", () => {
    const before = track(10)
    // Five points 5 km north, timed slowly enough to pass the speed gate.
    const away = Array.from({ length: 5 }, (_, i) => ({
      longitude: 115.861,
      latitude: -31.905,
      timestamp: before[9].timestamp + (i + 1) * 300_000,
    }))
    const after = track(10, 10).map((p) => ({
      ...p,
      timestamp: away[4].timestamp + p.timestamp - T0,
    }))

    const { clean } = filterGpsGlitches([...before, ...away, ...after])

    expect(clean.some((p) => p.latitude === -31.905)).toBe(false)
    expect(clean).toHaveLength(20)
  })

  it("keeps a genuine long drive to a new paddock", () => {
    const here = track(10)
    // Steady 40 km/h drive ~5 km east with a fix every 2 s, never returning.
    const drive = Array.from({ length: 220 }, (_, i) => ({
      longitude: 115.861 + (i + 1) * 0.00024,
      latitude: -31.95,
      timestamp: here[9].timestamp + (i + 1) * 2_000,
    }))

    const { clean, glitchCount } = filterGpsGlitches([...here, ...drive])

    expect(glitchCount).toBe(0)
    expect(clean).toHaveLength(230)
  })

  it("trims a bad first fix far from the rest of the trail", () => {
    const pts = track(20)
    pts.unshift({
      longitude: 117.0,
      latitude: -31.0,
      timestamp: T0 - 3_600_000,
    })

    const { clean } = filterGpsGlitches(pts)

    expect(clean[0].longitude).toBeCloseTo(115.86)
    expect(clean).toHaveLength(20)
  })
})
