import { writable } from "svelte/store"

/**
 * Transient "Guest mode" tooltip state, rendered once by GuestTipLayer
 * (mounted in MapViewer). Panels anywhere in the map can trigger it.
 */
export const guestTipStore = writable(null)

let hideTimer = null

/** Show the guest tooltip near a viewport position (px). */
export function showGuestTip(x, y, text = "Guest mode — view only") {
  guestTipStore.set({ x, y, text })
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => guestTipStore.set(null), 2200)
}

/**
 * Gate a write interaction for view-only guests (profileStore.user_type
 * "viewer"). Returns true when the action must not run — call it first thing
 * inside a click handler:
 *
 *   function handleDelete(event) {
 *     if (blockForViewer(event, isViewer)) return
 *     ...do the thing...
 *   }
 */
export function blockForViewer(
  event,
  isViewer,
  text = "Guest mode — view only",
) {
  if (!isViewer) return false
  if (event) {
    event.preventDefault?.()
    event.stopPropagation?.()
    const el = event.currentTarget || event.target
    const rect = el?.getBoundingClientRect ? el.getBoundingClientRect() : null
    if (rect && (rect.width || rect.height)) {
      showGuestTip(rect.left + rect.width / 2, rect.top - 8, text)
    } else {
      showGuestTip(event.clientX ?? 0, (event.clientY ?? 0) - 8, text)
    }
  }
  return true
}
