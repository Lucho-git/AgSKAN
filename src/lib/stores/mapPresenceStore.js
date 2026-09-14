// src/lib/stores/mapPresenceStore.js
import { writable } from "svelte/store"

/**
 * Set of user ids currently connected to this map's realtime channel
 * (i.e. they have the app open). Fed by Supabase presence in
 * VehicleStateSynchronizer; read by messaging to decide popup vs push.
 */
export const mapPresenceStore = writable(new Set())
