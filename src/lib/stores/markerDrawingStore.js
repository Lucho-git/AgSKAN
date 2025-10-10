// src/lib/stores/markerDrawingStore.js
import { writable } from 'svelte/store'

function createMarkerDrawingStore() {
  const { subscribe, set, update } = writable({
    isActive: false,
    mode: null, // 'area' | 'line'
    markerId: null,
    markerName: null, // Store marker name for display
    masterMapId: null,
    color: '#0ea5e9', // Default color, persists between drawings
    points: []
  })

  return {
    subscribe,
    
    /**
     * Start a new drawing session
     */
    startDrawing: (markerId, masterMapId, mode, color = null, markerName = "Marker") => {
      update(state => ({
        isActive: true,
        mode,
        markerId,
        markerName,
        masterMapId,
        color: color || state.color, // Use provided color or remember last used
        points: []
      }))
    },
    
    /**
     * Add a point to the current drawing
     */
    addPoint: (point) => {
      update(state => ({
        ...state,
        points: [...state.points, point]
      }))
    },
    
    /**
     * Undo the last point added
     */
    undoPoint: () => {
      update(state => ({
        ...state,
        points: state.points.slice(0, -1)
      }))
    },
    
    /**
     * Update the drawing color (persists for next drawing)
     */
    setColor: (color) => {
      update(state => ({ ...state, color }))
    },
    
    /**
     * Reset points but keep session active
     */
    reset: () => {
      update(state => ({ ...state, points: [] }))
    },
    
    /**
     * Cancel drawing and clear all state
     */
    cancel: () => {
      update(state => ({
        isActive: false,
        mode: null,
        markerId: null,
        markerName: null,
        masterMapId: null,
        color: state.color, // Keep color for next time
        points: []
      }))
    },
    
    /**
     * Complete drawing - returns final state then resets
     */
    complete: () => {
      let finalState
      update(state => {
        finalState = { ...state }
        return {
          isActive: false,
          mode: null,
          markerId: null,
          markerName: null,
          masterMapId: null,
          color: state.color, // Keep color for next time
          points: []
        }
      })
      return finalState
    }
  }
}

export const markerDrawingStore = createMarkerDrawingStore()