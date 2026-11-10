import { describe, expect, it, vi } from "vitest"

vi.mock("./vehicleDisplayName", () => ({
  getVehicleDisplayName: (v: any) => `Preset ${v?.vehicle_marker?.type ?? "?"}`,
}))

import {
  broadcastStartToast,
  broadcastStyle,
  buildVehicleList,
  isRecentlyActive,
  planEdgeBadges,
  staleEdgeBadgeIds,
  upsertVehicle,
  VEHICLE_TRACK_ACTIVE_MS,
} from "./vehicleBadges"

const NOW = 1_000_000_000
const marker = { type: "Header", bodyColor: "Red", size: 40, swath: 9 }

const me = {
  vehicle_id: "me-1",
  coordinates: { latitude: -33, longitude: 151 },
  last_update: NOW - 1000,
  vehicle_marker: marker,
  heading: 45,
}
const other = (over: Record<string, any> = {}) => ({
  vehicle_id: "v2",
  full_name: "Kim Smith",
  coordinates: "(150.5,-34.5)",
  last_update: NOW - 1000,
  vehicle_marker: marker,
  heading: 10,
  ...over,
})

describe("buildVehicleList", () => {
  it("puts you first and drops vehicles without a position", () => {
    const list = buildVehicleList(me, [
      other(),
      other({ vehicle_id: "v3", coordinates: null }),
    ])
    expect(list.map((v) => v.id)).toEqual(["me-1", "v2"])
    expect(list[0]).toMatchObject({ name: "You", isCurrentUser: true })
    expect(list[1]).toMatchObject({ name: "Kim Smith", vehicleType: "Header" })
  })

  it("falls back to the preset name and defaults", () => {
    const [, v] = buildVehicleList(me, [
      other({ full_name: null, vehicle_marker: { type: "Ute" } }),
    ])
    expect(v.name).toBe("Preset Ute")
    expect(v.bodyColor).toBe("red")
  })
})

describe("broadcastStyle", () => {
  it("uses the sender's colour, then legacy colours", () => {
    expect(broadcastStyle({ flash_reason: "full", flash_color: "#123456" })).toEqual({
      color: "#123456",
      reason: "FULL",
    })
    expect(broadcastStyle({ flash_reason: "empty" }).color).toBe("#8b5cf6")
    expect(broadcastStyle({})).toEqual({ color: "#f59e0b", reason: "BROADCAST" })
  })
})

describe("isRecentlyActive", () => {
  it("is true within 3 minutes", () => {
    expect(isRecentlyActive(NOW - VEHICLE_TRACK_ACTIVE_MS + 1, NOW)).toBe(true)
    expect(isRecentlyActive(NOW - VEHICLE_TRACK_ACTIVE_MS, NOW)).toBe(false)
    expect(isRecentlyActive(null, NOW)).toBe(false)
    expect(isRecentlyActive("garbage", NOW)).toBe(false)
  })
})

describe("planEdgeBadges", () => {
  const plan = (o: Partial<Parameters<typeof planEdgeBadges>[0]>) =>
    planEdgeBadges({
      enabled: true,
      vehiclesVisible: true,
      userVehicle: me,
      otherVehicles: [other()],
      now: NOW,
      ...o,
    })

  it("adds active vehicles when enabled", () => {
    const badges = plan({})
    expect(badges.map((b) => b.id)).toEqual([
      "vehicle-track-me-1",
      "vehicle-track-v2",
    ])
    expect(badges[0]).toMatchObject({
      label: "You",
      color: "#ef4444",
      heading: 45,
      broadcast: false,
      vehicleType: "Header",
      componentProps: { bodyColor: "Red", size: "22px", swath: 9 },
    })
    expect(badges[1].coordinates).toEqual([150.5, -34.5])
  })

  it("adds nothing for quiet vehicles when disabled or hidden", () => {
    expect(plan({ enabled: false })).toEqual([])
    expect(plan({ vehiclesVisible: false })).toEqual([])
  })

  it("skips stale vehicles", () => {
    expect(
      plan({ otherVehicles: [other({ last_update: NOW - 10 * 60 * 1000 })] }).map(
        (b) => b.id,
      ),
    ).toEqual(["vehicle-track-me-1"])
  })

  it("always shows broadcasting vehicles, once, in the broadcast colour", () => {
    const badges = plan({
      enabled: false,
      otherVehicles: [
        other({ is_flashing: true, flash_reason: "help", last_update: 0 }),
      ],
    })
    expect(badges).toHaveLength(1)
    expect(badges[0]).toMatchObject({
      id: "vehicle-track-v2",
      label: "Kim Smith — broadcasting HELP",
      color: "#ef4444",
      heading: undefined,
      broadcast: true,
    })
    const both = plan({ otherVehicles: [other({ is_flashing: true })] })
    expect(both.filter((b) => b.id === "vehicle-track-v2")).toHaveLength(1)
  })

  it("labels your own broadcast", () => {
    const [b] = plan({
      userVehicle: { ...me, is_flashing: true, flash_reason: "Full" },
      otherVehicles: [],
    })
    expect(b.label).toBe("You — broadcasting FULL")
  })

  it("clamps the icon size", () => {
    const [b] = plan({
      userVehicle: { ...me, vehicle_marker: { size: 200 } },
      otherVehicles: [],
    })
    expect(b.componentProps.size).toBe("30px")
    expect(b.vehicleType).toBe("SimpleTractor")
    expect(b.color).toBe("#eab308")
  })
})

describe("staleEdgeBadgeIds", () => {
  it("returns vehicle badges that aren't wanted, ignoring other items", () => {
    expect(
      staleEdgeBadgeIds(
        [
          { id: "vehicle-track-a" },
          { id: "vehicle-track-b" },
          { id: "marker-1" },
          {},
        ],
        ["vehicle-track-a"],
      ),
    ).toEqual(["vehicle-track-b"])
  })
})

describe("broadcastStartToast", () => {
  it("fires only when a known vehicle starts broadcasting", () => {
    const change = { is_flashing: true, full_name: "Kim", flash_reason: "full" }
    expect(broadcastStartToast(change, undefined)).toBeNull()
    expect(broadcastStartToast(change, { is_flashing: true })).toBeNull()
    expect(broadcastStartToast({ ...change, is_flashing: false }, {})).toBeNull()
    expect(broadcastStartToast(change, { is_flashing: false })).toEqual({
      level: "warning",
      title: "📢 FULL Broadcast",
      description: "Kim is broadcasting FULL",
      duration: 8000,
      style: "border-left: 4px solid #f59e0b;",
    })
  })

  it("escalates help requests", () => {
    const t = broadcastStartToast(
      { is_flashing: true, full_name: "Kim", flash_reason: "Help", flash_color: "#f00" },
      {},
    )
    expect(t).toMatchObject({
      level: "error",
      title: "🆘 HELP Broadcast",
      description: "Kim needs assistance!",
      duration: 45000,
      style: "border-left: 4px solid #f00;",
    })
  })
})

describe("upsertVehicle", () => {
  it("merges into an existing row in place", () => {
    const list = [{ vehicle_id: "a", full_name: "A", speed: 1 }]
    const out = upsertVehicle(list, { vehicle_id: "a", speed: 9 })
    expect(out).toBe(list)
    expect(list).toEqual([{ vehicle_id: "a", full_name: "A", speed: 9 }])
  })

  it("appends new vehicles", () => {
    const list: any[] = []
    upsertVehicle(list, { vehicle_id: "b", speed: 2 })
    expect(list).toEqual([{ vehicle_id: "b", speed: 2 }])
  })
})
