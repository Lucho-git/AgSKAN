// src/lib/utils/mapRoute.ts
//
// Where "the map" is for this person. There are two viewers while the new
// one is being tried out: the current one at /account/mapviewer, and the new
// one at /account/map-preview. People opt in from Settings > Map & display
// (`user_settings.new_map_enabled`); the account menu's Map button and the
// dashboard's "launch map" buttons then open the new one.
//
// Links that open the map AT something (a field, a vehicle) still go to the
// current viewer, which is the one that understands them.
import { get } from "svelte/store"
import { userSettingsStore } from "$lib/stores/userSettingsStore"

export const CURRENT_MAP_ROUTE = "/account/mapviewer"
export const NEW_MAP_ROUTE = "/account/map-preview"

export const mapRouteFor = (newMapEnabled: boolean | null | undefined) =>
  newMapEnabled ? NEW_MAP_ROUTE : CURRENT_MAP_ROUTE

/** The map to open right now (reads the setting as it stands). */
export const mapRoute = () => mapRouteFor(get(userSettingsStore).newMapEnabled)
