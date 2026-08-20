// Shared marker colour palette + tint modes.
//
// The colour `key` is persisted on markers (`markerColor` → `marker_color`
// in marker_data.properties) and tints the on-map marker background circle
// at runtime. "default" keeps the original baked-in look — every other key
// generates a tinted icon variant on the client (see MarkerManager
// `registerTintedMarkerIcons`), so no build step / new PNGs are needed.
//
// Each colour has three shades:
//   `light` — pale "balancing" fill (icon-fill circle / swatch)
//   `dark`  — vivid accent (selection ring, ring stroke)
//   `deep`  — rich deep shade (circle-fill circle / icon-fill glyph)
//
// Two tint modes (switched per-marker from the marker menu, persisted as
// `tintMode` → `tint_mode`):
//   "circle-fill" — the whole circle takes the deep shade, the glyph inside
//                   turns white/grey so the symbol always stays visible.
//   "icon-fill"   — the glyph takes the deep rich shade and the circle
//                   becomes the pale balancing colour.

export interface MarkerColor {
  key: string
  label: string
  light: string
  dark: string
  deep: string
}

export const MARKER_COLORS: MarkerColor[] = [
  // "default" = no colour chosen — resolves to the selected style's default
  // colour at render time (see STYLE_DEFAULT_COLORS below).
  { key: "default", label: "Default", light: "#e5e7eb", dark: "#000000", deep: "#111827" },
  // The 8 normal colours (yellow restored 2026-08)
  { key: "red", label: "Red", light: "#fecaca", dark: "#dc2626", deep: "#991b1b" },
  { key: "blue", label: "Blue", light: "#bfdbfe", dark: "#2563eb", deep: "#1e40af" },
  { key: "green", label: "Green", light: "#bbf7d0", dark: "#16a34a", deep: "#166534" },
  { key: "orange", label: "Orange", light: "#fed7aa", dark: "#ea580c", deep: "#9a3412" },
  { key: "yellow", label: "Yellow", light: "#fef08a", dark: "#eab308", deep: "#a16207" },
  { key: "purple", label: "Purple", light: "#e9d5ff", dark: "#9333ea", deep: "#6b21a8" },
  { key: "pink", label: "Pink", light: "#fbcfe8", dark: "#db2777", deep: "#9d174d" },
  // Sky blue is a VERY light blue (2026-08-20) so it clearly reads as
  // different from the regular blue.
  { key: "skyblue", label: "Sky blue", light: "#e0f2fe", dark: "#7dd3fc", deep: "#38bdf8" },
  // Rainbow — the circle/glyph gets an angular rainbow gradient instead of a
  // solid shade (light/dark/deep are placeholders; a solid ring can't be a
  // rainbow so it falls back to dark slate).
  { key: "rainbow", label: "Rainbow", light: "#ffffff", dark: "#ffffff", deep: "#ffffff" },
  // Black + white are also pickable (white pops on the dark-glass disc).
  { key: "black", label: "Black", light: "#e5e7eb", dark: "#000000", deep: "#111827" },
  { key: "white", label: "White", light: "#ffffff", dark: "#ffffff", deep: "#f8fafc" },
]

export type PaletteVariantKey = "v1" | "v2" | "v3"

export interface MarkerPaletteVariant {
  key: PaletteVariantKey
  label: string
  colors: MarkerColor[]
}

// The three selectable palette variants. Each provides its own light/dark/
// deep shade set per colour — the shades a marker style actually paints.
// v1 is the original palette; v2/v3 are experimental variations so hue
// drift (e.g. deep yellow reading as orange) can be compared live from
// Profile → Marker Settings → Colour palette.
export const PALETTE_VARIANTS: Record<
  PaletteVariantKey,
  MarkerPaletteVariant
