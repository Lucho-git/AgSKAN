// src/stores/userSettingsStore.js
import { writable } from 'svelte/store';

// Default settings - start with 7 days ago
const defaultSettings = {
    limitMarkersOn: false,
    limitMarkersDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Default: 7 days ago
    limitMarkersDays: 7 // Default slider position: 7 days
};

export const userSettingsStore = writable(defaultSettings);