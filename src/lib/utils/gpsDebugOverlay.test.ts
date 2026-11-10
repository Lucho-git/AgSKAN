import { describe, expect, it } from "vitest"
import {
  emptyDebugOverlay,
  recordRawFix,
  tickDebugOverlay,
} from "./gpsDebugOverlay"

const fix = (latitude: number, longitude: number) => ({
  latitude,
  longitude,
  accuracy: 4,
  heading: 90,
  speed: 2,
})

describe("recordRawFix", () => {
  it("counts events and coordinate changes", () => {
    let s = emptyDebugOverlay()
    s = recordRawFix(s, fix(1, 2), "native", 1000)
    s = recordRawFix(s, fix(1, 2), "native", 2000)
    s = recordRawFix(s, fix(1, 3), "raw-gps", 3000)

    expect(s.nativeEventCount).toBe(3)
    expect(s.uniqueCoordCount).toBe(2)
    expect(s.lastChangedAt).toBe(3000)
    expect(s.prevRawLng).toBe(2)
    expect(s.rawLng).toBe(3)
    expect(s.source).toBe("raw-gps")
    expect(s.recentEventTimes).toEqual([1000, 2000, 3000])
    expect(s.recentUniqueTimes).toEqual([1000, 3000])
  })

  it("does not mutate the previous state", () => {
    const s0 = emptyDebugOverlay()
    recordRawFix(s0, fix(1, 2), "native", 1000)
    expect(s0).toEqual(emptyDebugOverlay())
  })
})

describe("tickDebugOverlay", () => {
  it("drops events older than 5s and computes rates", () => {
    let s = emptyDebugOverlay()
    for (const t of [1000, 5000, 6000, 7000]) {
      s = recordRawFix(s, fix(t, t), "native", t)
    }
    s = tickDebugOverlay(s, 9000)
    expect(s.recentEventTimes).toEqual([5000, 6000, 7000])
    expect(s.eventsPerSec).toBeCloseTo(0.6)
    expect(s.uniquePerSec).toBeCloseTo(0.6)
  })
})
