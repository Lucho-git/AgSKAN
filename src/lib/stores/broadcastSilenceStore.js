// src/lib/stores/broadcastSilenceStore.js
// Request channel for silencing another vehicle's broadcast. The UI
// (VehicleTracker) writes a request; VehicleStateSynchronizer — which owns
// the map's realtime channel — sends it out to every connected client and
// clears the vehicle's broadcast row.
// @ts-nocheck
import { writable } from "svelte/store"

/**
 * @type {import("svelte/store").Writable<{ vehicleId: string, at: number } | null>}
 */
export const broadcastSilenceRequest = writable(null)
