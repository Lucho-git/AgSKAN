// Map "look": one object that describes how the map viewer is coloured —
// imagery treatment, the wash outside paddocks, field fills/outlines and trail
// colours/opacity. Everything here is pure so it can be unit tested; the live
// map is driven by MapLook.svelte, which applies a resolved look with
// setPaintProperty.
//
// Why trails are routed through a palette: `trails.trail_color` stores the
// vehicle colour NAME ("Red", "SkyBlue"), which Mapbox renders as the pure CSS
// colour (#ff0000, #ffff00 …). Mapping the name through a palette lets a look
// restyle every existing trail without touching stored data.

export type TrailPaletteName = "classic" | "soft" | "earth"
export type PresetName = "classic" | "muted" | "mono" | "spotlight" | "records"

export interface MapLook {
  basemap: {
    /** -1 (greyscale) … 1. Mapbox raster-saturation. */
    saturation: number
    /** -1 … 1. Mapbox raster-contrast. */
    contrast: number
    /** 0 … 1. Lifts the darkest imagery (raster-brightness-min). */
    brightnessMin: number
    /** 0 … 1. Caps the brightest imagery (raster-brightness-max). */
    brightnessMax: number
    /** Hide the Mapbox style's own roads, borders and place labels. */
    hideRoadsAndLabels: boolean
  }
  outside: {
    /** 0 … 1 opacity of the dark wash drawn over everything outside fields. */
    strength: number
  }
  fields: {
    fillOpacity: number
    selectedFillOpacity: number
    outlineWidth: number
    outlineOpacity: number
    /** Fill / outline for fields whose colour is "default". */
    defaultFill: string
    defaultOutline: string
    /** Give default-coloured fields a varied earthy fill (by field order). */
    autoPalette: boolean
    /** Swap the pure-hex picker colours (#FFFF00, #FF0000) for calmer ones. */
    softenCustom: boolean
  }
  trails: {
    opacity: number
    pauseOpacity: number
    /** Opacity of the other trails while one trail is selected. */
    dimmedOpacity: number
    palette: TrailPaletteName
  }
}

export type MapLookOverrides = {
  [G in keyof MapLook]?: Partial<MapLook[G]>
}

export interface MapLookState {
  preset: PresetName
  overrides: MapLookOverrides
}

/** Vehicle colour names (lower-cased) → hex, per palette. */
export const TRAIL_PALETTES: Record<
  TrailPaletteName,
  Record<string, string>
> = {
  // Exactly what Mapbox draws today for the CSS colour names.
  classic: {
    red: "#ff0000",
    blue: "#0000ff",
    green: "#008000",
    yellow: "#ffff00",
    orange: "#ffa500",
    purple: "#800080",
    skyblue: "#87ceeb",
    lightgreen: "#90ee90",
    hotpink: "#ff69b4",
  },
  // The shades the vehicle name tags and badges already use.
  soft: {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    yellow: "#eab308",
    orange: "#f97316",
    purple: "#a855f7",
    skyblue: "#38bdf8",
    lightgreen: "#a3e635",
    hotpink: "#ec4899",
  },
  // Muted farm tones.
  earth: {
    red: "#c8553d",
    blue: "#3d6f9e",
    green: "#5a8f4e",
    yellow: "#d9a441",
    orange: "#d97b29",
    purple: "#7d5ba6",
    skyblue: "#6fa8c7",
    lightgreen: "#9bbf6a",
    hotpink: "#c96b8f",
  },
}

export const TRAIL_FALLBACK_COLOR = "#FF0000"

/** The wash outside paddocks is always a dark neutral: it dims without tinting. */
export const OUTSIDE_WASH_COLOR = "#101418"

/** Earthy fills handed out to default-coloured fields when autoPalette is on. */
export const FIELD_AUTO_PALETTE = [
  "#e0b040",
  "#5fa055",
  "#a8532f",
  "#f2d13a",
  "#3f8a55",
  "#c9a227",
  "#7fae5a",
  "#b8683a",
]

/** Calmer stand-ins for the pure-hex colours in the field colour picker. */
const FIELD_SOFT_COLORS: Record<string, string> = {
  "#ffff00": "#e9c46a",
  "#ff0000": "#d1495b",
}

