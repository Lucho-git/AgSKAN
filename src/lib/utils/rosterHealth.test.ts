import { describe, it, expect } from "vitest"
import {
  isRosterIncomplete,
  profilesMissingVehicleState,
} from "./rosterHealth"

const profiles = [{ id: "a" }, { id: "b" }, { id: "c" }]

describe("profilesMissingVehicleState", () => {
  it("returns nothing when every member has a vehicle row", () => {
    const state = {
      connected_profiles: profiles,
      vehicle_states: [{ vehicle_id: "a" }, { vehicle_id: "b" }, { vehicle_id: "c" }],
    }
    expect(profilesMissingVehicleState(state)).toEqual([])
    expect(isRosterIncomplete(state)).toBe(false)
  })

  it("flags the exact members whose vehicle row is missing", () => {
    const state = {
      connected_profiles: profiles,
      vehicle_states: [{ vehicle_id: "b" }],
    }
    expect(profilesMissingVehicleState(state).map((p) => p.id)).toEqual([
      "a",
      "c",
    ])
    expect(isRosterIncomplete(state)).toBe(true)
  })

  it("is the reported bug: names present, vehicle_states empty", () => {
    const state = { connected_profiles: profiles, vehicle_states: [] }
    expect(profilesMissingVehicleState(state)).toHaveLength(3)
    expect(isRosterIncomplete(state)).toBe(true)
  })

  it("treats a half-loaded roster as incomplete when only some arrived", () => {
    const state = {
      connected_profiles: profiles,
      vehicle_states: [{ vehicle_id: "a" }, { vehicle_id: "b" }],
    }
    expect(isRosterIncomplete(state)).toBe(true)
  })

  it("does not call an empty roster incomplete", () => {
    expect(isRosterIncomplete({ connected_profiles: [], vehicle_states: [] })).toBe(
      false,
    )
  })

  it("survives null/undefined halves", () => {
    expect(isRosterIncomplete({})).toBe(false)
    expect(
      isRosterIncomplete({ connected_profiles: profiles, vehicle_states: null }),
    ).toBe(true)
    expect(isRosterIncomplete({ connected_profiles: null })).toBe(false)
  })
})
