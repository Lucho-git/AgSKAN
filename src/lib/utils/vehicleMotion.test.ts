import { describe, expect, it } from "vitest"
import {
  checkGpsAccuracy,
  createHeadingResolver,
  createPausePointThinner,
  createSpeedEstimator,
  haversineMeters,
  parseCoordinates,
  parsePointString,
  resolveFixTime,
  shouldPushVehicleUpdate,
  shouldUpdateUi,
  GPS_MAX_ACCURACY_M,
} from "./vehicleMotion"

// ~1.11 m per 0.00001° of latitude
const north = (lat: number, metres: number) => lat + metres / 111195

describe("haversineMeters", () => {
  it("is ~111 km per degree of latitude", () => {
    expect(haversineMeters(0, 0, 1, 0)).toBeCloseTo(111195, -1)
  })
  it("is zero for the same point", () => {
    expect(haversineMeters(-33, 151, -33, 151)).toBe(0)
  })
})

describe("coordinate parsing", () => {
  it("accepts objects and point strings", () => {
    expect(parseCoordinates({ latitude: -33, longitude: 151 })).toEqual({
      latitude: -33,
      longitude: 151,
    })
    expect(parseCoordinates("(151.5,-33.25)")).toEqual({
      latitude: -33.25,
      longitude: 151.5,
    })
  })

  it("returns null for nothing usable", () => {
    expect(parseCoordinates(null)).toBeNull()
    expect(parseCoordinates({ latitude: -33 })).toBeNull()
    expect(parseCoordinates(42)).toBeNull()
  })

  it("parsePointString rejects non-numeric parts", () => {
    expect(parsePointString("(151.5,-33.25)")).toEqual([151.5, -33.25])
    expect(parsePointString("(,)")).toBeNull()
    expect(parsePointString(null)).toBeNull()
    expect(parsePointString({ latitude: 1, longitude: 2 })).toBeNull()
  })
})

describe("resolveFixTime", () => {
  it("prefers the GPS timestamp", () => {
    expect(resolveFixTime(1234, 9999)).toBe(1234)
    expect(resolveFixTime("2026-01-01T00:00:00Z", 9999)).toBe(
      Date.UTC(2026, 0, 1),
    )
  })
  it("falls back to now", () => {
    expect(resolveFixTime(null, 9999)).toBe(9999)
    expect(resolveFixTime("not a date", 9999)).toBe(9999)
  })
})

describe("createSpeedEstimator", () => {
  it("returns the current speed on the first fix", () => {
    const est = createSpeedEstimator()
    expect(est.update(-33, 151, 1000, 0)).toBe(0)
    expect(createSpeedEstimator().update(-33, 151, 1000, 7)).toBe(7)
  })

  it("ignores fixes less than a second apart", () => {
    const est = createSpeedEstimator()
    est.update(-33, 151, 1000, 0)
    expect(est.update(north(-33, 10), 151, 1500, 3)).toBe(3)
  })

  it("estimates and smooths speed from movement", () => {
    const est = createSpeedEstimator()
    est.update(-33, 151, 1000, 0)
    // 10 m in 1 s = 36 km/h; blended 60/40 with the shown speed (0)
    const s1 = est.update(north(-33, 10), 151, 2000, 0)
    expect(s1).toBeCloseTo(21.6, 0)
    // keep moving at the same pace → converges towards 36
    let shown = s1
    let lat = north(-33, 10)
    for (let t = 3000; t <= 9000; t += 1000) {
      lat = north(lat, 10)
      shown = est.update(lat, 151, t, shown)
    }
    expect(shown).toBeGreaterThan(34)
    expect(shown).toBeLessThan(36.5)
  })

  it("ignores implausible jumps", () => {
    const est = createSpeedEstimator()
    est.update(-33, 151, 1000, 0)
    // 1 km in 1 s = 3600 km/h
    expect(est.update(north(-33, 1000), 151, 2000, 12)).toBe(12)
  })

  it("caps jitter below the movement threshold", () => {
    const est = createSpeedEstimator()
    est.update(-33, 151, 1000, 0)
    // 0.5 m in 1 s = 1.8 km/h, recorded as 0.5
    expect(est.update(north(-33, 0.5), 151, 2000, 0)).toBe(0.3)
  })
})

