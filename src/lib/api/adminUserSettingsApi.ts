// src/lib/api/adminUserSettingsApi.ts
// Admin-only API for viewing and modifying any user's settings.
// Uses the standard supabase client — requires RLS policies that allow
// support team members to read/write user_settings for any user.
// See accompanying SQL migration: sql/migrations/2026-06-24_admin_user_settings_rls.sql

import { supabase } from "$lib/supabaseClient"

export interface UserSettingsRow {
  user_id: string
  zoom_to_location_markers: boolean
  zoom_to_placed_markers: boolean
  satellite_dropdown_enabled: boolean
  default_imagery_source: string | null
  default_marker: { id: string; class: string; name: string } | null
  extra_markers: { id: string; class: string; name: string }[] | null
  dev_tools_enabled: boolean
  enable_full_1hz: boolean
  show_gps_popups: boolean
  gps_interval_seconds: number
  show_gps_accepted_popups: boolean
  show_gps_rejected_popups: boolean
  layer_visibility: Record<string, boolean>
  auto_confirm_markers: boolean
}

/** Map API field names to user_settings column names */
const FIELD_MAP: Record<string, string> = {
  zoomToLocationMarkers: "zoom_to_location_markers",
  zoomToPlacedMarkers: "zoom_to_placed_markers",
  satelliteDropdownEnabled: "satellite_dropdown_enabled",
  defaultImagerySource: "default_imagery_source",
  defaultMarker: "default_marker",
  extraMarkers: "extra_markers",
  devToolsEnabled: "dev_tools_enabled",
  enableFull1Hz: "enable_full_1hz",
  showGpsPopups: "show_gps_popups",
  gpsIntervalSeconds: "gps_interval_seconds",
  showGpsAcceptedPopups: "show_gps_accepted_popups",
  showGpsRejectedPopups: "show_gps_rejected_popups",
  layerVisibility: "layer_visibility",
  autoConfirmMarkers: "auto_confirm_markers",
}

/** Reverse map: snake_case column → camelCase field */
const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k]),
)

function toCamelCase(row: Record<string, any> | null): Record<string, any> | null {
  if (!row) return null
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    const camel = REVERSE_MAP[key] || key
    result[camel] = value
  }
  return result
}

export const adminUserSettingsApi = {
  /**
   * Fetch all settings for a specific user.
   */
  async getUserSettings(userId: string): Promise<{ success: boolean; data?: UserSettingsRow; error?: string }> {
    try {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle()

      if (error) {
        console.error("[adminUserSettingsApi] getUserSettings error:", error)
        return { success: false, error: error.message }
      }

      return { success: true, data: (toCamelCase(data) || undefined) as UserSettingsRow }
    } catch (e: any) {
      console.error("[adminUserSettingsApi] getUserSettings exception:", e)
      return { success: false, error: e?.message || "Unexpected error" }
    }
  },

  /**
   * Update a single user setting field.
   * @param userId — target user's UUID
   * @param field — camelCase field name (e.g. "devToolsEnabled", "gpsIntervalSeconds")
   * @param value — the new value for the field
   */
  async setUserSetting(
    userId: string,
    field: string,
    value: any,
  ): Promise<{ success: boolean; error?: string }> {
    const column = FIELD_MAP[field]
    if (!column) {
      return { success: false, error: `Unknown setting field: ${field}` }
    }

    try {
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: userId, [column]: value }, { onConflict: "user_id" })

      if (error) {
        console.error("[adminUserSettingsApi] setUserSetting error:", error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (e: any) {
      console.error("[adminUserSettingsApi] setUserSetting exception:", e)
      return { success: false, error: e?.message || "Unexpected error" }
    }
  },

  /**
   * Reset a user's settings to defaults by deleting their row.
   * The application-side defaults (from userSettingsStore) will apply on next load.
   */
  async resetUserSettings(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from("user_settings")
        .delete()
        .eq("user_id", userId)

      if (error) {
        console.error("[adminUserSettingsApi] resetUserSettings error:", error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (e: any) {
      console.error("[adminUserSettingsApi] resetUserSettings exception:", e)
      return { success: false, error: e?.message || "Unexpected error" }
    }
  },
}
