import { writable } from 'svelte/store'

interface MarkerVisibilitySettings {
    [markerId: string]: 'always' | 'selected' | 'hidden'
}

type MarkerVisibility = 'always' | 'selected' | 'hidden'

function createMarkerVisibilityStore() {
    const { subscribe, set, update } = writable<MarkerVisibilitySettings>({})

    return {
        subscribe,
        set,
        update,
        // Set visibility for a specific marker
        setMarkerVisibility: (markerId: string, visibility: MarkerVisibility) => {
            update(settings => ({
                ...settings,
                [markerId]: visibility
            }))
        },
        setManyMarkerVisibility: (updates: Record<string, MarkerVisibility>) => {
            update(settings => ({
                ...settings,
                ...updates
            }))
        },
        // Get visibility for a marker (with default)
        getMarkerVisibility: (settings: MarkerVisibilitySettings, markerId: string): MarkerVisibility => {
            return settings[markerId] || 'always'
        }
    }
}

export const markerVisibilityStore = createMarkerVisibilityStore()