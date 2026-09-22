// src/stores/userSettingsStore.ts
import { writable } from 'svelte/store';
import { TINT_MODE_DEFAULT } from '../components/map/markers/markerPalette';

// Default settings - start with 7 days ago
const defaultSettings = {
    markerStyle: TINT_MODE_DEFAULT, // Global marker style (tint mode) applied to every marker
    markerDefaultColorMode: 'single', // Legacy — single/custom mode is gone; the modal always writes 'single'
    markerDefaultColor: 'default', // 'All markers' base colour: a colour key, 'random', or 'default' = the style's original neutral
    markerTypeDefaultColors: {} as Record<string, string>, // Per-marker-type default colours ({iconClass: colorKey})
    markerUsageCounts: {} as Record<string, number>, // {iconClass: count} — stat of markers placed by this account
    markerUsageOrder: [] as string[], // iconClass list, most-recently-used first ([0] = last used) — drives picker recency order
    iconGlassOpacity: 0.3, // 0-1: how strong the translucent disc is for the "Icon only" light/dark styles
    zoomToLocationMarkers: false, // Auto-zoom on quick-drop markers (default off)
    zoomToPlacedMarkers: false, // Camera find on touch hold — no auto-zoom (default off)
    autoConfirmMarkers: false, // Skip marker edit panel — confirm immediately
    showVehiclesAlways: true, // Show offscreen tracking dots for recently-active vehicles (default on)
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
    weatherMenuEnabled: true, // Show Weather menu in map toolbox (default on)
    weatherSource: null as { mode: "farm" | "my"; farmId: string; lat: number | null; lng: number | null } | null, // saved weather location
};

export const userSettingsStore = writable(defaultSettings);