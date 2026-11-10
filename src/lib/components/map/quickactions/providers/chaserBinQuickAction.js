// chaserBinQuickAction.js — quick-action provider: one button per chaser bin
// on the map (yours plus every teammate's), each showing that machine's real
// glyph in its body colour, its load bar and current tonnage. Tapping one
// opens the chaser load modal for THAT chaser — any operator can adjust any
// chaser's tonnage; visitors can look but not change.
//
// Visibility: each chaser is a per-viewer choice (user settings
// `chaserRailVisibility`, { vehicleId: true }) and OFF by default, so the rail
// starts clean and you switch on the chasers you want to watch. The whole
// section disappears for visitors (they can't edit anything).

import vehicleComponents from "$lib/vehicles/index.js"
import { markerColor } from "$lib/components/map/markers/markerPalette"
import {
  chaserCapacity,
  chaserLoad,
  formatTonnes,
  isChaserBinType,
} from "$lib/utils/grainLoad"

// Machine colour names (VEHICLE_COLORS) → marker palette keys, so the disc
// wears the machine's own colour instead of an arbitrary one.
/** @type {Record<string, string>} */
const BODY_COLOR_TO_PALETTE = {
  red: "red",
  blue: "blue",
  green: "green",
  yellow: "yellow",
  orange: "orange",
  purple: "purple",
  skyblue: "skyblue",
  lightgreen: "green",
  hotpink: "pink",
}

/** @param {string} bodyColor */
function paletteKeyForBodyColor(bodyColor) {
  const key = String(bodyColor || "").replace(/\s+/g, "").toLowerCase()
  return BODY_COLOR_TO_PALETTE[key] || "blue"
}

/**
 * The machine glyph for a vehicle type (falls back to the pointer).
 * @param {string} type
 */
function machineComponent(type) {
  const registry = /** @type {Record<string, any>} */ (vehicleComponents)
  return registry[type] || vehicleComponents.Pointer
}

/**
 * @param {{ openChaser: (vehicleId: string) => void }} deps
 */
export function createChaserBinQuickAction({ openChaser }) {
  return {
    id: "chaser-bin",
    // Above the grain bins — these are the machines doing the hauling.
    order: 5,
    /**
     * @param {{
     *   vehicle?: any,
     *   otherVehicles?: any[],
     *   chaserLoads?: Record<string, any>,
     *   settings?: { chaserRailVisibility?: Record<string, boolean> },
     *   canEdit?: boolean,
     * }} ctx
     */
    getItems({ vehicle, otherVehicles, chaserLoads, settings, canEdit }) {
      if (!canEdit) return []

      const ownId = vehicle?.vehicle_id || null
      const chasers = []

      if (ownId && isChaserBinType(vehicle?.vehicle_marker?.type)) {
        chasers.push({
          id: ownId,
          marker: vehicle.vehicle_marker,
          ownerName: "You",
          own: true,
        })
      }

      for (const other of otherVehicles || []) {
        if (!other?.vehicle_id || other.vehicle_id === ownId) continue
        if (!isChaserBinType(other?.vehicle_marker?.type)) continue
        chasers.push({
          id: other.vehicle_id,
          marker: other.vehicle_marker,
          ownerName: (other.full_name || "Teammate").trim(),
          own: false,
        })
      }

      // Off by default: only chasers this viewer has switched on show up.
      return chasers
        .filter((c) => settings?.chaserRailVisibility?.[c.id] === true)
        .map((c) => {
          const state = chaserLoads?.[c.id] || null
          const capacity = chaserCapacity(state)
          const load = chaserLoad(state)
          const fill = capacity > 0 ? (load / capacity) * 100 : 0
          const def = markerColor(
            paletteKeyForBodyColor(c.marker.bodyColor),
            "original",
          )
          return {
            id: `chaser-bin-${c.id}`,
            label: c.own
              ? "Your chaser bin load"
              : `${c.ownerName} — chaser bin load`,
            title: `${c.ownerName} — ${formatTonnes(load)} of ${capacity} t`,
            accent: def.dark,
            bg: def.light,
            fill,
            tonnes: formatTonnes(load),
            text: c.own ? "You" : c.ownerName,
            // The real machine glyph, tinted with its body colour.
            icon: machineComponent(c.marker.type),
            iconProps: {
              bodyColor: c.marker.bodyColor || "red",
              size: "30px",
            },
            onActivate: () => openChaser(c.id),
          }
        })
    },
  }
}
