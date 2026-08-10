//controStore.js
import { writable } from "svelte/store"

export const controlStore = writable({
  showMarkerMenu: false,
  showVehicleMenu: false,
})

export const trailingButtonPressed = writable()

export const crispVisibility = writable(false)

export const drawingModeEnabled = writable(false)
export const markerPlacementModeEnabled = writable(false) // Add this line

// Suppresses MapEventManager's long-press / click / touch interactions
// (used e.g. while dragging a silo in move mode to avoid placement glitches).
export const mapInteractionsSuppressed = writable(false)
