// $lib/stores/trailsMetaDataStore.ts
import { writable } from 'svelte/store'

export interface TrailData {
    id: string
    vehicle_id: string | null
    operation_id: string
    start_time: string
    end_time: string | null
    trail_color: string
    trail_width: number | null
    trail_distance: number | null
    trail_hectares: number | null
    trail_hectares_overlap: number | null
    trail_percentage_overlap: number | null
    // Add operation info for easy access
    operation_name?: string
    operation_year?: number
    // Add vehicle info if needed
    vehicle_name?: string
}

export const trailsMetaDataStore = writable<TrailData[]>([])