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

export type TrailPaletteName = "classic" | "soft" | "earth" | "ink"
export type OutsideTone = "dark" | "grey" | "light"
export type PresetName =
  | "classic"
  | "natural"
  | "muted"
  | "spotlight"
  | "earth"
  | "mono"
  | "blocks"
  | "dusk"
  | "paper"
  | "poster"

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
    /** 0 … 1 opacity of the wash drawn over everything outside fields. */
    strength: number
    tone: OutsideTone
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
  // Darker shades that read on light, flat field fills.
  ink: {
    red: "#b3261e",
    blue: "#1e4fa3",
    green: "#1f6b3a",
    yellow: "#a67c00",
    orange: "#b85c00",
    purple: "#5b2a86",
    skyblue: "#1f7fa6",
    lightgreen: "#4f8a2b",
    hotpink: "#b02a6b",
  },
}

export const TRAIL_FALLBACK_COLOR = "#FF0000"

export const OUTSIDE_TONES: Record<OutsideTone, string> = {
  dark: "#101418",
  grey: "#8a8f93",
  light: "#efe9da",
}

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
    outside: { strength: 0, tone: "dark" },
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
  // Calmer imagery, paddocks lifted out of a darkened surround.
  muted: {
    basemap: {
      saturation: -0.45,
      contrast: -0.1,
      brightnessMin: 0,
      brightnessMax: 0.92,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.35, tone: "dark" },
    fields: {
      fillOpacity: 0.06,
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
  // Greyscale imagery: field tints and trails are the only colour.
  mono: {
    basemap: {
      saturation: -1,
      contrast: 0.08,
      brightnessMin: 0,
      brightnessMax: 0.95,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.25, tone: "dark" },
    fields: {
      fillOpacity: 0.25,
      selectedFillOpacity: 0.45,
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
  // Flat, poster-like paddocks on a pale ground; imagery mostly hidden.
  poster: {
    basemap: {
      saturation: -0.6,
      contrast: -0.2,
      brightnessMin: 0,
      brightnessMax: 1,
      hideRoadsAndLabels: true,
    },
    outside: { strength: 0.8, tone: "light" },
    fields: {
      fillOpacity: 0.78,
      selectedFillOpacity: 0.92,
      outlineWidth: 3,
      outlineOpacity: 1,
      defaultFill: "#e0b040",
      defaultOutline: "#efe9da",
      autoPalette: true,
      softenCustom: true,
    },
    trails: {
      opacity: 0.6,
      pauseOpacity: 0.6,
      dimmedOpacity: 0.2,
      palette: "ink",
    },
  },
  // Imagery left alone; only the trail and outline colours calm down.
  natural: {
    basemap: {
      saturation: 0,
      contrast: 0,
      brightnessMin: 0,
      brightnessMax: 1,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0, tone: "dark" },
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
  // Full-colour paddocks, everything around them pushed well back.
  spotlight: {
    basemap: {
      saturation: 0,
      contrast: 0.05,
      brightnessMin: 0,
      brightnessMax: 1,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.6, tone: "dark" },
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
  // Slightly faded imagery with muted farm-tone trails.
  earth: {
    basemap: {
      saturation: -0.3,
      contrast: -0.05,
      brightnessMin: 0,
      brightnessMax: 0.95,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.3, tone: "grey" },
    fields: {
      fillOpacity: 0.08,
      selectedFillOpacity: 0.28,
      outlineWidth: 2,
      outlineOpacity: 0.95,
      defaultFill: "#d9c79a",
      defaultOutline: "#efe6cf",
      autoPalette: false,
      softenCustom: true,
    },
    trails: {
      opacity: 0.6,
      pauseOpacity: 0.6,
      dimmedOpacity: 0.2,
      palette: "earth",
    },
  },
  // A dark, low-glare map for early starts and night shifts.
  dusk: {
    basemap: {
      saturation: -0.35,
      contrast: 0.1,
      brightnessMin: 0,
      brightnessMax: 0.6,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.5, tone: "dark" },
    fields: {
      fillOpacity: 0.05,
      selectedFillOpacity: 0.25,
      outlineWidth: 2,
      outlineOpacity: 0.9,
      defaultFill: "#93c5fd",
      defaultOutline: "#cbd5e1",
      autoPalette: false,
      softenCustom: true,
    },
    trails: {
      opacity: 0.6,
      pauseOpacity: 0.6,
      dimmedOpacity: 0.2,
      palette: "soft",
    },
  },
  // Pale, washed-out imagery with dark outlines and dark trails.
  paper: {
    basemap: {
      saturation: -0.85,
      contrast: -0.3,
      brightnessMin: 0.35,
      brightnessMax: 1,
      hideRoadsAndLabels: true,
    },
    outside: { strength: 0.55, tone: "light" },
    fields: {
      fillOpacity: 0.12,
      selectedFillOpacity: 0.35,
      outlineWidth: 2,
      outlineOpacity: 1,
      defaultFill: "#ffffff",
      defaultOutline: "#334155",
      autoPalette: false,
      softenCustom: true,
    },
    trails: {
      opacity: 0.6,
      pauseOpacity: 0.6,
      dimmedOpacity: 0.2,
      palette: "ink",
    },
  },
  // Greyscale imagery with each paddock tinted its own colour.
  blocks: {
    basemap: {
      saturation: -1,
      contrast: 0,
      brightnessMin: 0,
      brightnessMax: 0.9,
      hideRoadsAndLabels: false,
    },
    outside: { strength: 0.4, tone: "dark" },
    fields: {
      fillOpacity: 0.42,
      selectedFillOpacity: 0.6,
      outlineWidth: 2,
      outlineOpacity: 1,
      defaultFill: "#e0b040",
      defaultOutline: "#f4f1e8",
      autoPalette: true,
      softenCustom: true,
    },
    trails: {
      opacity: 0.6,
      pauseOpacity: 0.6,
      dimmedOpacity: 0.2,
      palette: "soft",
    },
  },
}

export const PRESET_LABELS: Record<PresetName, string> = {
  classic: "Classic",
  natural: "Natural",
  muted: "Muted",
  spotlight: "Spotlight",
  earth: "Earth",
  mono: "Mono",
  blocks: "Blocks",
  dusk: "Dusk",
  paper: "Paper",
  poster: "Poster",
}

/** Display order, from closest to today's map to furthest from it. */
export const PRESET_ORDER: PresetName[] = [
  "classic",
  "natural",
  "muted",
  "spotlight",
  "earth",
  "mono",
  "blocks",
  "dusk",
  "paper",
  "poster",
]

/** One plain line per look, for pickers and the farmer survey. */
export const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
  classic: "The map as it is today.",
  natural: "Today's satellite view with calmer trail colours.",
  muted: "Softer satellite colours, darker outside your paddocks.",
  spotlight: "Full-colour paddocks with everything else dimmed.",
  earth: "Slightly faded satellite view with earthy trail colours.",
  mono: "Black-and-white satellite view with tinted paddocks.",
  blocks: "Black-and-white satellite view, each paddock its own colour.",
  dusk: "A dark map that's easier on the eyes at night.",
  paper: "A pale, washed-out map with dark outlines and trails.",
  poster: "Flat coloured paddocks, like a drawn farm map.",
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
