// src/lib/stores/messageStore.js
import { writable } from "svelte/store"
import { controlStore } from "./controlStore"

// Only one map panel at a time — opening messages closes the vehicles /
// marker menus so they're not sitting in the way (e.g. while picking a
// location to attach).
function closeMapPanels() {
  controlStore.update((controls) =>
    controls.showVehicleMenu || controls.showMarkerMenu
      ? { ...controls, showVehicleMenu: false, showMarkerMenu: false }
      : controls,
  )
}

/**
 * Messaging panel state:
 *   { view: "conversation", id, name } — chatting with one person
 *   { view: "inbox" }                  — list of all conversations
 *   null                               — closed
 */
export const messagePanelStore = writable(null)

/** Unread message count per sender id: { [senderId]: number }. */
export const messageUnreadStore = writable({})

/** Bumped whenever a message arrives; open panels refetch on change. */
export const messageTickStore = writable(0)

export function openMessagePanel(recipient) {
  closeMapPanels()
  messagePanelStore.set({
    view: "conversation",
    id: recipient.id,
    name: recipient.name || "",
  })
}

/** Opens the list of every conversation (message history home). */
export function openMessageInbox() {
  closeMapPanels()
  messagePanelStore.set({ view: "inbox", id: null, name: "" })
}

export function closeMessagePanel() {
  messagePanelStore.set(null)
}

export function messageBumpUnread(senderId, by = 1) {
  messageUnreadStore.update((m) => ({
    ...m,
    [senderId]: (m[senderId] || 0) + by,
  }))
}

export function messageClearUnread(senderId) {
  messageUnreadStore.update((m) => {
    if (!m[senderId]) return m
    const next = { ...m }
    delete next[senderId]
    return next
  })
}

export function messageSetUnread(counts) {
  messageUnreadStore.set(counts || {})
}

export function messageBumpTick() {
  messageTickStore.update((n) => n + 1)
}
