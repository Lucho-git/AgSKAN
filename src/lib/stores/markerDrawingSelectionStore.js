import { writable } from "svelte/store"

// Set by MapEventManager when a drawing is clicked on the map. The marker
// menu's DrawingPanel applies this once its drawings are loaded (the menu may
// not be mounted yet at click time), then clears it.
//
// Shape: { markerId, drawingId, bounds: { west, south, east, north } | null }
export const pendingDrawingSelection = writable(null)
