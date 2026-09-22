// src/lib/api/broadcastApi.ts
// Custom broadcasts — created by users and shared with everyone on the map
// (see sql/migrations/2026-09-22_map_broadcasts.sql).
import { supabase } from "$lib/supabaseClient"

export interface MapBroadcast {
  id: string
  label: string
  color: string
}

/** All custom broadcasts saved for a map, oldest first. */
export async function listMapBroadcasts(
  masterMapId: string,
): Promise<MapBroadcast[]> {
  const { data, error } = await supabase
    .from("map_broadcasts")
    .select("id, label, color")
    .eq("master_map_id", masterMapId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error loading map broadcasts:", error)
    return []
  }
  return data ?? []
}

/** Add a broadcast to the map so everyone sees it in their menu. */
export async function createMapBroadcast(
  masterMapId: string,
  label: string,
  color: string,
  userId?: string | null,
): Promise<MapBroadcast | null> {
  const { data, error } = await supabase
    .from("map_broadcasts")
    .insert({
      master_map_id: masterMapId,
      label: label.trim(),
      color,
      created_by: userId ?? null,
    })
    .select("id, label, color")
    .single()

  if (error) {
    console.error("Error creating map broadcast:", error)
    return null
  }
  return data
}