describe("createHeadingResolver", () => {
  it("has no heading from a single stationary fix without a chip bearing", () => {
    const h = createHeadingResolver()
    expect(h.resolve(-33, 151, null, 0, 0)).toBeNull()
  })

  it("uses course over ground once far enough", () => {
    const h = createHeadingResolver()
    h.resolve(-33, 151, null, 0, 0)
    // 10 m due north after 2 s → COG ≈ 0°
    expect(h.resolve(north(-33, 10), 151, 270, 18, 2000)).toBe(0)
  })

  it("uses the chip bearing at speed when COG isn't ready", () => {
    const h = createHeadingResolver()
    expect(h.resolve(-33, 151, 90, 20, 0)).toBe(90)
  })

  it("ignores the chip bearing when crawling", () => {
    const h = createHeadingResolver()
    expect(h.resolve(-33, 151, 90, 1, 0)).toBeNull()
  })

  it("holds the last heading when nothing new is usable", () => {
    const h = createHeadingResolver()
    h.resolve(-33, 151, 90, 20, 0)
    expect(h.resolve(-33, 151, null, 0, 500)).toBe(90)
  })

  it("smooths towards a new heading rather than jumping", () => {
    const h = createHeadingResolver()
    h.resolve(-33, 151, 90, 20, 0)
    const next = h.resolve(-33, 151, 180, 20, 100)!
    expect(next).toBeGreaterThan(90)
    expect(next).toBeLessThan(180)
  })
})

describe("checkGpsAccuracy", () => {
  it("accepts good or unknown accuracy", () => {
    expect(checkGpsAccuracy(5, false)).toEqual({ accepted: true })
    expect(checkGpsAccuracy(null, false)).toEqual({ accepted: true })
    expect(checkGpsAccuracy(GPS_MAX_ACCURACY_M, false).accepted).toBe(true)
  })

  it("rejects poor accuracy for drivers", () => {
    const r = checkGpsAccuracy(250.4, false)
    expect(r).toEqual({
      accepted: false,
      reason: "Accuracy too low: 250m (max 100m)",
      category: "accuracy",
      accuracy: 250.4,
    })
  })

  it("lets guests through with network location", () => {
    expect(checkGpsAccuracy(5000, true).accepted).toBe(true)
  })
})

describe("shouldUpdateUi", () => {
  const base = { now: 5000, lastUiUpdateTime: 4500, forceUpdate: false, full1Hz: false }
  it("throttles to once per second", () => {
    expect(shouldUpdateUi(base)).toBe(false)
    expect(shouldUpdateUi({ ...base, lastUiUpdateTime: 4000 })).toBe(true)
  })
  it("is bypassed by force or full 1Hz mode", () => {
    expect(shouldUpdateUi({ ...base, forceUpdate: true })).toBe(true)
    expect(shouldUpdateUi({ ...base, full1Hz: true })).toBe(true)
  })
})

describe("shouldPushVehicleUpdate", () => {
  const coords = { latitude: -33, longitude: 151 }
  const base = {
    now: 10000,
    lastRecordedTime: 9000,
    lastPushTime: 9000,
    coords,
    heading: 90,
    lastCoords: coords,
    lastHeading: 90,
  }

  it("skips when nothing changed and the heartbeat hasn't elapsed", () => {
    expect(shouldPushVehicleUpdate(base)).toBe(false)
  })
  it("pushes on movement, turn, first fix or heartbeat", () => {
    expect(
      shouldPushVehicleUpdate({ ...base, coords: { ...coords, latitude: -33.1 } }),
    ).toBe(true)
    expect(shouldPushVehicleUpdate({ ...base, heading: 91 })).toBe(true)
    expect(shouldPushVehicleUpdate({ ...base, lastCoords: null })).toBe(true)
    expect(shouldPushVehicleUpdate({ ...base, lastPushTime: -5000 })).toBe(true)
  })
  it("never pushes twice within 30ms", () => {
    expect(
      shouldPushVehicleUpdate({ ...base, lastRecordedTime: 9990, heading: 91 }),
    ).toBe(false)
  })
})

describe("createPausePointThinner", () => {
  const at = (m: number) => ({ latitude: north(-33, m), longitude: 151 })

  it("records every fix while not paused", () => {
    const t = createPausePointThinner()
    expect(t.shouldRecord(false, at(0))).toBe(true)
    expect(t.shouldRecord(false, at(0))).toBe(true)
  })

  it("while paused records only after 5 m of movement", () => {
    const t = createPausePointThinner()
    expect(t.shouldRecord(true, at(0))).toBe(false) // sets the reference
    expect(t.shouldRecord(true, at(3))).toBe(false)
    expect(t.shouldRecord(true, at(6))).toBe(true)
    expect(t.shouldRecord(true, at(8))).toBe(false) // 2 m from the new ref
  })

  it("resets the reference when unpaused", () => {
    const t = createPausePointThinner()
    t.shouldRecord(true, at(0))
    t.shouldRecord(false, at(100))
    expect(t.shouldRecord(true, at(106))).toBe(false)
  })
})
