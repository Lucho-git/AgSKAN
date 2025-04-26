// 1. Add these settings to a store (e.g., in a userSettingsStore.ts file)
import { writable } from 'svelte/store';

export const userSettingsStore = writable({
    limitMarkersOn: true,
    limitMarkersDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Default: 7 days ago
});