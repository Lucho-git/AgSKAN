// src/lib/utils/grainLoad.js
// Grain-load maths for the chaser bin + the one-tap "empty into a bin"
// transfer.
//
// Where the chaser's load lives: on the user's OWN vehicle marker
// (`vehicle_marker.grainLoad` / `grainCapacity`, in tonnes). That object is
// already broadcast and upserted to `vehicle_state.vehicle_marker` by
// VehicleStateSynchronizer, so the load reaches every connected user — and
// survives a reload — with no new table and no schema change.
//
// Bin maths mirrors what the bin panel/quick modal already do:
//   stored tonnes = capacity × fill% / 100
// and a transfer keeps the fill as a precise float (rounding to whole % would
// quantize small tonne steps, e.g. +1 t on a 300 t bin).

/** Vehicle types that carry a grain tank (the two chaser bins). */
export const CHASER_BIN_TYPES = [
  "FrontWheelChaserBin",
  "FourWheelDriveChaserBin",
]

/** Chaser-bin size (t) used when the vehicle has no capacity stored yet. */
export const CHASER_BIN_DEFAULT_CAPACITY = 40

/** Slider step (t) — small enough to load a truck in a few drags. */
export const CHASER_BIN_LOAD_STEP = 0.5

/** @param {string | null | undefined} type */
export function isChaserBinType(type) {
  return CHASER_BIN_TYPES.includes(type || "")
}

/**
 * Round to 2 decimals — kills float dust from percentage round-trips.
 * @param {number} value
 */
export function roundTonnes(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * The chaser's tank size in tonnes (stored, else the default).
 * @param {{ grainCapacity?: number | null } | null | undefined} vehicleMarker
 */
export function chaserCapacity(vehicleMarker) {
  const stored = Number(vehicleMarker?.grainCapacity)
  if (Number.isFinite(stored) && stored > 0) return stored
  return CHASER_BIN_DEFAULT_CAPACITY
}

/**
 * The chaser's current load in tonnes, clamped to its tank size.
 * @param {{ grainLoad?: number | null, grainCapacity?: number | null } | null | undefined} vehicleMarker
 */
export function chaserLoad(vehicleMarker) {
  const capacity = chaserCapacity(vehicleMarker)
  const load = Number(vehicleMarker?.grainLoad)
  if (!Number.isFinite(load) || load <= 0) return 0
  return roundTonnes(Math.min(capacity, load))
}

/**
 * Tonnes currently in a bin (capacity × fill%).
 * @param {number} capacityTonnes
 * @param {number} fillPercent
 */
export function binStoredTonnes(capacityTonnes, fillPercent) {
  const capacity = Number(capacityTonnes) || 0
  if (capacity <= 0) return 0
  const fill = Math.max(0, Math.min(100, Number(fillPercent) || 0))
  return roundTonnes((capacity * fill) / 100)
}

/**
 * Free space in a bin (tonnes).
 * @param {number} capacityTonnes
 * @param {number} fillPercent
 */
export function binFreeTonnes(capacityTonnes, fillPercent) {
  const capacity = Number(capacityTonnes) || 0
  if (capacity <= 0) return 0
  return roundTonnes(Math.max(0, capacity - binStoredTonnes(capacity, fillPercent)))
}

/**
 * Work out what a one-tap empty would move.
 *
 * Moves as much of the chaser's load as the bin has room for — a part load
 * when the bin can't take it all (the rest stays in the chaser), which is
 * exactly what an operator does in the paddock.
 *
 * @param {{ loadTonnes: number, binFill: number, binCapacity: number }} args
 * @returns {{
 *   moved: number,
 *   loadAfter: number,
 *   binFillAfter: number,
 *   binStoredAfter: number,
 *   binRoom: number,
 *   overflows: boolean,
 * }}
 */
export function planTransfer({ loadTonnes, binFill, binCapacity }) {
  const load = Math.max(0, Number(loadTonnes) || 0)
  const capacity = Math.max(0, Number(binCapacity) || 0)
  const room = binFreeTonnes(capacity, binFill)
  const moved = roundTonnes(Math.min(load, room))
  const storedAfter = binStoredTonnes(capacity, binFill) + moved
  const fillAfter =
    capacity > 0
      ? Math.min(100, Math.max(0, (storedAfter / capacity) * 100))
      : Number(binFill) || 0

  return {
    moved,
    loadAfter: roundTonnes(Math.max(0, load - moved)),
    binFillAfter: fillAfter,
    binStoredAfter: roundTonnes(storedAfter),
    binRoom: room,
    overflows: roundTonnes(load - moved) > 0,
  }
}

/**
 * "38.5 t" — whole tonnes once past 10, one decimal below so small test
 * amounts stay readable (same convention as the bin rail button).
 * @param {number} tonnes
 */
export function formatTonnes(tonnes) {
  const n = Number(tonnes) || 0
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} t`
}
