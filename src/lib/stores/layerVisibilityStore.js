// src/lib/stores/layerVisibilityStore.js
import { writable } from 'svelte/store'

// Default visibility state for all layers
const defaultState = {
  markers: true,
  markerLabels: true,      // ← NEW: Note labels above markers
  markerDrawings: true,
  fields: true,
  fieldLabels: true,
  vehicles: true,
  vehicleLabels: true,
  historicalTrails: true,
  activeTrails: true,
  trailArrows: false,
}

function createLayerVisibilityStore() {
  const { subscribe, set, update } = writable(defaultState)

  return {
    subscribe,
    toggle: (layerName) => {
      update(state => ({
        ...state,
        [layerName]: !state[layerName]
      }))
    },
    setVisibility: (layerName, visible) => {
      update(state => ({
        ...state,
        [layerName]: visible
      }))
    },
    showAll: () => {
      set(Object.keys(defaultState).reduce((acc, key) => {
        acc[key] = true
        return acc
      }, {}))
    },
    hideAll: () => {
      set(Object.keys(defaultState).reduce((acc, key) => {
        acc[key] = false
        return acc
      }, {}))
    },
    reset: () => set(defaultState)
  }
}

export const layerVisibilityStore = createLayerVisibilityStore()