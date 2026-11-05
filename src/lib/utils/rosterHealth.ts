// src/lib/utils/rosterHealth.ts
//
// Pure predicates for "is the team roster fully loaded?".
//
// The roster is assembled from two independent queries; when only the
// vehicle_state half fails, names render but every row loses its icon and
// shows "Offline". Detecting that shape is what lets the panel repair itself,
// and keeping it pure keeps it testable without a Supabase client.

export interface RosterProfileLike {
  id: string
}

export interface RosterVehicleLike {
  vehicle_id: string
}

export interface RosterStateLike {
  connected_profiles?: RosterProfileLike[] | null
  vehicle_states?: RosterVehicleLike[] | null
}

/** Members present in the roster who have no vehicle row at all. */
export function profilesMissingVehicleState(
  state: RosterStateLike,
): RosterProfileLike[] {
  const profiles = state.connected_profiles ?? []
  if (profiles.length === 0) return []

  const known = new Set(
    (state.vehicle_states ?? []).map((vehicle) => vehicle.vehicle_id),
  )
  return profiles.filter((profile) => !known.has(profile.id))
}

/**
 * True when the roster cannot render icons/online state for every member.
 * A roster with no members is not "incomplete" — it is simply empty.
 */
export function isRosterIncomplete(state: RosterStateLike): boolean {
  return profilesMissingVehicleState(state).length > 0
}
