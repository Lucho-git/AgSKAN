// src/lib/stores/farmsStore.ts
import { writable } from "svelte/store"

export interface Farm {
    id: string
    map_id: string
    name: string
    created_at: string
}

export const farmsStore = writable<Farm[]>([])
