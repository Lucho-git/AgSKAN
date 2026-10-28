import { writable } from "svelte/store"

/**
 * Clean-screen mode for the map viewer.
 *
 * While true every interactive overlay (navigation buttons, vehicle HUD,
 * field labels, quick-action rail, mapbox controls) is hidden so the map
 * itself is unobstructed. Only the top-right toggle stays on screen; tapping
 * it brings everything back.
 */
export const mapChromeHiddenStore = writable(false)

export function setMapChromeHidden(hidden: boolean) {
  mapChromeHiddenStore.set(hidden)
}
