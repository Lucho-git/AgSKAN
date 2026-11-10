// src/lib/stores/vehicleStore.js
import { writable } from "svelte/store"
import vehicleComponents from "$lib/vehicles"
import { openChaserBinModal } from "$lib/stores/mapQuickActionStore"
import { isChaserBinType } from "$lib/utils/grainLoad"

function createUserVehicleStore() {
  const { subscribe, set, update } = writable({
    vehicle_id: null,
    coordinates: null,
    last_update: null,
    is_trailing: false,
    vehicle_marker: {
      type: "Pointer",
      bodyColor: "Yellow",
      size: 45,
      swath: 4,
      // Chaser-bin grain load (tonnes) + tank size. Only chaser bins use
      // these; they ride the vehicle_marker broadcast/DB payload so every
      // connected user sees the load (see utils/grainLoad).
      grainLoad: 0,
      grainCapacity: /** @type {number | null} */ (null),
      path: () => vehicleComponents.Pointer,
    },
    heading: 0,
    speed: 0,
    is_flashing: false,
    flash_started_at: null,
    flash_reason: null,
    flash_color: null,
    master_map_id: null,
    active_preset_id: null,
    selected_operation_id: null,
    current_operation: null,
    operation_name: null,
    operation_id: null,
  })

  return {
    subscribe,
    set,
    update,
    updateVehicleMarker: (newMarker, presetId = null) => {
      let ownVehicleId = null
      update((store) => {
        ownVehicleId = store.vehicle_id
        return {
          ...store,
          vehicle_marker: {
            ...store.vehicle_marker,
            ...newMarker,
            path: () => vehicleComponents[newMarker.type] || vehicleComponents.Pointer,
          },
        }
      })
      // Picking a chaser bin is exactly when its load panel is wanted, so it
      // opens on selection — alongside the bottom panel/HUD that already
      // shows the machine. (Only user selections land here; loading the
      // vehicle back from the server uses update() directly, so opening the
      // map never pops the modal uninvited.)
      if (isChaserBinType(newMarker?.type) && ownVehicleId) {
        openChaserBinModal(ownVehicleId)
      }
    },
  }
}

export const userVehicleStore = createUserVehicleStore()
export const userVehicleTrailing = writable(false)

export const otherVehiclesStore = writable([])
export const serverOtherVehiclesData = writable([])
export const otherVehiclesDataChanges = writable([])
