// src/lib/stores/mapSettingsStore.ts
// Per-map feature flags — loaded on demand and keyed by map ID.
import { writable } from "svelte/store"

export const mapSettingsStore = writable<Record<string, { enforceLimits: boolean }>>({})
