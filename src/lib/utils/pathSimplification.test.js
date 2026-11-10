// @ts-nocheck -- plain-JS test; the module under test is untyped JS
import { beforeEach, describe, expect, it, vi } from "vitest"
import { simplifyPath } from "./pathSimplification"

const p = (x, y) => ({ coordinates: `(${x},${y})` })
const xy = (pts) => pts.map((q) => q.coordinates)

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("simplifyPath", () => {
  it("returns paths of two points or fewer unchanged", () => {
    const pts = [p(0, 0), p(1, 1)]
    expect(simplifyPath(pts, 0.1)).toBe(pts)
  })

  it("collapses collinear points to the end points", () => {
    const pts = [p(0, 0), p(1, 0), p(2, 0), p(3, 0)]
    expect(xy(simplifyPath(pts, 0.01))).toEqual(["(0,0)", "(3,0)"])
  })

  it("keeps a corner that deviates more than the tolerance", () => {
    const pts = [p(0, 0), p(1, 0), p(2, 0), p(2, 1), p(2, 2)]
    expect(xy(simplifyPath(pts, 0.01))).toEqual(["(0,0)", "(2,0)", "(2,2)"])
  })

  it("drops wiggles smaller than the tolerance", () => {
    const pts = [p(0, 0), p(1, 0.001), p(2, -0.001), p(3, 0)]
    expect(xy(simplifyPath(pts, 0.01))).toEqual(["(0,0)", "(3,0)"])
  })

  it("keeps the shape of a loop that ends where it started", () => {
    // A run out to the far side of a paddock and back to the gate.
    const loop = [p(0, 0), p(1, 0), p(1, 1), p(0, 1), p(0, 0)]
    const out = xy(simplifyPath(loop, 0.01))
    expect(out[0]).toBe("(0,0)")
    expect(out[out.length - 1]).toBe("(0,0)")
    expect(out).toContain("(1,1)")
    expect(out.length).toBeGreaterThan(2)
  })

  it("keeps the original point objects", () => {
    const pts = [p(0, 0), p(1, 5), p(2, 0)]
    const out = simplifyPath(pts, 0.01)
    expect(out[1]).toBe(pts[1])
  })
})
