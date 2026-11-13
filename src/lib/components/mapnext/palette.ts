/**
 * Machine colours for the new map.
 *
 * The app stores a machine's colour by NAME ("Red", "SkyBlue", …) and the old
 * viewer draws that name as a raw CSS colour. The new map keeps the same nine
 * names on disk, so both viewers stay in step, and draws each one in a colour
 * from the landing page's family instead: one new colour per old one.
 *
 * A trail is always the colour of the machine that made it, so the same map
 * is used for `trails.trail_color`.
 */

export type VehicleColour = {
  /** The name saved in `vehicle_marker.bodyColor` (same as the old app). */
  id: string
  /** What the picker calls it. */
  label: string
  /** How the new map draws it. */
  value: string
  /** How the old viewer draws it (the CSS colour of that name). */
  old: string
}

export const VEHICLE_PALETTE: VehicleColour[] = [
  { id: "Red", label: "Red", value: "#C4302B", old: "#ff0000" },
  { id: "Blue", label: "Blue", value: "#2F62D6", old: "#0000ff" },
  { id: "Green", label: "Green", value: "#1F8A4C", old: "#008000" },
  { id: "Yellow", label: "Gold", value: "#E3B50B", old: "#ffff00" },
  { id: "Orange", label: "Orange", value: "#E2701A", old: "#ffa500" },
  { id: "Purple", label: "Purple", value: "#7B4BC4", old: "#800080" },
  { id: "SkyBlue", label: "Sky", value: "#1A9BC2", old: "#87ceeb" },
  { id: "LightGreen", label: "Lime", value: "#7CB518", old: "#90ee90" },
  { id: "HotPink", label: "Pink", value: "#D6408F", old: "#ff69b4" },
]

export const DEFAULT_COLOUR = VEHICLE_PALETTE[1]

const key = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "")

const byKey = new Map<string, VehicleColour>()
for (const colour of VEHICLE_PALETTE) {
  byKey.set(key(colour.id), colour)
  byKey.set(key(colour.value), colour)
  byKey.set(key(colour.old), colour)
}
// Short hex and the colours the first prototype used, so nothing saved
// earlier turns up unpainted.
const ALIASES: Record<string, string> = {
  "#f00": "Red",
  "#00f": "Blue",
  "#ff0": "Yellow",
  "#d95d39": "Orange",
  "#0e8c99": "SkyBlue",
  "#d99a00": "Yellow",
}
for (const [alias, id] of Object.entries(ALIASES))
  byKey.set(alias, byKey.get(key(id))!)

/** The palette entry for a saved colour name or value, if it is one of ours. */
export function findColour(saved: string | null | undefined) {
  return saved ? (byKey.get(key(saved)) ?? null) : null
}

/**
 * The colour to draw for whatever is saved. One of the nine names becomes its
 * new colour; anything else (a custom hex, an old trail colour such as
 * "white") is drawn as it is, and black, which vanishes on the map, becomes
 * the ink green.
 */
export function drawColour(saved: string | null | undefined): string {
  const known = findColour(saved)
  if (known) return known.value
  const raw = (saved ?? "").trim()
  if (!raw) return DEFAULT_COLOUR.value
  if (/^(black|#000|#000000)$/i.test(raw)) return "#15261C"
  return raw
}

/**
 * The colours the admin global map gives farms: bright, well separated, and
 * readable on both its dark map and imagery. The dark look here uses them
 * for paddocks that have no colour of their own, one per block of the farm.
 */
export const BLOCK_COLOURS = [
  "#38bdf8",
  "#f472b6",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#2dd4bf",
  "#c084fc",
  "#f97316",
  "#60a5fa",
  "#e879f9",
  "#4ade80",
]

/** The same hash the admin global map uses, so an id keeps its colour. */
export function blockColour(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return BLOCK_COLOURS[Math.abs(hash) % BLOCK_COLOURS.length]
}
