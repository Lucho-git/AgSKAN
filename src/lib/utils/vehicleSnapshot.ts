// Merging a fresh read of `vehicle_state` into the vehicles already on the map.
//
// Used when the realtime channel reconnects. The rule that matters: a failed or
// partial read must never make vehicles vanish. Vehicles are only dropped when
// we have a trustworthy team list that says their owner has left the map.

export interface VehicleRow {
  vehicle_id: string
  last_update?: string | number | null
  [key: string]: unknown
}

function updateTime(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const t = new Date(value).getTime()
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

/**
 * @param existing  vehicles currently known (what the map is showing)
 * @param fresh     rows just read from the database, already filtered to this
 *                  map's team and enriched with profile fields
 * @param connectedIds  ids of everyone on the map, or null when the team list
 *                  could not be confirmed (then nothing is removed)
 */
export function mergeVehicleSnapshot<T extends VehicleRow>(
  existing: T[],
  fresh: T[],
  connectedIds: Set<string> | null,
): T[] {
  const canPrune = !!connectedIds && connectedIds.size > 0
  const merged = new Map<string, T>()

  for (const vehicle of existing || []) {
    if (!vehicle?.vehicle_id) continue
    // Owner has left the map — the only reason a vehicle is dropped.
    if (canPrune && !connectedIds!.has(vehicle.vehicle_id)) continue
    merged.set(vehicle.vehicle_id, vehicle)
  }

  for (const row of fresh || []) {
    if (!row?.vehicle_id) continue
    if (canPrune && !connectedIds!.has(row.vehicle_id)) continue
    const current = merged.get(row.vehicle_id)
    if (!current) {
      merged.set(row.vehicle_id, row)
      continue
    }
    // Keep whichever position is newer; a live update may have landed while
    // the snapshot was in flight.
    const rowTime = updateTime(row.last_update)
    const currentTime = updateTime(current.last_update)
    const rowIsOlder = rowTime > 0 && currentTime > 0 && rowTime < currentTime
    merged.set(
      row.vehicle_id,
      rowIsOlder ? { ...row, ...current } : { ...current, ...row },
    )
  }

  return [...merged.values()]
}
