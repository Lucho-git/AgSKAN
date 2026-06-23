// src/lib/api/mapSettingsApi.ts
import { supabase } from "$lib/supabaseClient"

export const mapSettingsApi = {
    /**
     * Get enforce_limits for a specific map.
     * Returns false if no row exists (default off).
     */
    async getEnforceLimits(mapId: string): Promise<boolean> {
        try {
            const { data, error } = await supabase
                .from("map_settings")
                .select("enforce_limits")
                .eq("map_id", mapId)
                .maybeSingle()

            if (error) {
                console.error("[mapSettingsApi] getEnforceLimits error:", error)
                return false
            }

            return data?.enforce_limits ?? false
        } catch (e) {
            console.error("[mapSettingsApi] getEnforceLimits exception:", e)
            return false
        }
    },

    /**
     * Set enforce_limits for a specific map (admin only — uses service_role via RPC or direct upsert).
     * Requires admin-level access; the caller should be from the admin dashboard.
     */
    async setEnforceLimits(mapId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from("map_settings")
                .upsert({ map_id: mapId, enforce_limits: enabled }, { onConflict: "map_id" })

            if (error) {
                console.error("[mapSettingsApi] setEnforceLimits error:", error)
                return { success: false, error: error.message }
            }

            return { success: true }
        } catch (e: any) {
            console.error("[mapSettingsApi] setEnforceLimits exception:", e)
            return { success: false, error: e?.message || "Unexpected error" }
        }
    },

    /**
     * Get enforce_limits status for multiple maps at once (admin dashboard).
     * Returns a Map of map_id → boolean.
     */
    async getBulkEnforceLimits(mapIds: string[]): Promise<Map<string, boolean>> {
        const result = new Map<string, boolean>()
        // Default all to false
        for (const id of mapIds) result.set(id, false)

        if (mapIds.length === 0) return result

        try {
            const { data, error } = await supabase
                .from("map_settings")
                .select("map_id, enforce_limits")
                .in("map_id", mapIds)

            if (error) {
                console.error("[mapSettingsApi] getBulkEnforceLimits error:", error)
                return result
            }

            for (const row of data || []) {
                result.set(row.map_id, row.enforce_limits ?? false)
            }
        } catch (e) {
            console.error("[mapSettingsApi] getBulkEnforceLimits exception:", e)
        }

        return result
    },
}
