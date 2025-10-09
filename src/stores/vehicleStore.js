// src/stores/vehicleStore.js
import { writable } from "svelte/store"
import vehicleComponents from "$lib/vehicles"

function createUserVehicleStore() {
  const { subscribe, set, update } = writable({
    id: null,
    coordinates: null,
    last_update: null,
    is_trailing: false,
    vehicle_marker: {
      type: "Pointer",
      bodyColor: "Yellow",  // Keep as bodyColor
      size: 45,             // Numeric value
      swath: 12,
      path: () => vehicleComponents.Pointer,
    },
    heading: 0,
  })

  return {
    subscribe,
    set,
    update,
    updateVehicleMarker: (newMarker) => {
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