// A preset is a map style (imagery + paddocks + wash) with the trail palette
// that suits it by default. The two halves are independent: MAP_STYLES and
// TRAIL_STYLES below let them be chosen separately (the farmer survey does).
// Every wash is dark and kept moderate, so the land around a farm stays readable.
export const PRESETS: Record<PresetName, MapLook> = {
  // Exactly the values the map used before looks existed.
  classic: {
    basemap: {
      saturation: 0,
      contrast: 0,
      brightnessMin: 0,
      brightnessMax: 1,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0 },
    fields: {
      fillOpacity: 0.1,
      selectedFillOpacity: 0.3,
      outlineWidth: 2,
      outlineOpacity: 0.95,
      defaultFill: "#0080ff",
      defaultOutline: "#bfffbf",
      autoPalette: false,
      softenCustom: false,
    },
    trails: {
      opacity: 0.5,
      pauseOpacity: 0.55,
      dimmedOpacity: 0.25,
      palette: "classic",
    },
  },
  // Calmer satellite colours, paddocks lifted out of a slightly darker surround.
  muted: {
    basemap: {
      saturation: -0.4,
      contrast: -0.08,
      brightnessMin: 0,
      brightnessMax: 0.94,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.25 },
    fields: {
      fillOpacity: 0.05,
      selectedFillOpacity: 0.25,
      outlineWidth: 2,
      outlineOpacity: 0.95,
      defaultFill: "#ffffff",
      defaultOutline: "#f4f1e8",
      autoPalette: false,
      softenCustom: true,
    },
    trails: {
      opacity: 0.55,
      pauseOpacity: 0.55,
      dimmedOpacity: 0.2,
      palette: "soft",
    },
  },
  // Black-and-white satellite: paddock tints and trails are the only colour.
  mono: {
    basemap: {
      saturation: -1,
      contrast: 0.08,
      brightnessMin: 0,
      brightnessMax: 0.95,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.2 },
    fields: {
      fillOpacity: 0.2,
      selectedFillOpacity: 0.4,
      outlineWidth: 2,
      outlineOpacity: 0.95,
      defaultFill: "#4f9d69",
      defaultOutline: "#e8f3ea",
      autoPalette: false,
      softenCustom: true,
    },
    trails: {
      opacity: 0.55,
      pauseOpacity: 0.55,
      dimmedOpacity: 0.2,
      palette: "soft",
    },
  },
  // Full-colour satellite inside crisp white outlines, the surround dimmed.
  spotlight: {
    basemap: {
      saturation: 0,
      contrast: 0.05,
      brightnessMin: 0,
      brightnessMax: 1,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.4 },
    fields: {
      fillOpacity: 0.03,
      selectedFillOpacity: 0.2,
      outlineWidth: 2.5,
      outlineOpacity: 1,
      defaultFill: "#ffffff",
      defaultOutline: "#ffffff",
      autoPalette: false,
      softenCustom: true,
    },
    trails: {
      opacity: 0.55,
      pauseOpacity: 0.55,
      dimmedOpacity: 0.2,
      palette: "soft",
    },
  },
  // The Records page look: untouched satellite inside green outlines, a deep
  // dark surround, with the Soft trail colours. Its wash
  // is deliberately heavier than the other styles to match that page.
  records: {
    basemap: {
      saturation: 0,
      contrast: 0,
      brightnessMin: 0,
      brightnessMax: 1,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.6 },
    fields: {
      fillOpacity: 0.08,
      selectedFillOpacity: 0.25,
      outlineWidth: 2,
      outlineOpacity: 0.8,
      defaultFill: "#22c55e",
      defaultOutline: "#22c55e",
      autoPalette: false,
      softenCustom: false,
    },
    trails: {
      opacity: 0.6,
      pauseOpacity: 0.55,
      dimmedOpacity: 0.2,
      palette: "soft",
    },
  },
}

export const PRESET_LABELS: Record<PresetName, string> = {
  classic: "Classic",
  muted: "Muted",
  mono: "Mono",
  spotlight: "Spotlight",
  records: "Records",
}

/** Display order, from today's map to furthest from it. */
export const PRESET_ORDER: PresetName[] = [
  "classic",
  "muted",
  "spotlight",
  "mono",
  "records",
]

