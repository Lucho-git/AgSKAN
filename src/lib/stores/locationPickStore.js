// Location picker + map focus stores (message location attachments).
import { writable } from "svelte/store"
import { controlStore } from "./controlStore"

/**
 * Location picker state:
 *   { active: true,  captured: false } → user is tapping the map
 *   { active: false, captured: true }  → a location was picked, awaiting review
 *   { active: false, captured: false } → idle
 * While `captured` the chat stays hidden so the user can confirm the
 * selection on the map before returning to the composer.
 */
export const locationPickStore = writable({ active: false, captured: false })

/**
 * Result of a location pick:
 *   { lng, lat, label, refType: "marker" | "field" | null, refId } | null
 */
export const pickedLocationStore = writable(null)

/**
 * Fly-to requests from message bubbles:
 *   { lng, lat, label, refType, refId, _t } | null
 */
export const mapFocusStore = writable(null)

export function startLocationPick() {
  // Only one panel at a time — clear the vehicles / marker menus so the map
  // is unobstructed while tapping a location.
  controlStore.update((controls) =>
    controls.showVehicleMenu || controls.showMarkerMenu
      ? { ...controls, showVehicleMenu: false, showMarkerMenu: false }
      : controls,
  )
  pickedLocationStore.set(null)
  locationPickStore.set({ active: true, captured: false })
}

export function cancelLocationPick() {
  locationPickStore.set({ active: false, captured: false })
}

export function completeLocationPick(result) {
  // Set the pick state FIRST — subscribers of pickedLocationStore read
  // `captured` to decide whether to hold the pick for review.
  locationPickStore.set({ active: false, captured: true })
  pickedLocationStore.set(result)
}

/** User confirmed the picked location on the map — back to the chat. */
export function finishLocationPickReview() {
  locationPickStore.set({ active: false, captured: false })
}

export function focusMapLocation(payload) {
  mapFocusStore.set({ ...payload, _t: Date.now() })
}

// The same physical tap fires both `touchend` and `click` map events — after
// a pick completes we briefly swallow the twin so nothing else reacts to it.
let pickCooldownUntil = 0

export function markLocationPickHandled() {
  pickCooldownUntil = Date.now() + 600
}

export function locationPickHandledRecently() {
  return Date.now() < pickCooldownUntil
}
