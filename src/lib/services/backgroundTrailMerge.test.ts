import { describe, expect, it } from "vitest"
import { createFakeSupabase } from "$lib/test/fakeSupabase"
import {
  fetchMissingTrailPoints,
  mergeTrailPath,
  newPointsFromStream,
} from "./backgroundTrailMerge"

const row = (lng: number, lat: number, timestamp: string | number) => ({
  coordinate: { coordinates: [lng, lat] as [number, number] },
  timestamp,
})

describe("newPointsFromStream", () => {
  it("keeps rows whose timestamps aren't already present", () => {
    const iso = "2026-01-01T00:00:01.000Z"
    const out = newPointsFromStream(
      [row(151, -33, 1000), row(151.1, -33.1, iso)],
      [{ timestamp: 1000 }],
    )
    expect(out).toEqual([
      {
        coordinates: { latitude: -33.1, longitude: 151.1 },
        timestamp: Date.parse(iso),
      },
    ])
  })
})

describe("mergeTrailPath", () => {
  it("concatenates and sorts by time", () => {
    expect(
      mergeTrailPath([{ timestamp: 3 }, { timestamp: 1 }], [{ timestamp: 2 }]),
    ).toEqual([{ timestamp: 1 }, { timestamp: 2 }, { timestamp: 3 }])
    expect(mergeTrailPath(null, [{ timestamp: 2 }])).toEqual([{ timestamp: 2 }])
  })
})

describe("fetchMissingTrailPoints", () => {
  it("queries trail_stream for the trail in time order", async () => {
    const sb = createFakeSupabase()
    sb.respond("trail_stream", "select", {
      data: [row(151, -33, 1000), row(151, -33, 2000)],
      error: null,
    })
    const out = await fetchMissingTrailPoints(sb, {
      id: "t1",
      path: [{ timestamp: 1000 }],
    })
    expect(out.total).toBe(2)
    expect(out.newPoints.map((p) => p.timestamp)).toEqual([2000])

    const [call] = sb.calls("trail_stream", "select")
    expect(call.payload).toBe("coordinate, timestamp")
    expect(call.filters).toEqual([
      ["eq", "trail_id", "t1"],
      ["order", "timestamp", { ascending: true }],
    ])
  })

  it("returns nothing on error or an empty stream", async () => {
    const sb = createFakeSupabase()
    sb.respond(
      "trail_stream",
      "select",
      { data: null, error: { message: "boom" } },
      { data: [], error: null },
    )
    expect(await fetchMissingTrailPoints(sb, { id: "t1" })).toEqual({
      total: 0,
      newPoints: [],
    })
    expect(await fetchMissingTrailPoints(sb, { id: "t1" })).toEqual({
      total: 0,
      newPoints: [],
    })
  })
})
