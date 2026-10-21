import { describe, it, expect } from "vitest"
import {
  courseOverGround,
  headingAlpha,
  normalizeHeading,
  shortestHeadingDelta,
  smoothHeading,
} from "./heading"

describe("normalizeHeading", () => {
  it("wraps into [0, 360)", () => {
    expect(normalizeHeading(0)).toBe(0)
    expect(normalizeHeading(360)).toBe(0)
    expect(normalizeHeading(361)).toBe(1)
    expect(normalizeHeading(-1)).toBe(359)
    expect(normalizeHeading(-370)).toBe(350)
  })
})

describe("shortestHeadingDelta", () => {
  it("takes the short way across north", () => {
    expect(shortestHeadingDelta(350, 10)).toBe(20)
    expect(shortestHeadingDelta(10, 350)).toBe(-20)
    expect(shortestHeadingDelta(0, 90)).toBe(90)
    expect(shortestHeadingDelta(90, 0)).toBe(-90)
    expect(shortestHeadingDelta(0, 180)).toBe(-180)
  })
})

describe("headingAlpha", () => {
  it("is low at crawl speed and high when moving", () => {
    expect(headingAlpha(0)).toBe(0.08)
    expect(headingAlpha(1.9)).toBe(0.08)
    expect(headingAlpha(2)).toBe(0.25)
    expect(headingAlpha(7.9)).toBe(0.25)
    expect(headingAlpha(8)).toBe(0.45)
    expect(headingAlpha(null)).toBe(0.08)
  })
})

describe("courseOverGround", () => {
  it("points north / south / east / west along the axes", () => {
    // 1 degree of latitude ≈ 111 km; use small deltas for clarity.
    expect(courseOverGround(0, 0, 0.001, 0)).toBeCloseTo(0, 3)
    expect(courseOverGround(0.001, 0, 0, 0)).toBeCloseTo(180, 3)
    expect(courseOverGround(0, 0, 0, 0.001)).toBeCloseTo(90, 3)
    expect(courseOverGround(0, 0.001, 0, 0)).toBeCloseTo(270, 3)
  })

  it("stays in [0, 360)", () => {
    for (let i = 0; i < 16; i++) {
      const bearing = courseOverGround(-30.6, 116.1, -30.6 + i * 0.001, 116.1)
      expect(bearing).toBeGreaterThanOrEqual(0)
      expect(bearing).toBeLessThan(360)
    }
  })
})

describe("smoothHeading", () => {
  it("adopts the first fix", () => {
    expect(smoothHeading(null, 137, 20)).toBe(137)
  })

  it("crosses north without swinging the long way", () => {
    // The old degree-EMA landed near 214° here (a backward swing).
    let h = 350
    for (const raw of [10, 12, 14, 16]) {
      const prev = h
      h = smoothHeading(h, raw, 20) as number

      // Small step, and always along the short arc towards the target
      expect(Math.abs(shortestHeadingDelta(prev, h))).toBeLessThan(20)
      expect(shortestHeadingDelta(h, raw)).toBeGreaterThanOrEqual(0)
      // Never drifts more than ~45° away from the starting bearing
      expect(Math.abs(shortestHeadingDelta(350, h))).toBeLessThan(45)
    }
  })

  it("converges towards the new bearing", () => {
    let h = 350 as number | null
    for (let i = 0; i < 40; i++) h = smoothHeading(h, 10, 30)
    expect(Math.abs(shortestHeadingDelta(h as number, 10))).toBeLessThan(1)
  })

  it("holds the last heading when a fix has no bearing", () => {
    expect(smoothHeading(123, null, 0)).toBe(123)
    expect(smoothHeading(123, NaN, 0)).toBe(123)
    expect(smoothHeading(null, null, 0)).toBeNull()
  })

  it("stays in range for a full sweep of headings", () => {
    let h = 0 as number | null
    for (let raw = 0; raw < 720; raw += 7) {
      h = smoothHeading(h, raw % 360, 12) as number
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })
})