> = {
  v1: { key: "v1", label: "Current", colors: MARKER_COLORS },
  v2: {
    key: "v2",
    label: "Vivid",
    colors: [
      { key: "default", label: "Default", light: "#e5e7eb", dark: "#000000", deep: "#111827" },
      { key: "red", label: "Red", light: "#fee2e2", dark: "#ef4444", deep: "#b91c1c" },
      { key: "blue", label: "Blue", light: "#dbeafe", dark: "#3b82f6", deep: "#1d4ed8" },
      { key: "green", label: "Green", light: "#dcfce7", dark: "#22c55e", deep: "#15803d" },
      { key: "orange", label: "Orange", light: "#ffedd5", dark: "#f97316", deep: "#c2410c" },
      { key: "yellow", label: "Yellow", light: "#fef9c3", dark: "#facc15", deep: "#ca8a04" },
      { key: "purple", label: "Purple", light: "#f3e8ff", dark: "#a855f7", deep: "#7e22ce" },
      { key: "pink", label: "Pink", light: "#fce7f3", dark: "#ec4899", deep: "#be185d" },
      { key: "skyblue", label: "Sky blue", light: "#e0f2fe", dark: "#7dd3fc", deep: "#38bdf8" },
      { key: "rainbow", label: "Rainbow", light: "#ffffff", dark: "#ffffff", deep: "#ffffff" },
      { key: "black", label: "Black", light: "#e5e7eb", dark: "#000000", deep: "#111827" },
      { key: "white", label: "White", light: "#ffffff", dark: "#ffffff", deep: "#f8fafc" },
    ],
  },
  v3: {
    key: "v3",
    label: "Deep",
    colors: [
      { key: "default", label: "Default", light: "#e5e7eb", dark: "#000000", deep: "#111827" },
      { key: "red", label: "Red", light: "#fecaca", dark: "#dc2626", deep: "#7f1d1d" },
      { key: "blue", label: "Blue", light: "#bfdbfe", dark: "#2563eb", deep: "#1e3a8a" },
      { key: "green", label: "Green", light: "#bbf7d0", dark: "#16a34a", deep: "#14532d" },
      { key: "orange", label: "Orange", light: "#fed7aa", dark: "#ea580c", deep: "#7c2d12" },
      { key: "yellow", label: "Yellow", light: "#fef08a", dark: "#eab308", deep: "#ca8a04" },
      { key: "purple", label: "Purple", light: "#e9d5ff", dark: "#9333ea", deep: "#6b21a8" },
      { key: "pink", label: "Pink", light: "#fbcfe8", dark: "#db2777", deep: "#9d174d" },
      { key: "skyblue", label: "Sky blue", light: "#e0f2fe", dark: "#7dd3fc", deep: "#38bdf8" },
      { key: "rainbow", label: "Rainbow", light: "#ffffff", dark: "#ffffff", deep: "#ffffff" },
      { key: "black", label: "Black", light: "#e5e7eb", dark: "#000000", deep: "#111827" },
      { key: "white", label: "White", light: "#ffffff", dark: "#ffffff", deep: "#f8fafc" },
    ],
  },
}

// The currently active palette variant. Defaults to Vivid (v2) — the chosen
// palette for all icon styles; the MarkerManager store subscription syncs it
// from user_settings.marker_palette_variant.
let activePaletteVariant: PaletteVariantKey = "v2"

export function getActivePaletteVariant(): PaletteVariantKey {
  return activePaletteVariant
}

export function setActivePaletteVariant(key: string): void {
  if (key === "v1" || key === "v2" || key === "v3") activePaletteVariant = key
}

// Suffix baked into tinted-icon image names so each palette variant gets its
// own cached images (switching variants re-tints instead of reusing old
// tinted icons from the previous variant). Original always uses the classic
// palette, so its icons never carry a variant suffix.
export function paletteVariantSuffix(mode?: string | null): string {
  if (mode === "original") return ""
  return activePaletteVariant === "v1" ? "" : `-${activePaletteVariant}`
}

export const MARKER_COLOR_DEFAULT = "default"

// The colours offered in the colour pickers/wheels. Rainbow is intentionally
// excluded to keep every menu compact (it's still in MARKER_COLORS so
// existing markers that use it keep rendering; it can also still appear as a
// per-type/random default). Black and white ARE offered — they make great
// high-contrast marker colours on the map.
export const PICKABLE_MARKER_COLORS: MarkerColor[] = MARKER_COLORS.filter(
  (c) => c.key !== "rainbow",
)

