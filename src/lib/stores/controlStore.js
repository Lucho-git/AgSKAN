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