/** One plain line per map style. */
export const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
  classic: "The map as it is today.",
  muted: "Softer satellite colours, a little darker outside your paddocks.",
  mono: "Black-and-white satellite view with tinted paddocks.",
  spotlight: "Full-colour paddocks with everything around them dimmed.",
  records: "Like the Records page: green outlines on a deep dark surround.",
}

export const TRAIL_PALETTE_LABELS: Record<TrailPaletteName, string> = {
  classic: "Classic",
  soft: "Soft",
  earth: "Earth",
}

/** The map half of a preset: everything except its trails. */
export type MapStyle = Omit<MapLook, "trails">

export const MAP_STYLES = Object.fromEntries(
  Object.entries(PRESETS).map(([name, look]) => [
    name,
    { basemap: look.basemap, outside: look.outside, fields: look.fields },
  ]),
) as Record<PresetName, MapStyle>

/** Trail colours + opacity for each palette, usable with any map style. */
export const TRAIL_STYLES: Record<TrailPaletteName, MapLook["trails"]> = {
  classic: PRESETS.classic.trails,
  soft: {
    opacity: 0.55,
    pauseOpacity: 0.55,
    dimmedOpacity: 0.2,
    palette: "soft",
  },
  earth: {
    opacity: 0.6,
    pauseOpacity: 0.55,
    dimmedOpacity: 0.2,
    palette: "earth",
  },
}

/** A map style and a trail palette, chosen separately, as one look. */
export function composeLook(
  map: PresetName,
  trails: TrailPaletteName,
): MapLook {
  const style = MAP_STYLES[map] ?? MAP_STYLES.classic
  return { ...style, trails: TRAIL_STYLES[trails] ?? TRAIL_STYLES.classic }
}

export const DEFAULT_LOOK_STATE: MapLookState = {
  preset: "classic",
  overrides: {},
}

const GROUPS = ["basemap", "outside", "fields", "trails"] as const

/** Preset + overrides → the full look to draw. Unknown presets fall back to Classic. */
export function resolveLook(
  state: Partial<MapLookState> | null | undefined,
): MapLook {
  const base = PRESETS[state?.preset as PresetName] ?? PRESETS.classic
  const overrides = state?.overrides ?? {}
  const look = {} as Record<string, unknown>
  for (const group of GROUPS) {
    look[group] = { ...base[group], ...(overrides[group] ?? {}) }
  }
  return look as unknown as MapLook
}

/** Tidy anything read back from storage into a valid state. */
export function sanitizeLookState(raw: unknown): MapLookState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LOOK_STATE }
  const r = raw as Partial<MapLookState>
  const preset = (
    r.preset && r.preset in PRESETS ? r.preset : "classic"
  ) as PresetName
  const overrides: MapLookOverrides = {}
  if (r.overrides && typeof r.overrides === "object") {
    for (const group of GROUPS) {
      const g = (r.overrides as Record<string, unknown>)[group]
      if (!g || typeof g !== "object") continue
      const known = PRESETS.classic[group] as Record<string, unknown>
      const kept: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
        if (k in known && typeof v === typeof known[k]) kept[k] = v
      }
      if (Object.keys(kept).length)
        (overrides as Record<string, unknown>)[group] = kept
    }
  }
  return { preset, overrides }
}

/**
 * A stored trail colour (vehicle colour name, or any CSS colour) → the colour
 * this look draws. Names outside the palette pass through untouched.
 */
export function resolveTrailColor(
  nameOrColor: string | null | undefined,
  look: MapLook,
): string {
  const raw = (nameOrColor ?? "").trim()
  if (!raw) return TRAIL_FALLBACK_COLOR
  const palette = TRAIL_PALETTES[look.trails.palette] ?? TRAIL_PALETTES.classic
  return palette[raw.toLowerCase()] ?? raw
}

/** The nine machine colours, in picker order, with display names. */
export const MACHINE_COLOURS: { key: string; label: string }[] = [
  { key: "red", label: "Red" },
  { key: "orange", label: "Orange" },
  { key: "yellow", label: "Yellow" },
  { key: "lightgreen", label: "Light green" },
  { key: "green", label: "Green" },
  { key: "skyblue", label: "Sky blue" },
  { key: "blue", label: "Blue" },
  { key: "purple", label: "Purple" },
  { key: "hotpink", label: "Hot pink" },
]