// ── Style-aware neutral colours ──
// Black and white are only OFFERED as colour options (and used as the
// "natural" default) when they complement the style — a white glyph on a
// white disc would be invisible, a black icon on the dark glass disc would
// vanish, etc. Complementary neutrals per style:
//   original → white (pale disc), circle-fill → black (white glyph pops),
//   circle-fill-black → white (black glyph pops), icon-fill → black (dark
//   icon on the white canvas), icon-only → both, icon-dark-glass → white,
//   icon-light-glass → black. Unknown styles keep both (current behaviour).
const STYLE_NEUTRAL_COLORS: Record<string, string[]> = {
  original: ["white"],
  "circle-fill": ["black"],
  "circle-fill-black": ["white"],
  "icon-fill": ["black"],
  "icon-only": ["black", "white"],
  "icon-dark-glass": ["white"],
  "icon-light-glass": ["black"],
}

// The colours offered in the pickers for a given style: the normal palette
// plus black/white ONLY when the style complements them (Default excluded).
export function pickableColorsForStyle(
  styleKey?: string | null,
): MarkerColor[] {
  const neutrals = STYLE_NEUTRAL_COLORS[styleKey || ""]
  return PICKABLE_MARKER_COLORS.filter((c) => {
    if (c.key === MARKER_COLOR_DEFAULT) return false
    if (c.key === "black" || c.key === "white") {
      return neutrals ? neutrals.includes(c.key) : true
    }
    return true
  })
}

// ── Colour ↔ style compatibility ──
// Normal palette colours (red, blue, …) work in every style, but black/white
// only read well on complementary styles (see STYLE_NEUTRAL_COLORS): a white
// glyph on a white disc is invisible, a black icon on the dark glass disc
// vanishes. compatibleColorForStyle is a PER-VIEWER RENDER-TIME adjustment:
// a marker stored as white/black that doesn't complement the viewer's
// CURRENT style renders as the style's compatible neutral — opposing styles
// swap white ↔ black (white on circle-fill → black, black on circle-fill-
// black → white, …). The shared stored colour is NEVER changed, so two
// users on the same map with different styles each see readable markers.
export function compatibleColorForStyle(
  colorKey?: string | null,
  styleKey?: string | null,
): string {
  if (colorKey !== "black" && colorKey !== "white") {
    return colorKey || MARKER_COLOR_DEFAULT
  }
  const neutrals = STYLE_NEUTRAL_COLORS[styleKey || ""]
  if (!neutrals || neutrals.includes(colorKey)) return colorKey
  return neutrals[0]
}

export function markerColor(
  key?: string | null,
  mode?: string | null,
): MarkerColor {
  // Only two colour sets are used: the Original style always keeps the
  // classic (v1 / Current) palette; every other style uses the selected
  // variant (Vivid by default) with one consistent shade.
  const variantKey = mode === "original" ? "v1" : activePaletteVariant
  const colors = PALETTE_VARIANTS[variantKey].colors
  return (
    colors.find((c) => c.key === key) ||
    colors.find((c) => c.key === MARKER_COLOR_DEFAULT) ||
    colors[0]
  )
}

// ── Silo grain colour ──
// Silos use the SAME palette as standard markers for their grain colour (no
// separate silo palette). Default is yellow; legacy siloPalette keys map to
// standard ones so old testing silos still render sensibly.
export const SILO_COLOR_DEFAULT = "yellow"

export const LEGACY_SILO_COLOR_KEYS: Record<string, string> = {
  amber: "orange",
  cyan: "skyblue",
  slate: "blue",
}

/** Resolve a stored grain colour to a standard marker palette key. */
export function siloColorKey(key?: string | null): string {
  const k = key || SILO_COLOR_DEFAULT
  return LEGACY_SILO_COLOR_KEYS[k] || k
}

// Custom SVG icons that KEEP their baked-in glyph colours (rock, rock pile,
// tree, wheat, kangaroo sign). Every OTHER custom SVG marker tints fully
// with the chosen colour (like atlas/ionic icons). The water tank tints its
// outer tank but its inner droplet carries an explicit blue fill that
// survives the tint wrapper, so the droplet stays blue.
const KEEP_GLYPH_CUSTOM_SVG = new Set([
  "custom-svg-rock",
  "custom-svg-rock_pile",
  "custom-svg-tree13",
  "custom-svg-wheat2",
  "custom-svg-kangaroo",
])

