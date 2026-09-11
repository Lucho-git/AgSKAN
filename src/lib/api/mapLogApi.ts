// src/lib/api/mapLogApi.ts
// Reads for the map activity log (see supabase/migrations/add_map_log.sql).
// Rows are written server-side by triggers; the client only reads them.
import { supabase } from "$lib/supabaseClient"

export const MAP_LOG_PAGE_SIZE = 50

export interface MapLogEntry {
  id: number
  occurred_at: string
  source: string
  actor_name: string
  action: string
  entity_type: string
  entity_id: string
  summary: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any> | null
}

export type MapLogPage = {
  limit?: number
  /** Return entries older than this id (paging "Load older"). */
  beforeId?: number
  /** Only entries at/after this instant (ISO). */
  since?: string | null
  /** Only entries strictly before this instant (ISO). */
  until?: string | null
  /** Restrict to these exact actions (OR'd). Omit for everything. */
  actions?: string[] | null
  /** Only entries made by this profile (actor_id). */
  actorId?: string | null
  /** Only entries about this entity (entity_id) — e.g. one vehicle. */
  entityId?: string | null
}

/**
 * One page of the map's activity feed, newest first.
 * Throws on failure so callers can decide whether to surface it.
 */
export async function fetchMapLogPage(
  masterMapId: string,
  {
    limit = MAP_LOG_PAGE_SIZE,
    beforeId,
    since,
    until,
    actions,
    actorId,
    entityId,
  }: MapLogPage = {},
): Promise<MapLogEntry[]> {
  let query = supabase
    .from("map_log")
    .select(
      "id, occurred_at, source, actor_name, action, entity_type, entity_id, summary, details",
    )
    .eq("master_map_id", masterMapId)
    .order("id", { ascending: false })
    .limit(limit)

  if (beforeId) query = query.lt("id", beforeId)
  if (since) query = query.gte("occurred_at", since)
  if (until) query = query.lt("occurred_at", until)
  if (actions?.length) query = query.in("action", actions)
  if (actorId) query = query.eq("actor_id", actorId)
  if (entityId) query = query.eq("entity_id", entityId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as MapLogEntry[]
}

/** How many log entries landed since `sinceIso` (drives the tab badge). */
export async function countMapLogSince(
  masterMapId: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("map_log")
    .select("id", { count: "exact", head: true })
    .eq("master_map_id", masterMapId)
    .gt("occurred_at", sinceIso)

  if (error) {
    console.warn("map log unread count failed:", error.message)
    return 0
  }
  return count ?? 0
}

// ── Filter option lists (vehicles + accounts seen on this map) ──────────────

export interface LogVehicleOption {
  vehicleId: string
  /** The account that operates the machine, when known. */
  name: string
  vehicleType: string | null
  bodyColor: string | null
  swath: number | string | null
  lastSeenAt: string
}

/**
 * Vehicles used on a map, most recent first. Built from vehicle.changed log
 * rows (the history) merged with current vehicle_state rows (covers machines
 * that have never changed config). Names resolve via profiles.
 */
export async function fetchMapLogVehicleOptions(
  masterMapId: string,
  limit = 200,
): Promise<LogVehicleOption[]> {
  const seen = new Map<string, LogVehicleOption>()

  const { data: logRows, error: logError } = await supabase
    .from("map_log")
    .select("entity_id, occurred_at, details")
    .eq("master_map_id", masterMapId)
    .eq("action", "vehicle.changed")
    .order("id", { ascending: false })
    .limit(limit)

  if (logError) throw new Error(logError.message)

  for (const row of logRows ?? []) {
    if (!row.entity_id || seen.has(row.entity_id)) continue
    const d = row.details || {}
    seen.set(row.entity_id, {
      vehicleId: row.entity_id,
      name: "Vehicle",
      vehicleType: d.vehicle_type ?? null,
      bodyColor: d.vehicle_body_color ?? null,
      swath: d.vehicle_swath ?? null,
      lastSeenAt: row.occurred_at,
    })
  }

  const { data: states, error: stateError } = await supabase
    .from("vehicle_state")
    .select("vehicle_id, vehicle_marker, last_update")
    .eq("master_map_id", masterMapId)

  if (!stateError && states) {
    for (const state of states) {
      if (!state.vehicle_id) continue
      const marker = state.vehicle_marker || {}
      const stamp = state.last_update || new Date().toISOString()
      const existing = seen.get(state.vehicle_id)
      if (!existing) {
        seen.set(state.vehicle_id, {
          vehicleId: state.vehicle_id,
          name: "Vehicle",
          vehicleType: marker.type ?? null,
          bodyColor: marker.bodyColor ?? null,
          swath: marker.swath ?? null,
          lastSeenAt: stamp,
        })
      } else if (stamp > existing.lastSeenAt) {
        existing.lastSeenAt = stamp
      }
    }
  }

  const ids = [...seen.keys()]
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids)
    for (const profile of profiles ?? []) {
      const option = seen.get(profile.id)
      if (option && profile.full_name) option.name = profile.full_name
    }
  }

  return [...seen.values()].sort((a, b) =>
    a.lastSeenAt < b.lastSeenAt ? 1 : a.lastSeenAt > b.lastSeenAt ? -1 : 0,
  )
}

