// src/stores/userSettingsStore.ts
import { writable } from 'svelte/store';

// Default settings - start with 7 days ago
const defaultSettings = {
    zoomToLocationMarkers: false, // Auto-zoom on quick-drop markers (default off)
    zoomToPlacedMarkers: true, // Auto-zoom to manually placed markers
    autoConfirmMarkers: false, // Skip marker edit panel — confirm immediately
    satelliteDropdownEnabled: false, // Satellite imagery dropdown (replaces NDVI)
    enabledImageryProviders: [], // Array of enabled imagery provider keys
    defaultImagerySource: 'mapbox', // Default imagery source when loading map
    defaultMarker: {
        "id": "default",
        "name": "Default Marker",
        "class": "default"
    },
    extraMarkers: [] as { id: string; class: string; name: string }[],
    devToolsEnabled: false, // Show Dev Mode & BG Sim buttons in map toolbox
    // GPS-related settings
    enableFull1Hz: false, // Enable native 1Hz UI updates
    showGpsPopups: false, // Show GPS Accepted/Rejected popups (legacy)
    gpsIntervalSeconds: 2, // GPS ping interval in seconds (1-10)
    showGpsAcceptedPopups: false, // Show "GPS Accepted" popups
    showGpsRejectedPopups: false, // Show "GPS Rejected" popups
    layerVisibility: {} as Record<string, boolean>,
    sprayConfirmEnabled: true, // Show spray record confirmation popup on trail close (default on)
    roadOverlaysEnabled: false, // Show Road Overlays (KMZ) menu in map toolbox (default off)
    satelliteMenuEnabled: true, // Show Satellite menu in map toolbox (default on)
    measureMenuEnabled: true, // Show Measure menu in map toolbox (default on)
    flashMenuEnabled: true, // Show Flash Signal menu in map toolbox (default on)
    rockPickingMenuEnabled: true, // Show Rock Picking menu in map toolbox (default on)
    weatherMenuEnabled: false, // Show Weather menu in map toolbox (default off)
    weatherSource: null as { mode: "farm" | "my"; farmId: string; lat: number | null; lng: number | null } | null, // saved weather location
};

export const userSettingsStore = writable(defaultSettings);