/**
 * True for custom SVG icons that keep their glyph's original colours (rock,
 * rock pile, tree, wheat, kangaroo sign). The rest are treated like
 * atlas/ionic icons and tint fully with the chosen colour.
 * @param {string | null | undefined} iconClass
 * @returns {boolean}
 */
export function isCustomSvgIcon(iconClass?: string | null): boolean {
  return (
    !!iconClass &&
    iconClass.startsWith("custom-svg-") &&
    KEEP_GLYPH_CUSTOM_SVG.has(iconClass)
  )
}

// ── Per-style default colours ──
// A marker with no explicit colour (set to "default") gets the NEUTRAL colour
// that best suits the selected style — the "natural" baseline that isn't
// user-set: original → white (pale disc, softened to off-white), circle-fill
// → ORANGE (2026-08-20 — the slate/black then blue defaults didn't read
// well; black is still a palette colour), circle-fill-black → white (black
// glyph pops), icon-fill → black (dark icon on the white canvas), icon-only
// → black, icon-dark-glass → white, icon-light-glass → black.
export const STYLE_DEFAULT_COLORS: Record<string, string> = {
  original: "white",
  "circle-fill": "orange",
  "circle-fill-black": "white",
  "icon-fill": "black",
  "icon-only": "black",
  "icon-dark-glass": "white",
  "icon-light-glass": "black",
}

// `overrides` (the user's per-style default colours from the profile menu)
// win over the built-in defaults.
export function styleDefaultColor(
  styleKey?: string | null,
  overrides?: Record<string, string> | null,
): string {
  if (overrides && styleKey && overrides[styleKey]) return overrides[styleKey]
  return STYLE_DEFAULT_COLORS[styleKey || ""] || "blue"
}

// ── Per-marker-type default colours (preselected) ──
// When the "Marker default colours" mode is CUSTOM, every marker type starts
// with a preselected colour (from here) that the user can override in the
// profile. Keyed by iconClass.
//
// INTENTIONALLY EMPTY (2026-08-19): the baseline natural default for every
// marker is now the NEUTRAL colour of its style (STYLE_DEFAULT_COLORS — see
// above), not a colour per icon type. Specific per-icon natural defaults can
// be re-added here later once they're chosen.
export const MARKER_TYPE_DEFAULT_COLORS: Record<string, string> = {}

// Resolve a marker's stored colour to the colour actually used for tinting:
// an explicit colour always wins; "default" (or none) falls back to the
// selected style's default colour (user override first, then built-in).
//
// The explicit case is ALSO adjusted for style compatibility (see
// compatibleColorForStyle): a marker stored as white/black that doesn't
// complement the viewer's CURRENT style renders as the style's compatible
// neutral (opposing styles swap white ↔ black). This is a PER-VIEWER
// render-time adjustment — the shared stored colour is never changed, so
// two users on the same map with different styles each see readable
// markers. "default" always resolves to a style-compatible colour, and
// user per-style default overrides are respected untouched.
export function effectiveColorKey(
  colorKey: string | null | undefined,
  styleKey: string | null | undefined,
  overrides?: Record<string, string> | null,
): string {
  if (colorKey && colorKey !== MARKER_COLOR_DEFAULT) {
    return compatibleColorForStyle(colorKey, styleKey)
  }
  return styleDefaultColor(styleKey, overrides)
}

