// src/lib/stores/kmzOverlaysStore.js
import { writable } from "svelte/store"

// Shared state for the experimental KMZ/KML overlay layers.
//
//   overlays          — rows from the kmz_overlays table (each has geojson + style)
//   hiddenIds         — Set of overlay ids toggled off via the toolbox eye
//   selectedOverlayId — overlay whose road is currently selected (or null)
//   selectedRoadIndex — index of the selected road within that overlay (or null)
//
// Each feature in an overlay's geojson can carry per-road overrides:
//   properties.name    — road label
//   properties.color   — optional per-road color (falls back to overlay.style.color)
//   properties.dashed  — optional per-road dashed flag (falls back to overlay.style.dashed)
const defaultState = {
  overlays: [],
  loading: false,
  hiddenIds: new Set(),
  selectedOverlayId: null,
  selectedRoadIndex: null,
  focusRequest: 0,
  editingOverlayId: null,
  editingRoadIndex: null,
}

function createKmzOverlaysStore() {
  const { subscribe, set, update } = writable(defaultState)

  return {
    subscribe,
    setOverlays: (overlays) =>
      update((s) => ({
        ...s,
        overlays: overlays || [],
        selectedOverlayId: null,
        selectedRoadIndex: null,
        editingOverlayId: null,
        editingRoadIndex: null,
      })),
    setLoading: (loading) => update((s) => ({ ...s, loading })),
    addOverlay: (overlay) =>
      update((s) => ({ ...s, overlays: [...s.overlays, overlay] })),
    /** Replace an overlay in the list (after local edits are saved). */
    updateOverlay: (overlay) =>
      update((s) => ({
        ...s,
        overlays: s.overlays.map((o) => (o.id === overlay.id ? overlay : o)),
      })),
    removeOverlay: (id) =>
      update((s) => ({
        ...s,
        overlays: s.overlays.filter((o) => o.id !== id),
        hiddenIds: new Set([...s.hiddenIds].filter((x) => x !== id)),
        selectedOverlayId:
          s.selectedOverlayId === id ? null : s.selectedOverlayId,
        selectedRoadIndex:
          s.selectedOverlayId === id ? null : s.selectedRoadIndex,
        editingOverlayId:
          s.editingOverlayId === id ? null : s.editingOverlayId,
        editingRoadIndex:
          s.editingOverlayId === id ? null : s.editingRoadIndex,
      })),
    toggleVisibility: (id) =>
      update((s) => {
        const hiddenIds = new Set(s.hiddenIds)
        if (hiddenIds.has(id)) hiddenIds.delete(id)
        else hiddenIds.add(id)
        return { ...s, hiddenIds }
      }),
    /** Select a road (or clear with null/null). */
    setSelection: (overlayId, roadIndex) =>
      update((s) => ({
        ...s,
        selectedOverlayId: overlayId,
        selectedRoadIndex: roadIndex,
      })),
    /** Bump the focus counter so the renderer zooms to the selected road. */
    requestFocus: () =>
      update((s) => ({ ...s, focusRequest: s.focusRequest + 1 })),
    /** Enter road-editing mode for a specific road. */
    startRoadEdit: (overlayId, roadIndex) =>
      update((s) => ({
        ...s,
        editingOverlayId: overlayId,
        editingRoadIndex: roadIndex,
      })),
    /** Exit road-editing mode. */
    stopRoadEdit: () =>
      update((s) => ({
        ...s,
        editingOverlayId: null,
        editingRoadIndex: null,
      })),
    clearSelection: () =>
      update((s) => ({
        ...s,
        selectedOverlayId: null,
        selectedRoadIndex: null,
      })),
    reset: () => set(defaultState),
  }
}

export const kmzOverlaysStore = createKmzOverlaysStore()
