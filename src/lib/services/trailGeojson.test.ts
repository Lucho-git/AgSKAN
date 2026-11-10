import { describe, expect, it } from "vitest"
import { createFakeSupabase } from "$lib/test/fakeSupabase"
import { fetchTrailGeojson } from "./trailGeojson"

const line = {
  type: "LineString",
  coordinates: [
    [151, -33],
    [151.1, -33.1],
  ],
}

describe("fetchTrailGeojson", () => {
  it("calls the RPC with the trail id and returns the path", async () => {
    const sb = createFakeSupabase()
    sb.respond("get_trail_geojson", "rpc", {
      data: { path_geojson: line },
      error: null,
    })
    expect(await fetchTrailGeojson(sb, "t1")).toEqual(line)
    expect(sb.calls("get_trail_geojson", "rpc")[0].payload).toEqual({
      p_trail_id: "t1",
    })
  })

  it("accepts multi-line paths", async () => {
    const sb = createFakeSupabase()
    const multi = { type: "MultiLineString", coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] }
    sb.respond("get_trail_geojson", "rpc", { data: { path_geojson: multi }, error: null })
    expect(await fetchTrailGeojson(sb, "t1")).toEqual(multi)
  })

  it("returns null for unusable geometry", async () => {
    const sb = createFakeSupabase()
    sb.respond(
      "get_trail_geojson",
      "rpc",
      { data: { path_geojson: { type: "LineString", coordinates: [[0, 0]] } }, error: null },
      { data: { path_geojson: { type: "Point", coordinates: [0, 0] } }, error: null },
      { data: null, error: null },
    )
    expect(await fetchTrailGeojson(sb, "t1")).toBeNull()
    expect(await fetchTrailGeojson(sb, "t1")).toBeNull()
    expect(await fetchTrailGeojson(sb, "t1")).toBeNull()
  })

  it("throws RPC errors", async () => {
    const sb = createFakeSupabase()
    sb.respond("get_trail_geojson", "rpc", { data: null, error: { message: "denied" } })
    await expect(fetchTrailGeojson(sb, "t1")).rejects.toEqual({ message: "denied" })
  })
})
