// src/lib/stores/markerDrawingsStore.js
// Global, session-wide registry of ALL marker drawings for the master map.
// Populated once at map load by MarkerDrawings (which fetches everything for
// the master map) and kept fresh via its realtime subscriptions. DrawingPanel
// reads this store instead of making a per-marker API call.
// @ts-nocheck
import { writable } from "svelte/store"

function createMarkerDrawingsStore() {
  const { subscribe, set, update } = writable([])

  return {
    subscribe,
    set,
    update,
    /** Replace the whole list (from a map-wide fetch). */
    setDrawings(list) {
      set(Array.isArray(list) ? list : [])
    },
    /** Remove a drawing by id (used on delete). */
    removeById(id) {
      update((list) => list.filter((d) => d?.id !== id))
    },
  }
}

export const markerDrawingsStore = createMarkerDrawingsStore()

/** Filter a drawings list down to one marker's drawings. */
export function getDrawingsForMarker(drawings, markerId) {
  return (drawings || []).filter(
    (d) => d?.marker_id === markerId && !d?.deleted,
  )
}