// Resolve the effective colour a marker gets from the "Marker default
// colours" profile settings. Callers handle an explicit marker colour
// first; for a marker set to Default:
//   A marker type with its OWN explicitly-set colour keeps that (it always
//     wins over the "All markers" base colour).
//   Otherwise the "All markers" base colour applies: a specific colour,
//     "random" (callers resolve per marker id), or "default" — meaning "use
//     the original neutral default of the style" → returns `undefined` so
//     it falls through to STYLE_DEFAULT_COLORS at render time.
// (The old single/custom MODE no longer exists — there is just a base
// colour + per-type overrides; markerDefaultColorMode is ignored.)
export function markerDefaultColorKey(
  iconClass: string | null | undefined,
  settings: {
    markerDefaultColorMode?: string | null
    markerDefaultColor?: string | null
    markerTypeDefaultColors?: Record<string, string> | null
  } | null,
): string | undefined {
  const single = settings?.markerDefaultColor || MARKER_COLOR_DEFAULT
  const perType = settings?.markerTypeDefaultColors || {}
  // A marker type with its OWN explicitly-set colour keeps that — it always
  // wins over the "All markers" base colour.
  if (perType[iconClass || ""]) return perType[iconClass || ""]
  // Built-in per-type preset (currently empty — natural defaults are the
  // per-style neutrals).
  if (MARKER_TYPE_DEFAULT_COLORS[iconClass || ""])
    return MARKER_TYPE_DEFAULT_COLORS[iconClass || ""]
  // The "All markers" base colour (the only concept now). "random" is
  // returned as-is (callers resolve per marker id); "default" means "use
  // the original neutral default of the style" → we return undefined so it
  // falls through to STYLE_DEFAULT_COLORS at render time.
  if (single && single !== MARKER_COLOR_DEFAULT) return single
  return undefined
}

// ── Swatch rendering helpers ──
// Swatches show the pale `light` shade for normal colours, but black needs a
// dark fill and white needs a visible grey rim to read at all. The "default"
// option is rendered as the dashed "D" cell in every picker (not a colour
// swatch), so these keep a light grey fallback — never the black dark shade.
export function swatchBg(c: MarkerColor): string {
  if (c.key === "rainbow")
    return "conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)"
  if (c.key === "black") return "#111827"
  if (c.key === "white") return "#ffffff"
  if (c.key === MARKER_COLOR_DEFAULT) return "#e5e7eb"
  return c.light
}

export function swatchBorder(c: MarkerColor): string {
  if (c.key === "rainbow") return "#334155"
  if (c.key === "white") return "#94a3b8"
  if (c.key === MARKER_COLOR_DEFAULT) return "#64748b"
  return c.dark
}

// Colour used for the selected-colour name label (white text on a light
// panel would be invisible). The "default" colour is black ink, which reads
// terribly on the dark UI — show it as white text instead.
export function swatchText(c: MarkerColor): string {
  if (c.key === "rainbow") return "#334155"
  if (c.key === "white") return "#334155"
  if (c.key === MARKER_COLOR_DEFAULT) return "#ffffff"
  return c.dark
}

// ── Style-aware swatch shades ──
// Colour pickers show each colour as it actually renders under the selected
// marker style. Original tints the pale light shade from the classic palette;
// icon-fill uses the rich deep shade; every OTHER style renders with the
// same BRIGHT `dark` accent shade (one consistent bright colour set).
export function markerStyleShade(
  styleKey?: string | null,
): "deep" | "dark" | "light" {
  if (styleKey === "original") return "light"
  if (styleKey === "icon-fill") return "deep"
  return "dark"
}

// Swatch background for a colour shown as it renders under the given marker
// style (bright accent / deep for icon-fill / light for original). Special
// keys keep their existing swatch treatment.
export function styleSwatchBg(
  c: MarkerColor,
  styleKey?: string | null,
): string {
  if (c.key === "rainbow") return swatchBg(c)
  // Default keeps its pale light shade (never the black dark shade) — it's
  // shown as the dashed "D" cell in pickers anyway.
  if (c.key === MARKER_COLOR_DEFAULT) return c.light
  // Neutral discs are softened (see the renderers): the pure WHITE swatches
  // show icon-fill's soft off-white #f1f5f9 (circle-fill-black + original).
  // Black is a real black in circle-fill again (its default is now blue).
  if (styleKey === "circle-fill-black" && c.key === "white") return "#f1f5f9"
  if (styleKey === "original" && c.key === "white") return "#f1f5f9"
  const shade = markerStyleShade(styleKey)
  return shade === "light" ? c.light : shade === "deep" ? c.deep : c.dark
}

