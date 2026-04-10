import { writable } from "svelte/store"

export const historicalTrailStore = writable([])
export const otherActiveTrailStore = writable([])
export const selectedTrailIdStore = writable<string | null>(null)
export const trailsLoadingStore = writable(false)
export const visibleOperationIdsStore = writable<Set<string>>(new Set())
// Stores overlay trails keyed by operation ID
export const overlayTrailsStore = writable<Record<string, any[]>>({})