export interface LogActorOption {
  actorId: string
  name: string
  lastSeenAt: string | null
}

/**
 * The team list for the log's account filter: every member of the map (even
 * without activity yet) plus anyone from the log who has since left. Each
 * entry carries the account's vehicle so rows can show the machine icon —
 * easier to recognise who's who. Most recently active first.
 */
export interface LogTeamOption {
  actorId: string
  name: string
  vehicleType: string | null
  bodyColor: string | null
  lastSeenAt: string | null
}

export async function fetchMapLogTeamOptions(
  masterMapId: string,
): Promise<LogTeamOption[]> {
  const [actors, vehicles] = await Promise.all([
    fetchMapLogActorOptions(masterMapId),
    fetchMapLogVehicleOptions(masterMapId).catch(() => [] as LogVehicleOption[]),
  ])

  const vehicleById = new Map(vehicles.map((v) => [v.vehicleId, v]))

  const options: LogTeamOption[] = actors.map((actor) => {
    const vehicle = vehicleById.get(actor.actorId)
    const vehicleSeen = vehicle?.lastSeenAt || null
    const lastSeenAt =
      vehicleSeen && (!actor.lastSeenAt || vehicleSeen > actor.lastSeenAt)
        ? vehicleSeen
        : actor.lastSeenAt
    return {
      actorId: actor.actorId,
      name: actor.name,
      vehicleType: vehicle?.vehicleType ?? null,
      bodyColor: vehicle?.bodyColor ?? null,
      lastSeenAt,
    }
  })

  options.sort((a, b) => {
    if (a.lastSeenAt && b.lastSeenAt) return a.lastSeenAt < b.lastSeenAt ? 1 : -1
    if (a.lastSeenAt) return -1
    if (b.lastSeenAt) return 1
    return a.name.localeCompare(b.name)
  })
  return options
}

/**
 * Accounts to choose from in the log's team filter: every member of the map
 * (even with no activity yet), plus anyone from the log who has since left.
 */
export async function fetchMapLogActorOptions(
  masterMapId: string,
  limit = 300,
): Promise<LogActorOption[]> {
  const recency = new Map<string, { at: string; name: string | null }>()

  const { data: logRows } = await supabase
    .from("map_log")
    .select("actor_id, actor_name, occurred_at")
    .eq("master_map_id", masterMapId)
    .not("actor_id", "is", null)
    .order("id", { ascending: false })
    .limit(limit)

  for (const row of logRows ?? []) {
    if (row.actor_id && !recency.has(row.actor_id)) {
      recency.set(row.actor_id, { at: row.occurred_at, name: row.actor_name })
    }
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("master_map_id", masterMapId)

  const seen = new Map<string, LogActorOption>()
  for (const member of members ?? []) {
    seen.set(member.id, {
      actorId: member.id,
      name: member.full_name || recency.get(member.id)?.name || "Unknown",
      lastSeenAt: recency.get(member.id)?.at ?? null,
    })
  }
  for (const [actorId, info] of recency) {
    if (!seen.has(actorId)) {
      seen.set(actorId, {
        actorId,
        name: info.name || "Former member",
        lastSeenAt: info.at,
      })
    }
  }

  return [...seen.values()].sort((a, b) => {
    if (a.lastSeenAt && b.lastSeenAt) return a.lastSeenAt < b.lastSeenAt ? 1 : -1
    if (a.lastSeenAt) return -1
    if (b.lastSeenAt) return 1
    return a.name.localeCompare(b.name)
  })
}

// ── "Last checked" marker (per profile, per device) ─────────────────────────
// Client-local on purpose: the badge means "new since YOU last looked",
// so it doesn't need a database round trip to record.
const lastSeenKey = (profileId: string) => `agskan.map_log.last_seen.${profileId}`

export function getMapLogLastSeen(profileId?: string | null): string | null {
  if (!profileId || typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(lastSeenKey(profileId))
  } catch {
    return null
  }
}

export function setMapLogLastSeen(profileId?: string | null, iso?: string): void {
  if (!profileId || typeof localStorage === "undefined") return
  try {
    localStorage.setItem(lastSeenKey(profileId), iso || new Date().toISOString())
  } catch {
    /* storage full / private mode — badge just stays per-session */
  }
}
