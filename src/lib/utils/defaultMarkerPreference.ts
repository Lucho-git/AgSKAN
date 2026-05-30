export type MarkerPreference = {
    id: string;
    class: string;
    name: string;
};

const DEFAULT_MARKER_STORAGE_KEY = 'skan_default_marker';

export const DEFAULT_MARKER_PREFERENCE: MarkerPreference = {
    id: 'default',
    class: 'default',
    name: 'Default Marker',
};

export function isDefaultMarkerPreference(marker: MarkerPreference | null | undefined) {
    return !marker || marker.id === 'default' || marker.class === 'default';
}

export function getStoredDefaultMarkerPreference() {
    if (typeof localStorage === 'undefined') return null;

    try {
        const storedMarker = JSON.parse(
            localStorage.getItem(DEFAULT_MARKER_STORAGE_KEY) || 'null',
        );

        if (storedMarker?.id && storedMarker?.class) {
            return storedMarker as MarkerPreference;
        }
    } catch (error) {
        console.warn('Could not read stored default marker:', error);
    }

    return null;
}

export function rememberDefaultMarkerPreference(marker: MarkerPreference | null | undefined) {
    if (typeof localStorage === 'undefined' || !marker) return;

    localStorage.setItem(
        DEFAULT_MARKER_STORAGE_KEY,
        JSON.stringify({ id: marker.id, class: marker.class, name: marker.name }),
    );
}

export function resolveDefaultMarkerPreference(marker: MarkerPreference | null | undefined): MarkerPreference {
    if (marker && !isDefaultMarkerPreference(marker)) return marker;

    return getStoredDefaultMarkerPreference() || marker || DEFAULT_MARKER_PREFERENCE;
}