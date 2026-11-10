import { describe, expect, it } from "vitest"
import {
  getAllOuterRings,
  getBoundsFromBoundary,
  getFieldCentroid,
} from "./boundaryGeometry"

const square = (x: number, y: number, s: number) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
]

const polygon = {
  type: "Polygon",
  coordinates: [square(0, 0, 2), square(0.5, 0.5, 0.5)], // outer + hole
}
const multi = {
  type: "MultiPolygon",
  coordinates: [[square(0, 0, 1)], [square(10, 10, 1)]],
}

describe("getAllOuterRings", () => {
  it("ignores holes", () => {
    expect(getAllOuterRings(polygon)).toEqual(square(0, 0, 2))
  })
  it("flattens multipolygon outer rings", () => {
    expect(getAllOuterRings(multi)).toHaveLength(8)
  })
  it("returns nothing for other geometry", () => {
    expect(getAllOuterRings({ type: "Point", coordinates: [0, 0] })).toEqual([])
  })
})

describe("getBoundsFromBoundary", () => {
  it("spans every part", () => {
    expect(getBoundsFromBoundary(multi)).toEqual([
      [0, 0],
      [11, 11],
    ])
  })
})

describe("getFieldCentroid", () => {
  it("averages the outer ring", () => {
    expect(getFieldCentroid(polygon)).toEqual([1, 1])
  })
  it("is null without coordinates", () => {
    expect(getFieldCentroid({ type: "LineString" })).toBeNull()
  })
})