// ── Random default colour ──
// A style's fill default can be set to "random" (the profile's Random
// option): every marker with no explicit colour then gets a stable random
// colour from RANDOM_COLORS, derived from its id so it doesn't change on
// every re-render.
export const RANDOM_COLOR_KEY = "random"
export const RANDOM_COLORS = [
  "red",
  "blue",
  "green",
  "orange",
  "yellow",
  "purple",
  "pink",
  "skyblue",
]

/**
 * Stable pseudo-random colour for a marker id (same id → same colour).
 * @param {string} id
 * @returns {string}
 */
export function randomColorForId(id: string): string {
  const s = String(id ?? "")
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return RANDOM_COLORS[h % RANDOM_COLORS.length]
}

// ── Tint modes ──
// How the chosen colour is applied to a marker's icon.
//   "original"    — circle → light shade, glyph untouched (the original
//                   look), strong dark border
//   "circle-fill" — the whole circle → deep shade, glyph → white so the
//                   symbol always stays visible, no border
//   "circle-fill-black" — same as circle-fill but the glyph → black
//   "icon-fill"   — glyph → deep rich shade, circle → pure white/grey
//                   canvas, subtle neutral grey rim
//   "icon-dark-glass"  — glyph → bright accent shade, with a DARK
//                   translucent disc behind (bright icon pops on dark)
//   "icon-light-glass" — glyph → DEEP shade, with the light frosted
//                   translucent disc behind (darker icon, light disc)
//
// "icon-only" (floating, no disc) is intentionally NOT offered as a style
// any more — the two glass modes are the "Icon only" choice (light/dark).
// The tint code still handles "icon-only" for markers saved with the old
// style, so it is kept in markerTint.js / STYLE_DEFAULT_COLORS.
export interface TintMode {
  key: string
  label: string
}

export const TINT_MODES: TintMode[] = [
  { key: "original", label: "Original" },
  { key: "circle-fill", label: "Circle fill (white)" },
  { key: "circle-fill-black", label: "Circle fill (black)" },
  { key: "icon-fill", label: "Icon fill" },
  { key: "icon-dark-glass", label: "Icon (dark)" },
  { key: "icon-light-glass", label: "Icon (light)" },
]

// Circle fill is now the default marker style (2026-08-19): new users start
// on it and the DB column default is 'circle-fill'.
export const TINT_MODE_DEFAULT = "circle-fill"

// ── Grouped marker style picker ──
// The Profile's "Marker style" menu shows 4 base styles; two of them expose
// sub-variants under the menu when active (circle fill → white/black glyph,
// icon → dark/light glass + opacity slider). The persisted `marker_style`
// is ALWAYS a concrete tint mode (one of TINT_MODES / tintMarkerCanvas
// modes) so nothing downstream needs to resolve groups.
export interface MarkerStyleGroup {
  key: string
  label: string
  /** The concrete tint modes this group can produce. */
  modes: string[]
}

export const MARKER_STYLE_GROUPS: MarkerStyleGroup[] = [
  { key: "original", label: "Original", modes: ["original"] },
  {
    key: "circle-fill",
    label: "Circle fill",
    // Black is the default when switching to this group (modes[0] is what
    // setMarkerStyleGroup adopts); White stays available as a sub-option.
    modes: ["circle-fill-black", "circle-fill"],
  },
  { key: "icon-fill", label: "Icon fill", modes: ["icon-fill"] },
  {
    key: "icon",
    label: "Icon",
    modes: ["icon-dark-glass", "icon-light-glass"],
  },
]

/** The group a concrete tint mode belongs to (falls back to Original). */
export function markerStyleGroupFor(
  mode?: string | null,
): MarkerStyleGroup {
  return (
    MARKER_STYLE_GROUPS.find((g) => g.modes.includes(mode || "")) ||
    MARKER_STYLE_GROUPS[0]
  )
}

export function tintMode(key?: string | null): TintMode {
  return (
    TINT_MODES.find((t) => t.key === key) ||
    TINT_MODES.find((t) => t.key === TINT_MODE_DEFAULT) ||
    TINT_MODES[0]
  )
}
