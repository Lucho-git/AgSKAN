import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeSupabase, type FakeSupabase } from "$lib/test/fakeSupabase"
import {
  closeTrailWithPath,
  handleOpenTrails,
  processAndCloseTrail,
} from "./closeTrailsService"

let sb: FakeSupabase
const client = () => sb as any

beforeEach(() => {
  sb = createFakeSupabase()
  vi.spyOn(console, "log").mockImplementation(() => {})
})

// ~11 m steps east, 10 s apart: a believable tractor pace.
const straightLine = (n: number, t0 = Date.UTC(2026, 10, 10)) =>
  Array.from({ length: n }, (_, i) => ({
    longitude: 115.86 + i * 0.0001,
    latitude: -31.95,
    timestamp: t0 + i * 10_000,
  }))

const streamRow = (p: {
  longitude: number
  latitude: number
  timestamp: number
}) => ({
  coordinate: { coordinates: [p.longitude, p.latitude] },
  timestamp: new Date(p.timestamp).toISOString(),
})

describe("closeTrailWithPath", () => {
  it("sends a simplified 2D path and a detailed path with M = timestamp", async () => {
    const path = straightLine(5)
    await closeTrailWithPath(client(), "t1", "2026-11-10T01:00:00Z", path)

    const [call] = sb.calls("close_trail", "rpc")
    const args = call.payload as Record<string, string>
    expect(args.trail_id_param).toBe("t1")
    expect(args.end_time_param).toBe("2026-11-10T01:00:00Z")

    // Straight line simplifies to its two ends.
    expect(args.path_param).toBe(
      `SRID=4326;LINESTRING(${path[0].longitude} ${path[0].latitude},${path[4].longitude} ${path[4].latitude})`,
    )
    expect(args.detailed_path_param.startsWith("SRID=4326;LINESTRING M(")).toBe(
      true,
    )
    expect(args.detailed_path_param.split(",")).toHaveLength(5)
    expect(args.detailed_path_param).toContain(
      `${path[0].longitude} ${path[0].latitude} ${path[0].timestamp}`,
    )
  })

  it("drops a GPS glitch from both paths before closing", async () => {
    const path = straightLine(6)
    // One point 50 km away, 10 s after its neighbours.
    path.splice(3, 0, {
      longitude: 116.4,
      latitude: -31.95,
      timestamp: path[2].timestamp + 5_000,
    })

    await closeTrailWithPath(client(), "t1", "end", path)

    const args = sb.calls("close_trail", "rpc")[0].payload as Record<
      string,
      string
    >
    expect(args.detailed_path_param).not.toContain("116.4 ")
    expect(args.detailed_path_param.split(",")).toHaveLength(6)
  })

  it("closes with null paths when there are no points", async () => {
    await closeTrailWithPath(client(), "t1", "end", [])

    const args = sb.calls("close_trail", "rpc")[0].payload as Record<
      string,
      unknown
    >
    expect(args.path_param).toBeNull()
    expect(args.detailed_path_param).toBeNull()
  })
})

describe("processAndCloseTrail", () => {
  it("deletes a trail that has fewer than 3 points", async () => {
    sb.respond("trail_stream", "select", {
      data: straightLine(2).map(streamRow),
      error: null,
    })

    const result = await processAndCloseTrail(client(), "t1")

    expect(result).toEqual({ deleted: true, reason: "insufficient_points" })
    expect(sb.calls("trail_stream", "delete")[0].filters).toContainEqual([
      "eq",
      "trail_id",
      "t1",
    ])
    expect(sb.calls("trails", "delete")[0].filters).toContainEqual([
      "eq",
      "id",
      "t1",
    ])
    expect(sb.calls("close_trail", "rpc")).toHaveLength(0)
  })

  it("closes the trail at its last streamed point", async () => {
    const pts = straightLine(4)
    sb.respond("trail_stream", "select", {
      data: pts.map(streamRow),
      error: null,
    })

    await processAndCloseTrail(client(), "t1")

    const args = sb.calls("close_trail", "rpc")[0].payload as Record<
      string,
      string
    >
    expect(args.end_time_param).toBe(new Date(pts[3].timestamp).toISOString())
  })

  it("throws when the points can't be fetched", async () => {
    sb.respond("trail_stream", "select", {
      data: null,
      error: { message: "timeout" },
    })
    await expect(processAndCloseTrail(client(), "t1")).rejects.toThrow(
      "timeout",
    )
  })
})

