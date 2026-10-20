import { describe, it, expect } from "vitest"
import { buildClosePaths } from "./trailPauseSplit"
import type { LatLngTimePoint, TrailPauseWindow } from "./trailPauseSplit"

// No-op simplifier: keeps the assertions readable.
const same = <T,>(part: T[]) => part

const pt = (minute: number): LatLngTimePoint => ({
  longitude: 116.9 + minute / 1000,
  latitude: -30.34 + minute / 1000,
  timestamp: Date.UTC(2026, 9, 14, 6, minute, 0),
})

describe("buildClosePaths", () => {
  it("returns a single LINESTRING when the trail has no pauses", () => {
    const points = [pt(0), pt(1), pt(2)]
    const result = buildClosePaths(points, [], same)

    expect(result.path).toMatch(/^SRID=4326;LINESTRING\(/)
    expect(result.detailedPath).toMatch(/^SRID=4326;LINESTRING M\(/)
    expect(result.pausePath).toBeNull()
    expect(result.pauseDetailedPath).toBeNull()
  })

  it("keeps work and pause geometry separate for a normal paused trail", () => {
    // 0,1,2 work -> paused -> 3,4 recorded while paused -> resumed -> 5,6 work
    const points = [pt(0), pt(1), pt(2), pt(3), pt(4), pt(5), pt(6)]
    const pauses: TrailPauseWindow[] = [
      { pausedAt: pt(2).timestamp + 1000, resumedAt: pt(4).timestamp + 1000 },
    ]

    const result = buildClosePaths(points, pauses, same)

    expect(result.path).toMatch(/^SRID=4326;MULTILINESTRING\(/)
    expect(result.pausePath).toMatch(/^SRID=4326;LINESTRING\(/)
    // Pause geometry stays separate: it is not merged into the work path.
    expect(result.path).not.toBe(result.pausePath)
  })

  it("promotes pause geometry when every point was recorded while paused", () => {
    // This is the real 2026-10-14 case: paused almost immediately, stopped
    // while still paused. Previously stored path = NULL.
    const points = [pt(1), pt(2), pt(3), pt(4)]
    const pauses: TrailPauseWindow[] = [
      { pausedAt: pt(1).timestamp - 1000, resumedAt: null },
    ]

    const result = buildClosePaths(points, pauses, same)

    expect(result.path).not.toBeNull()
    expect(result.detailedPath).not.toBeNull()
    // Promoted, not duplicated: the connector would otherwise be drawn twice.
    expect(result.pausePath).toBeNull()
    expect(result.pauseDetailedPath).toBeNull()
  })

  it("falls back to the unsplit path when no part has two points", () => {
    const points = [pt(0), pt(1)]
    const pauses: TrailPauseWindow[] = [
      { pausedAt: pt(0).timestamp + 1, resumedAt: null },
    ]

    const result = buildClosePaths(points, pauses, same)

    expect(result.path).toMatch(/^SRID=4326;LINESTRING\(/)
    expect(result.detailedPath).toMatch(/^SRID=4326;LINESTRING M\(/)
  })

  it("never returns a path for fewer than two points", () => {
    const result = buildClosePaths([pt(0)], [], same)

    expect(result.path).toBeNull()
    expect(result.detailedPath).toBeNull()
  })

  it("applies the simplifier to the display path but not the detailed path", () => {
    const simplified: string[] = []
    const simplify = <T,>(part: T[]) => {
      simplified.push(`part:${part.length}`)
      return part
    }

    buildClosePaths([pt(0), pt(1), pt(2)], [], simplify)

    expect(simplified).toContain("part:3")
  })
})
