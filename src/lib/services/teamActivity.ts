// src/lib/services/teamActivity.ts
//
// Keeps the team roster's *vehicle* half repairable.
//
// `mapActivityStore` is written exactly once, by the account layout, from two
// independent queries: `profiles` (names, roles) and `vehicle_state`
// (vehicle_type → icon, last_update → online dot). Supabase resolves with
// `{ data: null, error }` instead of throwing, so when the second query loses
// a slow connection the names still render but every row silently degrades to
// a generic person icon and "Offline" — and because nothing re-fetched it, the
// panel stayed wrong for the rest of the session. That is the "icons vanished
// after leaving a map / returning from settings" report.
//
// These helpers let the roster repair just that half, in place, with no page
// reload and without touching names or counts.

import { get } from "svelte/store"
import { supabase } from "$lib/supabaseClient"
import { mapActivityStore } from "$lib/stores/mapActivityStore"
import { profileStore } from "$lib/stores/profileStore"
import { isRosterIncomplete } from "$lib/utils/rosterHealth"
import {
  reportLoading,
  reportOk,
  reportResult,
} from "$lib/stores/dataStatusStore"

/** Vehicle states older than this are worth re-checking when the tab wakes. */
const STALE_AFTER_MS = 60_000

let lastLoadedAt = 0

function resolveMapId(mapId?: string | null): string | null {
  return mapId ?? get(profileStore)?.master_map_id ?? null
}

/**
 * True when at least one roster member has no vehicle row at all — i.e. the
 * icon/online state cannot be derived. Names being present makes this the
 * only signal that the roster is half-loaded.
 */
export function teamVehicleStatesIncomplete(): boolean {
  return isRosterIncomplete(get(mapActivityStore))
}

export function markTeamActivityFresh(): void {
  lastLoadedAt = Date.now()
}

export function teamActivityIsStale(now = Date.now()): boolean {
  return now - lastLoadedAt > STALE_AFTER_MS
}

/**
 * Re-fetch the roster's live half (`vehicle_state`) and merge it in.
 *
 * If the names came back empty as well — the whole team query failed rather
 * than just the vehicle one — the profile rows are re-fetched too, so the
 * panel can recover without a full page reload.
 *
 * Returns false (and records the failure) when a request did not land.
 */
export async function refreshTeamVehicleStates(
  mapId?: string | null,
): Promise<boolean> {
  const resolved = resolveMapId(mapId)
  if (!resolved) return false

  reportLoading("team")

  const needsProfiles = !get(mapActivityStore).connected_profiles?.length

  const [profilesResult, vehiclesResult] = await Promise.all([
    needsProfiles
      ? supabase
          .from("profiles")
          .select("id, full_name, selected_operation_id, map_role")
          .eq("master_map_id", resolved)
      : Promise.resolve({ data: null, error: null }),
    supabase.from("vehicle_state").select("*").eq("master_map_id", resolved),
  ])

  const failure = profilesResult.error ?? vehiclesResult.error
  if (failure) {
    reportResult("team", failure, {
      browserOnline: typeof navigator === "undefined" || navigator.onLine,
    })
    console.warn("[team] refresh failed:", failure.message)
    return false
  }

  mapActivityStore.update((state) => ({
    ...state,
    connected_profiles: profilesResult.data?.length
      ? profilesResult.data
      : state.connected_profiles,
    vehicle_states: vehiclesResult.data ?? [],
  }))

  markTeamActivityFresh()
  reportOk("team")
  return true
}

/**
 * Only fetch when it would actually change what's on screen.
 * `force` skips the staleness gate (used by the banner's Retry).
 */
export async function ensureTeamVehicleStates(
  mapId?: string | null,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const resolved = resolveMapId(mapId)
  if (!resolved) return false

  const incomplete = teamVehicleStatesIncomplete()
  if (!options.force && !incomplete && !teamActivityIsStale()) return true

  return refreshTeamVehicleStates(resolved)
}
