// src/lib/api/markerStatsApi.ts
// Reads for marker usage stats (see sql/migrations/2026-09-22_marker_archive.sql).
// The archive is written server-side by triggers; the client only reads.
import { supabase } from "$lib/supabaseClient"

export interface MarkerStatRow {
    icon_class: string | null
    /** Total placements in the window (including markers since deleted). */
    placements: number
    /** How many of those markers have since been deleted. */
    deleted: number
    first_used: string
    last_used: string
}

export interface MarkerStatsQuery {
    /** Limit to one map (defaults to every archive row the caller can see). */
    masterMapId?: string | null
    /** Limit to one account — the "show me my stats" case. */
    profileId?: string | null
    /** ISO instants, e.g. the last 12 months. */
    since?: string | null
    until?: string | null
}

/**
 * Marker usage stats, most used first: placements per icon class over the
 * window, including markers that have since been deleted. RLS scopes reads
 * to the caller's map. Returns e.g. [{ icon_class: "custom-svg-rock",
 * placements: 42, deleted: 7, ... }].
 */
export async function getMarkerStats({
    masterMapId = null,
    profileId = null,
    since = null,
    until = null,
}: MarkerStatsQuery = {}): Promise<MarkerStatRow[]> {
    const { data, error } = await supabase.rpc("get_marker_stats", {
        p_master_map_id: masterMapId,
        p_profile_id: profileId,
        p_since: since,
        p_until: until,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as MarkerStatRow[]
}
