// src/routes/admin/mapviewer/[type=field|vehicle|marker]/[id]/+page.ts
import type { PageLoad } from "./$types"
import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
import { selectedOperationStore } from "$lib/stores/operationStore"
import { session } from "$lib/stores/sessionStore" // Import session store
import { browser } from "$app/environment"
import { redirect } from "@sveltejs/kit"

import {
    controlStore,
    trailingButtonPressed,
    crispVisibility,
    drawingModeEnabled,
} from "$lib/stores/controlStore"
import {
    currentTrailStore,
    coordinateBufferStore,
    unsavedCoordinatesStore,
} from "$lib/stores/currentTrailStore"
import {
    historicalTrailStore,
    otherActiveTrailStore,
} from "$lib/stores/otherTrailStore"

// Define default values
const defaultStoreValues = {
    controls: {
        showMarkerMenu: false,
        showVehicleMenu: false,
    },
    trailingButtonPressed: false,
    crispVisibility: false,
    drawingModeEnabled: false,
    currentTrail: null,
    coordinateBuffer: [],
    unsavedCoordinates: [],
    historicalTrails: [],
    otherActiveTrails: [],
}

function initializeStores() {
    // Initialize all control-related stores with default values
    controlStore.set(defaultStoreValues.controls)
    trailingButtonPressed.set(defaultStoreValues.trailingButtonPressed)
    crispVisibility.set(defaultStoreValues.crispVisibility)
    drawingModeEnabled.set(defaultStoreValues.drawingModeEnabled)

    // Initialize trail-related stores
    currentTrailStore.set(defaultStoreValues.currentTrail)
    coordinateBufferStore.set(defaultStoreValues.coordinateBuffer)
    unsavedCoordinatesStore.set(defaultStoreValues.unsavedCoordinates)

    // Initialize historical and other active trail stores
    historicalTrailStore.set(defaultStoreValues.historicalTrails)
    otherActiveTrailStore.set(defaultStoreValues.otherActiveTrails)
}

export const load: PageLoad = async ({ url, fetch, depends }) => {
    // Initialize stores with default values first
    initializeStores()

    // Session check is now done on client-side
    // Handle the URL params
    const field = url.searchParams.get("field")
    let objectType: string | null = null
    let objectId: string | null = null

        // Check for any of the possible object types in the query parameters
        ;["field", "vehicle", "marker"].forEach((type) => {
            const id = url.searchParams.get(type)
            if (id) {
                objectType = type
                objectId = id
            }
        })

    // Client-side loading: Return minimal data and let the page component handle the rest
    return {
        field,
        type: objectType,
        id: objectId
    }
}