// src/stores/userSettingsStore.ts
import { writable } from 'svelte/store';

// Default settings - start with 7 days ago
const defaultSettings = {
    limitMarkersOn: false,
    limitMarkersDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Default: 7 days ago
    limitMarkersDays: 7, // Default slider position: 7 days
    backgroundGeolocationEnabled: false, // Background location tracking
    zoomToLocationMarkers: true, // Auto-zoom to location-based markers
    zoomToPlacedMarkers: true, // Auto-zoom to manually placed markers
    satelliteDropdownEnabled: false, // Satellite imagery dropdown (replaces NDVI)
    enabledImageryProviders: [], // Array of enabled imagery provider keys
    defaultImagerySource: 'mapbox' // Default imagery source when loading map
};

export const userSettingsStore = writable(defaultSettings);