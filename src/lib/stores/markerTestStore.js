//$lib/stores/markerTestStore.js

// Holds test-grid markers placed by the "Marker Test" toolbox feature.
// These markers are rendered on the map by MarkerManager (merged into
// refreshMapMarkers) but are NOT persisted — MapStateSaver only syncs
// confirmedMarkersStore, so test markers never reach the DB.

import { writable } from "svelte/store"

function createMarkerTestStore() {
  /** @type {import("svelte/store").Writable<Array<object>>} */
  const { subscribe, set, update } = writable([])

  return {
    subscribe,

    /**
     * Replace all test markers.
     * @param {Array<object>} markers
     */
    set,

    /**
     * Update test markers.
     * @param {(m: Array<object>) => Array<object>} fn
     */
    update,

    /**
     * Remove every test marker (empty the grid).
     */
    clear: () => set([]),
  }
}

export const markerTestStore = createMarkerTestStore()