describe("handleOpenTrails", () => {
  const minutesAgo = (m: number) =>
    new Date(Date.now() - m * 60_000).toISOString()

  it("returns nothing to do when the vehicle has no open trails", async () => {
    sb.respond("trails", "select", { data: [], error: null })

    const result = await handleOpenTrails(client(), "v1")

    expect(result).toEqual({ mostRecentTrail: null, processedTrails: [] })
  })

  it("keeps a fresh trail open and closes every older open trail", async () => {
    sb.respond("trails", "select", {
      data: [{ id: "new" }, { id: "old" }],
      error: null,
    })
    sb.respond("trail_stream", "select", (call) => {
      const isOld = call.filters.some((f) => f[0] === "eq" && f[2] === "old")
      const isFreshnessCheck = call.filters.some((f) => f[0] === "limit")
      if (isFreshnessCheck)
        return {
          data: [{ timestamp: minutesAgo(isOld ? 600 : 5) }],
          error: null,
        }
      return { data: straightLine(4).map(streamRow), error: null }
    })

    const result = await handleOpenTrails(client(), "v1", undefined, {
      timeoutMinutes: 60,
    })

    expect(result.mostRecentTrail).toEqual({ id: "new" })
    expect(result.staleTrailClosed).toBe(false)
    expect(result.processedTrails.map((p) => p.trail_id)).toEqual(["old"])
    expect(
      sb
        .calls("close_trail", "rpc")
        .map((c) => (c.payload as any).trail_id_param),
    ).toEqual(["old"])
  })

  it("closes the most recent trail when it has gone stale", async () => {
    sb.respond("trails", "select", { data: [{ id: "only" }], error: null })
    sb.respond("trail_stream", "select", (call) =>
      call.filters.some((f) => f[0] === "limit")
        ? { data: [{ timestamp: minutesAgo(120) }], error: null }
        : { data: straightLine(4).map(streamRow), error: null },
    )

    const result = await handleOpenTrails(client(), "v1", undefined, {
      timeoutMinutes: 60,
    })

    expect(result.mostRecentTrail).toBeNull()
    expect(result.staleTrailClosed).toBe(true)
    expect(result.processedTrails[0].trail_id).toBe("only")
  })

  it("leaves a stale trail open when closeStaleTrails is off", async () => {
    sb.respond("trails", "select", { data: [{ id: "only" }], error: null })
    sb.respond("trail_stream", "select", {
      data: [{ timestamp: minutesAgo(120) }],
      error: null,
    })

    const result = await handleOpenTrails(client(), "v1", undefined, {
      timeoutMinutes: 60,
      closeStaleTrails: false,
    })

    expect(result.mostRecentTrail).toEqual({ id: "only" })
    expect(sb.calls("close_trail", "rpc")).toHaveLength(0)
  })

  it("falls back to the trail's start time when it has no points", async () => {
    sb.respond(
      "trails",
      "select",
      { data: [{ id: "only" }], error: null },
      { data: { start_time: minutesAgo(10) }, error: null },
    )
    sb.respond("trail_stream", "select", { data: [], error: null })

    const result = await handleOpenTrails(client(), "v1", undefined, {
      timeoutMinutes: 60,
    })

    expect(result.mostRecentTrail).toEqual({ id: "only" })
    expect(result.staleTrailClosed).toBe(false)
  })

  it("scopes the lookup to an operation when one is given", async () => {
    sb.respond("trails", "select", { data: [], error: null })

    await handleOpenTrails(client(), "v1", "op-9")

    expect(sb.calls("trails", "select")[0].filters).toContainEqual([
      "eq",
      "operation_id",
      "op-9",
    ])
  })
})
