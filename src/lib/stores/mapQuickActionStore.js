// mapQuickActionStore.js — registry for the map's quick-action rail.
//
// The rail is the stack of circular buttons that floats just above the
// people (vehicles) button, bottom-left of the map (see MapQuickActions).
// It exists so optional, feature-specific shortcuts can live on the map
// without cluttering the toolbox — e.g. one button per field bin while
// "Show bins always" is on.
//
// ── Future-proofing contract ────────────────────────────────────────────
// A PROVIDER is a plain object:
//   {
//     id: string,                 // unique
//     order?: number,             // stack order (lower = shown higher up), default 100
//     getItems(ctx) => Item[]     // called reactively; return [] to hide
//   }
//
// `ctx` carries everything a provider needs to decide (passed from
// MapQuickActions):
//   {
//     map,                        // mapbox instance (or null)
//     settings,                   // $userSettingsStore — per-user settings
//     markers,                    // $confirmedMarkersStore
//     glyph,                      // $grainBinGlyphsStore (lazy bin glyphs)
//     canEdit,                    // false for guests / viewers
//   }
//
// An ITEM describes one circular button:
//   {
//     id: string,                 // unique — used as the {#each} key
//     label: string,              // aria-label
//     title?: string,             // hover tooltip
//     accent: string,             // border + level-bar colour
//     bg?: string,                // button disc colour (default: dark glass)
//     iconSvg?: string,           // inline <svg> markup (provider decides tint)
//     icon?: SvelteComponent,     // alternative: a component (e.g. lucide icon)
//     fill?: number | null,       // 0-100 → draws the mini level bar
//     text?: string | null,       // short side tag (e.g. a bin's contents)
//     onActivate?: () => void,
//   }
//
// Visibility RULES live inside each provider (e.g. "only while the user's
// Show-bins-always setting is on", or a future "only during harvest" season
// rule). That is the "customizable + off by default" part: register a new
// provider and it lights up only for users/conditions it applies to — the
// rail itself never needs to change.
//
// Registration returns its own cleanup function, so a provider component
// can `return registerQuickActionProvider(...)` from onMount.

import { writable } from "svelte/store"

const registry = new Map()

/** All registered providers, ordered for the rail (top → bottom). */
export const quickActionProvidersStore = writable([])

function publish() {
  quickActionProvidersStore.set(
    [...registry.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
  )
}

/**
 * Register a quick-action provider for the map rail.
 * @param {{ id: string, order?: number, getItems: (ctx: any) => any[] }} provider
 * @returns {() => void} unregister
 */
export function registerQuickActionProvider(provider) {
  if (!provider?.id || typeof provider.getItems !== "function") {
    return () => {}
  }
  registry.set(provider.id, provider)
  publish()
  return () => {
    if (registry.get(provider.id) === provider) {
      registry.delete(provider.id)
      publish()
    }
  }
}
