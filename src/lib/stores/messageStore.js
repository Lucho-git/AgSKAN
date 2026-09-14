// src/lib/stores/messageStore.js
import { writable } from "svelte/store"

/** Conversation panel target: { id, name } | null. */
export const messagePanelStore = writable(null)

/** Unread message count per sender id: { [senderId]: number }. */
export const messageUnreadStore = writable({})

/** Bumped whenever a message arrives; open panels refetch on change. */
export const messageTickStore = writable(0)

export function openMessagePanel(recipient) {
  messagePanelStore.set(recipient)
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
