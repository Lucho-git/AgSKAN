// src/lib/stores/chaserLoadsStore.js
// The tonnage in EVERY chaser bin on the map — not just the one you drive.
//
// One shared row per chaser (see supabase/migrations/add_chaser_loads.sql) so
// any operator can adjust any chaser's load. Deliberately NOT stored on
// vehicle_state.vehicle_marker: that row is re-pushed by the machine's own
// client every few seconds, which would overwrite a teammate's edit within one
// heartbeat. A dedicated row has no owner-vs-editor race, and it's in the
// realtime publication so every device sees the change immediately.
//
// The state keeps the key names the grainLoad helpers understand
// ({ grainLoad, grainCapacity }), so callers keep using chaserLoad() /
// chaserCapacity() unchanged.

import { writable } from "svelte/store"
import { supabase } from "$lib/supabaseClient"
import { CHASER_BIN_DEFAULT_CAPACITY } from "$lib/utils/grainLoad"

/**
 * The tonnage in one chaser bin, shaped like the vehicle-marker fields the
 * grainLoad helpers read.
 * @typedef {{ grainLoad: number, grainCapacity: number | null }} ChaserLoadState
 */

/** @type {import("svelte/store").Writable<Record<string, ChaserLoadState>>} */
export const chaserLoadsStore = writable({})

/** @type {any} */
let channel = null

/** @param {{ load_tonnes?: number, capacity_tonnes?: number }} row */
function toState(row) {
  const load = Number(row?.load_tonnes)
  const capacity = Number(row?.capacity_tonnes)
  return {
    grainLoad: Number.isFinite(load) ? load : 0,
    grainCapacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
  }
}

/**
 * One read of the whole map's chaser loads (best-effort).
 * @param {string | null} masterMapId
 */
export async function loadChaserLoads(masterMapId) {
  if (!masterMapId) return
  try {
    const { data, error } = await supabase
      .from("chaser_loads")
      .select("vehicle_id, load_tonnes, capacity_tonnes")
      .eq("master_map_id", masterMapId)
    if (error) throw new Error(error.message)
    /** @type {Record<string, { grainLoad: number, grainCapacity: number | null }>} */
    const next = {}
    for (const row of data ?? []) {
      if (row?.vehicle_id) next[row.vehicle_id] = toState(row)
    }
    chaserLoadsStore.set(next)
  } catch (error) {
    console.warn("Chaser loads unavailable:", error)
  }
}

/**
 * Live updates for the whole map (INSERT / UPDATE / DELETE).
 * @param {string | null} masterMapId
 * @returns {() => void} unsubscribe
 */
export function watchChaserLoads(masterMapId) {
  stopWatchingChaserLoads()
  if (!masterMapId) return () => {}

  channel = supabase
    .channel(`chaser-loads-${masterMapId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chaser_loads",
        filter: `master_map_id=eq.${masterMapId}`,
      },
      (payload) => {
        const row = /** @type {any} */ (payload.new ?? payload.old)
        const vehicleId = row?.vehicle_id
        if (!vehicleId) return
        chaserLoadsStore.update((loads) => {
          if (payload.eventType === "DELETE") {
            const next = { ...loads }
            delete next[vehicleId]
            return next
          }
          return { ...loads, [vehicleId]: toState(row) }
        })
      },
    )
    .subscribe()

  return stopWatchingChaserLoads
}

export function stopWatchingChaserLoads() {
  if (channel) {
    void supabase.removeChannel(channel)
    channel = null
  }
}

/**
 * Set a chaser's load (and optionally its tank size).
 *
 * Applied locally first so the rail/modal repaint instantly, then upserted so
 * the change reaches everyone. Never throws — a failed save must not undo the
 * tonnage the operator just entered.
 *
 * @param {{ masterMapId: string | null, vehicleId: string | null, load: number,
 *           capacity?: number | null, actorId?: string | null }} args
 * @returns {Promise<boolean>} true when it reached the server
 */
export async function setChaserLoad({
  masterMapId,
  vehicleId,
  load,
  capacity = null,
  actorId = null,
}) {
  if (!masterMapId || !vehicleId) return false

  const nextLoad = Math.max(0, Number(load) || 0)
  let nextCapacity = CHASER_BIN_DEFAULT_CAPACITY

  chaserLoadsStore.update((loads) => {
    const prev = loads[vehicleId]
    const storedCapacity =
      capacity != null
        ? Math.max(0, Number(capacity) || 0)
        : (prev?.grainCapacity ?? null)
    nextCapacity = storedCapacity ?? CHASER_BIN_DEFAULT_CAPACITY
    return {
      ...loads,
      [vehicleId]: {
        grainLoad: nextLoad,
        grainCapacity: storedCapacity,
      },
    }
  })

  try {
    const { error } = await supabase.from("chaser_loads").upsert(
      {
        master_map_id: masterMapId,
        vehicle_id: vehicleId,
        load_tonnes: nextLoad,
        capacity_tonnes: nextCapacity,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      },
      { onConflict: "master_map_id,vehicle_id" },
    )
    if (error) throw new Error(error.message)
    return true
  } catch (error) {
    console.warn("Chaser load not saved:", error)
    return false
  }
}