/** The colour each machine's trails are drawn in under a look. */
export function trailLegend(
  look: MapLook,
): { key: string; label: string; color: string }[] {
  const palette = TRAIL_PALETTES[look.trails.palette] ?? TRAIL_PALETTES.classic
  return MACHINE_COLOURS.map(({ key, label }) => ({
    key,
    label,
    color: palette[key],
  }))
}

/** [r, g, b] for a stored trail colour, for rgba() gradients. Null if not a palette name or hex. */
export function resolveTrailRgb(
  nameOrColor: string | null | undefined,
  look: MapLook,
): [number, number, number] | null {
  const hex = resolveTrailColor(nameOrColor, look)
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Mapbox expression for layers whose features carry the stored colour in a
 * `color` property (the combined active-trails layer).
 */
export function trailColorExpr(look: MapLook, property = "color"): unknown[] {
  const palette = TRAIL_PALETTES[look.trails.palette] ?? TRAIL_PALETTES.classic
  const raw = ["to-string", ["get", property]]
  const match: unknown[] = ["match", ["downcase", raw]]
  for (const [name, hex] of Object.entries(palette)) match.push(name, hex)
  match.push(raw)
  return ["to-color", match, TRAIL_FALLBACK_COLOR]
}

/** Raster paint properties for the imagery layers. */
export function basemapPaint(look: MapLook): Record<string, number> {
  const b = look.basemap
  const min = clamp(b.brightnessMin, 0, 1)
  return {
    "raster-saturation": clamp(b.saturation, -1, 1),
    "raster-contrast": clamp(b.contrast, -1, 1),
    "raster-brightness-min": min,
    "raster-brightness-max": Math.max(min, clamp(b.brightnessMax, 0, 1)),
  }
}

/** Fill + outline colour for one field. `index` is its position in the field list. */
export function fieldColors(
  fieldColor: string | null | undefined,
  index: number,
  look: MapLook,
): { fillColor: string; outlineColor: string } {
  const f = look.fields
  if (!fieldColor || fieldColor === "default") {
    const fill = f.autoPalette
      ? FIELD_AUTO_PALETTE[Math.abs(index) % FIELD_AUTO_PALETTE.length]
      : f.defaultFill
    return { fillColor: fill, outlineColor: f.defaultOutline }
  }
  const custom = f.softenCustom
    ? (FIELD_SOFT_COLORS[fieldColor.toLowerCase()] ?? fieldColor)
    : fieldColor
  // With flat fills the outline is the gap between paddocks, so keep it neutral.
  return {
    fillColor: custom,
    outlineColor: f.autoPalette ? f.defaultOutline : custom,
  }
}

type Ring = number[][]
interface FieldLike {
  boundary?: { type: string; coordinates: unknown } | null
}

/**
 * One huge polygon covering a wide box around all the fields, with the fields
 * cut out as holes. Filled with a tone it washes out everything outside the
 * paddocks. Returns null when there are no usable fields.
 */
export function buildOutsideMask(
  fields: FieldLike[] | null | undefined,
): { type: "Polygon"; coordinates: Ring[] } | null {
  const usable = (fields || []).filter(
    (f) => f && f.boundary && f.boundary.coordinates,
  )
  if (!usable.length) return null

  const holeRings: Ring[] = []
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const f of usable) {
    const geom = f.boundary!
    const polys = (
      geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates]
    ) as Ring[][]
    for (const poly of polys) {
      const outer = poly?.[0]
      if (!Array.isArray(outer) || outer.length < 4) continue
      holeRings.push([...outer].reverse())
      for (const [lng, lat] of outer) {
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    }
  }
  if (!holeRings.length) return null

  const lngSpan = Math.max(maxLng - minLng, 0.001)
  const latSpan = Math.max(maxLat - minLat, 0.001)
  const pad = 15
  const clampLat = (v: number) => clamp(v, -85, 85)
  const clampLng = (v: number) => clamp(v, -180, 180)
  const w = clampLng(minLng - lngSpan * pad)
  const e = clampLng(maxLng + lngSpan * pad)
  const s = clampLat(minLat - latSpan * pad)
  const n = clampLat(maxLat + latSpan * pad)
  const outerRing: Ring = [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ]

  return { type: "Polygon", coordinates: [outerRing, ...holeRings] }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo))
}
