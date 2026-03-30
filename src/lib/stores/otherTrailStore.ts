import { writable } from "svelte/store"

export const historicalTrailStore = writable([])
export const otherActiveTrailStore = writable([])
export const selectedTrailIdStore = writable<string | null>(null)
