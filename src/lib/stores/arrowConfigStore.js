// src/lib/stores/arrowConfigStore.js
import { writable } from "svelte/store"

const defaults = {
  sizeMultiplier: 3,
  spacing: 30,
  outlineOpacity: 1,
  outlineThickness: 1.5,
  blur: 0.5,
}

function createArrowConfigStore() {
  const { subscribe, set, update } = writable({ ...defaults })

  return {
    subscribe,
    setSizeMultiplier: (v) =>
      update((s) => ({ ...s, sizeMultiplier: clamp(v, 0.5, 5) })),
    setSpacing: (v) => update((s) => ({ ...s, spacing: clamp(v, 5, 100) })),
    setOutlineOpacity: (v) =>
      update((s) => ({ ...s, outlineOpacity: clamp(v, 0, 1) })),
    setOutlineThickness: (v) =>
      update((s) => ({ ...s, outlineThickness: clamp(v, 0, 4) })),
    setBlur: (v) => update((s) => ({ ...s, blur: clamp(v, 0, 3) })),
    reset: () => set({ ...defaults }),
  }
}

function clamp(val, min, max) {
  return Math.round(Math.min(max, Math.max(min, val)) * 100) / 100
}

export const arrowConfigStore = createArrowConfigStore()
