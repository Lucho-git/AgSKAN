// $lib/stores/commandStore.js
import { writable } from "svelte/store"

/**
 * Application command types
 * Commands are transient actions that get consumed and cleared
 */
export const COMMANDS = {
  TRAIL_START: 'trail.start',
  TRAIL_STOP: 'trail.stop',
  TRAIL_TOGGLE: 'trail.toggle',
}

function createCommandStore() {
  const { subscribe, set } = writable(null)

  return {
    subscribe,
    
    /**
     * Dispatch a command
     * @param {string} type - Command type from COMMANDS
     * @param {object} payload - Optional command payload
     */
    dispatch: (type, payload = {}) => {
      const command = { type, payload, timestamp: Date.now() }
      console.log('[Command]', command)
      set(command)
      
      // Auto-clear after one tick to prevent re-processing
      setTimeout(() => set(null), 0)
    },
    
    clear: () => set(null)
  }
}

export const commandStore = createCommandStore()

/**
 * Convenience helpers for common commands
 */
export const commands = {
  trail: {
    start: () => commandStore.dispatch(COMMANDS.TRAIL_START),
    stop: () => commandStore.dispatch(COMMANDS.TRAIL_STOP),
    toggle: () => commandStore.dispatch(COMMANDS.TRAIL_TOGGLE),
  }
}