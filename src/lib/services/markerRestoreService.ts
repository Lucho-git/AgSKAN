// src/lib/services/markerRestoreService.ts
// Undo for marker deletes. The server call flips `deleted` back to false and
// the map_log / marker_archive triggers record the restore; this module then
// puts the marker back into the stores so it renders immediately.
//
// MapStateSaver drops realtime payloads written by the current user
// (`update_user_id === userId`), so the restoring client must apply the change
// itself — the RPC's returned row is the source of truth.
import { markerApi } from "$lib/api/markerApi"
import {
  confirmedMarkersStore,
  remoteMarkerRippleStore,
} from "$lib/stores/markerStore"
import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"
import {
  markerRowToClientMarker,
  markerRowVisibility,
} from "$lib/utils/markerRow"

// The marker stores are JS modules (`//@ts-nocheck`), so TypeScript infers
// `never[]` / `null` for their payloads. Widen them for this service.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const markersStore = confirmedMarkersStore as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rippleStore = remoteMarkerRippleStore as any

/**
 * Restore a soft-deleted marker and re-add it to the map.
 * @param {string} markerId
 */
export async function restoreMarkerToMap(markerId: string) {
  const result = await markerApi.restoreMarker(markerId)
  if (!result.success) return result

  const marker = markerRowToClientMarker(result.marker)
  if (!marker) {
    return {
      success: false,
      message: "Restored marker has no coordinates",
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markersStore.update((current: any[]) => {
    const index = current.findIndex((m) => m.id === marker.id)
    if (index >= 0) {
      current[index] = marker
      return current
    }
    return [...current, marker]
  })

  // The delete removed its visibility entry; put back what the marker was
  // saved with (the store's own default is "always").
  markerVisibilityStore.setMarkerVisibility(
    marker.id,
    markerRowVisibility(result.marker),
  )

  // Same pop-in treatment a remotely placed marker gets, so an undo is
  // visible rather than silently reappearing under the cursor.
  rippleStore.set({
    coordinates: marker.coordinates,
    timestamp: Date.now(),
  })

  return { success: true, marker }
}
