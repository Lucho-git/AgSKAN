import { writable } from 'svelte/store'

interface MarkerVisibilitySettings {
    [markerId: string]: 'always' | 'selected'
}

function createMarkerVisibilityStore() {
    const { subscribe, set, update } = writable<MarkerVisibilitySettings>({})

    return {
        subscribe,
        set,
        update,
        // Set visibility for a specific marker
        setMarkerVisibility: (markerId: string, visibility: 'always' | 'selected') => {
            update(settings => ({
                ...settings,
                [markerId]: visibility
            }))
        },
        // Get visibility for a marker (with default)
        getMarkerVisibility: (settings: MarkerVisibilitySettings, markerId: string): 'always' | 'selected' => {
            return settings[markerId] || 'always'
        }
    }
}

export const markerVisibilityStore = createMarkerVisibilityStore()