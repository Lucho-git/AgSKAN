// src/lib/stores/devModeStore.js
import { writable, derived } from "svelte/store"

// Dev mode enabled state
export const devModeEnabled = writable(false)

// Simulated position — updated by joystick
// { latitude, longitude, heading, speed }
export const devPositionStore = writable({
  latitude: null,
  longitude: null,
  heading: 0,
  speed: 0,
})

// Movement speed multiplier (how fast the joystick moves the marker, in m/s)
export const devSpeedMultiplier = writable(10)

// Background simulation mode (tests background GPS pipeline from browser/emulator)
export const devBackgroundSimEnabled = writable(false)
