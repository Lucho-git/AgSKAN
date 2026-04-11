// src/lib/stores/resetMapStores.ts
//
// Clears every map-scoped store to its initial/empty state.
// Must be called at the START of every map join, switch, or disconnect flow
// so stale data from the previous map never bleeds through.

import { operationStore, selectedOperationStore } from "./operationStore"
import {
    otherVehiclesStore,
    serverOtherVehiclesData,
    otherVehiclesDataChanges,
    broadcastMessageEvent,
} from "./vehicleStore"
import { connectedMapStore } from "./connectedMapStore"
import { mapActivityStore } from "./mapActivityStore"
import { trailsMetaDataStore } from "./trailsMetaDataStore"

/**
 * Reset all map-scoped stores to empty/default values.
 *
 * Call this BEFORE populating stores with new map data so that
 * stale operations, vehicles, trails, etc. from a previous map
 * are never visible — even for a single render frame.
 */
export function resetMapStores() {
    console.log("[resetMapStores] Clearing all map-scoped stores")

    // Operations
    operationStore.set([])
    selectedOperationStore.set(null)

    // Vehicles
    otherVehiclesStore.set([])
    serverOtherVehiclesData.set([])
    otherVehiclesDataChanges.set([])
    broadcastMessageEvent.set(null)

    // Map metadata
    connectedMapStore.set({
        id: null,
        map_name: null,
        master_user_id: null,
        owner: null,
        is_owner: false,
        masterSubscription: null,
        is_connected: false,
    })

    mapActivityStore.set({
        marker_count: 0,
        trail_count: 0,
        connected_profiles: [],
        vehicle_states: [],
    })

    // Trails metadata
    trailsMetaDataStore.set([])
}
