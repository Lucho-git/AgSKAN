// src/lib/stores/vehicleStore.js
import { writable } from "svelte/store"
import vehicleComponents from "$lib/vehicles"

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
      path: () => vehicleComponents.Pointer,
    },
    heading: 0,
    speed: 0,
    is_flashing: false,
    flash_started_at: null,
    flash_reason: null,
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
      update((store) => ({
        ...store,
        vehicle_marker: {
          ...store.vehicle_marker,
          ...newMarker,
          path: () => vehicleComponents[newMarker.type] || vehicleComponents.Pointer,
        },
      }))
    },
  }
}

export const userVehicleStore = createUserVehicleStore()
export const userVehicleTrailing = writable(false)

export const otherVehiclesStore = writable([])
export const serverOtherVehiclesData = writable([])
export const otherVehiclesDataChanges = writable([])