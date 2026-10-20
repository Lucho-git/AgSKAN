import { describe, it, expect } from "vitest"
import { writable } from "svelte/store"
import { createTrailGeoJSON } from "./trailGeometry"

describe("createTrailGeoJSON", () => {
  it("returns an empty FeatureCollection when the trail has no path", () => {
    expect(createTrailGeoJSON(null)).toEqual({
      type: "FeatureCollection",
      features: [],
    })
  })

  it("returns an empty FeatureCollection for the legacy RPC wrapper shape", () => {
    // get_trail_path_as_geojson returns this for a trail whose geometry is NULL.
    expect(
      createTrailGeoJSON({ path: null, pause_path: null } as never),
    ).toEqual({ type: "FeatureCollection", features: [] })
  })

  it("passes a LineString through unchanged", () => {
    const line = {
      type: "LineString" as const,
      coordinates: [
        [116.9, -30.3],
        [116.91, -30.31],
      ] as [number, number][],
    }

    expect(createTrailGeoJSON(line)).toEqual({
      type: "Feature",
      properties: {},
      geometry: line,
    })
  })

  it("converts timestamped coordinates into a sorted LineString", () => {
    const result = createTrailGeoJSON([
      { coordinates: { longitude: 2, latitude: 2 }, timestamp: 200 },
      { coordinates: { longitude: 1, latitude: 1 }, timestamp: 100 },
    ])

    expect(result).toEqual({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [1, 1],
          [2, 2],
        ],
      },
    })
  })

  it("does not poison later store updates when a trail has no path", () => {
    // HistoricalTrailManager renders trails from a store subscription. A
    // throw there leaves Svelte's shared subscriber queue unflushed, which
    // silently stops every store in the app from updating.
    const trails = writable<{ id: string; path: unknown }[]>([])
    const loading = writable(false)
    let loadingSeen = false
    const loadingUnsub = loading.subscribe((value) => {
      loadingSeen = value
    })

    let first = true
    const trailsUnsub = trails.subscribe((list) => {
      if (first) {
        first = false
        return
      }
      for (const trail of list) createTrailGeoJSON(trail.path as never)
    })

    loading.set(true)
    expect(() =>
      trails.set([{ id: "empty", path: null }]),
    ).not.toThrow()
    trailsUnsub()

    loading.set(false)
    loadingUnsub()
    expect(loadingSeen).toBe(false)
  })
})
