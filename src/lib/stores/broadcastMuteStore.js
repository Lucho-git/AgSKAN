// src/lib/stores/broadcastMuteStore.js
// Local-only "silence" for broadcasts: hides a vehicle's broadcast on THIS
// device until that broadcast ends. Nothing is sent to other users, and the
// broadcaster keeps broadcasting for everyone else.
//
// Persisted in localStorage keyed by the broadcast's start time, so a refresh
// keeps it silenced — while a NEW broadcast (different start time) shows again.
// @ts-nocheck
import { writable } from "svelte/store"

const STORAGE_KEY = "agskan.muted_broadcasts"

function loadMuted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * { [vehicleId]: broadcastStartMs } — the vehicle's broadcast is hidden while
 * it is the same broadcast (same start time).
 */
export const mutedBroadcastsStore = writable(loadMuted())

function persist(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private-mode errors
  }
}

/** Silence a vehicle's current broadcast on this device. */
export function muteBroadcast(vehicleId, startedAt) {
  if (!vehicleId) return
  const ms = startedAt ? new Date(startedAt).getTime() : NaN
  mutedBroadcastsStore.update((map) => {
    const next = { ...map, [vehicleId]: Number.isFinite(ms) ? ms : 0 }
    persist(next)
    return next
  })
}

/** Remove a mute (broadcast ended, or a newer broadcast started). */
export function unmuteBroadcast(vehicleId) {
  if (!vehicleId) return
  mutedBroadcastsStore.update((map) => {
    if (!(vehicleId in map)) return map
    const next = { ...map }
    delete next[vehicleId]
    persist(next)
    return next
  })
}
