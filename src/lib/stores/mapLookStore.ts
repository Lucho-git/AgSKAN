// The map look the viewer is drawn with: a preset plus any slider overrides.
// Kept on this device (localStorage) while looks are still being tuned — see
// src/lib/utils/mapLook.ts for what a look contains.
import { derived, get, writable } from "svelte/store"
import {
  DEFAULT_LOOK_STATE,
  resolveLook,
  resolveTrailColor,
  sanitizeLookState,
  type MapLook,
  type MapLookState,
  type PresetName,
} from "$lib/utils/mapLook"

const STORAGE_KEY = "agskan.map_look"

function load(): MapLookState {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_LOOK_STATE }
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitizeLookState(JSON.parse(raw)) : { ...DEFAULT_LOOK_STATE }
  } catch {
    return { ...DEFAULT_LOOK_STATE }
  }
}

function persist(state: MapLookState) {
  try {
    if (typeof localStorage === "undefined") return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private-mode errors
  }
}

export const mapLookState = writable<MapLookState>(load())
mapLookState.subscribe(persist)

/** The fully resolved look (preset with overrides applied). */
export const currentLook = derived(mapLookState, ($state) =>
  resolveLook($state),
)

/** Switch preset. Slider overrides are dropped so the preset shows as designed. */
export function setLookPreset(preset: PresetName) {
  mapLookState.set({ preset, overrides: {} })
}

/** Override one value of the current preset, e.g. ("trails", "opacity", 0.6). */
export function setLookOverride<
  G extends keyof MapLook,
  K extends keyof MapLook[G],
>(group: G, key: K, value: MapLook[G][K]) {
  mapLookState.update((state) => ({
    ...state,
    overrides: {
      ...state.overrides,
      [group]: { ...(state.overrides[group] ?? {}), [key]: value },
    },
  }))
}

export function resetLookOverrides() {
  mapLookState.update((state) => ({ preset: state.preset, overrides: {} }))
}

export type TrailRole = "work" | "pause" | "dimmed"

/** Line opacity for a trail layer under the current look. */
export function trailOpacity(role: TrailRole = "work"): number {
  const t = get(currentLook).trails
  if (role === "pause") return t.pauseOpacity
  if (role === "dimmed") return t.dimmedOpacity
  return t.opacity
}

/** The colour the current look draws for a stored trail colour (name or CSS colour). */
export function trailLineColor(nameOrColor: string | null | undefined): string {
  return resolveTrailColor(nameOrColor, get(currentLook))
}
