import { describe, expect, it } from "vitest"
import { mergeVehicleSnapshot, type VehicleRow } from "./vehicleSnapshot"

const v = (
  id: string,
  minute: number,
  extra: Record<string, unknown> = {},
): VehicleRow => ({
  vehicle_id: id,
  last_update: new Date(Date.UTC(2026, 10, 12, 3, minute)).toISOString(),
  ...extra,
})

const ids = (list: { vehicle_id: string }[]) =>
  list.map((x) => x.vehicle_id).sort()

describe("mergeVehicleSnapshot", () => {
  it("keeps every vehicle on the map when the fresh read comes back empty", () => {
    const existing = [v("a", 1), v("b", 1)]
    expect(
      ids(mergeVehicleSnapshot(existing, [], new Set(["a", "b"]))),
    ).toEqual(["a", "b"])
  })

  it("never removes anyone when the team list could not be confirmed", () => {
    const existing = [v("a", 1), v("b", 1)]
    expect(ids(mergeVehicleSnapshot(existing, [v("a", 2)], null))).toEqual([
      "a",
      "b",
    ])
    expect(ids(mergeVehicleSnapshot(existing, [v("a", 2)], new Set()))).toEqual(
      ["a", "b"],
    )
  })

  it("adds vehicles that joined after the page loaded", () => {
    const merged = mergeVehicleSnapshot(
      [v("a", 1)],
      [v("a", 1), v("new", 2)],
      new Set(["a", "new"]),
    )
    expect(ids(merged)).toEqual(["a", "new"])
  })

  it("drops a vehicle only when its owner has left the map", () => {
    const merged = mergeVehicleSnapshot(
      [v("a", 1), v("gone", 1)],
      [v("a", 2), v("gone", 2)],
      new Set(["a"]),
    )
    expect(ids(merged)).toEqual(["a"])
  })

  it("takes the fresh row when it is newer, keeping fields it does not carry", () => {
    const [merged] = mergeVehicleSnapshot(
      [v("a", 1, { full_name: "Sam", coordinates: "(1,1)" })],
      [v("a", 5, { coordinates: "(2,2)" })],
      new Set(["a"]),
    )
    expect(merged.coordinates).toBe("(2,2)")
    expect(merged.full_name).toBe("Sam")
  })

  it("keeps the live position when it is newer than the snapshot", () => {
    const [merged] = mergeVehicleSnapshot(
      [v("a", 9, { coordinates: "(9,9)" })],
      [v("a", 5, { coordinates: "(5,5)", full_name: "Sam" })],
      new Set(["a"]),
    )
    expect(merged.coordinates).toBe("(9,9)")
    expect(merged.last_update).toBe(v("a", 9).last_update)
    expect(merged.full_name).toBe("Sam")
  })

  it("ignores rows without an id and tolerates missing timestamps", () => {
    const merged = mergeVehicleSnapshot(
      [{ vehicle_id: "a" }],
      [{ vehicle_id: "" }, { vehicle_id: "a", last_update: null, speed: 3 }],
      null,
    )
    expect(merged).toEqual([{ vehicle_id: "a", last_update: null, speed: 3 }])
  })
})
