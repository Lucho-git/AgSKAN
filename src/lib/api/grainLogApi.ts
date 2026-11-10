// src/lib/api/grainLogApi.ts
// Read/write access for the grain activity record (see
// supabase/migrations/20261110042558_add_grain_log.sql).
//
// Writes go through the `log_grain_event` RPC — the actor and the map are
// resolved server-side from the caller's profile, so the client never sends
// either. Reads are plain selects (RLS limits them to the caller's map).
//
// Logging is best-effort: a missing migration or a network blip must never
// block the tonnage change the operator just made, so failures only warn.
import { supabase } from "$lib/supabaseClient"

export type GrainLogAction = "bin.level" | "chaser.level" | "chaser.empty"

export interface GrainLogEntry {
    id: number
    occurred_at: string
    actor_id: string | null
    actor_name: string
    action: GrainLogAction
    bin_id: string | null
    bin_name: string | null
    vehicle_id: string | null
    vehicle_name: string | null
    tonnes_before: number | null
    tonnes_after: number | null
    bin_fill_before: number | null
    bin_fill_after: number | null
    note: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details: Record<string, any> | null
}

export const GRAIN_LOG_PAGE_SIZE = 25

const GRAIN_LOG_COLUMNS =
    "id, occurred_at, actor_id, actor_name, action, bin_id, bin_name, vehicle_id, vehicle_name, tonnes_before, tonnes_after, bin_fill_before, bin_fill_after, note, details"

export interface GrainLogPayload {
    action: GrainLogAction
    /** The bin the action was about (map_markers.id) — bin.level / chaser.empty. */
    binId?: string | null
    binName?: string | null
    /** The chaser's operator (profiles.id) — chaser.level / chaser.empty. */
    vehicleId?: string | null
    vehicleName?: string | null
    /** Tonnes in the thing being changed, before → after. */
    tonnesBefore?: number | null
    tonnesAfter?: number | null
    /** Bin fill %, before → after. */
    binFillBefore?: number | null
    binFillAfter?: number | null
    note?: string | null
}

/**
 * Record one grain action. Never throws — a failed record must not undo the
 * tonnage change that produced it.
 */
export async function logGrainEvent(payload: GrainLogPayload): Promise<void> {
    try {
        const { error } = await supabase.rpc("log_grain_event", {
            p_action: payload.action,
            p_bin_id: payload.binId ?? null,
            p_bin_name: payload.binName ?? null,
            p_vehicle_id: payload.vehicleId ?? null,
            p_vehicle_name: payload.vehicleName ?? null,
            p_tonnes_before: payload.tonnesBefore ?? null,
            p_tonnes_after: payload.tonnesAfter ?? null,
            p_bin_fill_before: payload.binFillBefore ?? null,
            p_bin_fill_after: payload.binFillAfter ?? null,
            p_note: payload.note ?? null,
        })
        if (error) throw new Error(error.message)
    } catch (error) {
        console.warn("Grain log write skipped:", error)
    }
}

export interface GrainLogQuery {
    limit?: number
    /** Only entries about this bin. */
    binId?: string | null
    /** Only entries about this chaser (profiles.id). */
    vehicleId?: string | null
    /** Page backwards: entries older than this id. */
    beforeId?: number
}

/**
 * One page of the map's grain record, newest first.
 * Throws on failure so callers can show an "unavailable" state.
 */
export async function fetchGrainLog(
    masterMapId: string,
    { limit = GRAIN_LOG_PAGE_SIZE, binId, vehicleId, beforeId }: GrainLogQuery = {},
): Promise<GrainLogEntry[]> {
    if (!masterMapId) return []

    let query = supabase
        .from("grain_log")
        .select(GRAIN_LOG_COLUMNS)
        .eq("master_map_id", masterMapId)
        .order("id", { ascending: false })
        .limit(limit)

    if (binId) query = query.eq("bin_id", binId)
    if (vehicleId) query = query.eq("vehicle_id", vehicleId)
    if (beforeId) query = query.lt("id", beforeId)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []) as GrainLogEntry[]
}
