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
  { key: "default", label: "Default", light: "#d3d3d3", dark: "#9ca3af", deep: "#6b7280" },
  { key: "blue", label: "Blue", light: "#bfdbfe", dark: "#3b82f6", deep: "#1d4ed8" },
  { key: "green", label: "Green", light: "#bbf7d0", dark: "#22c55e", deep: "#15803d" },
  { key: "yellow", label: "Yellow", light: "#fef08a", dark: "#eab308", deep: "#a16207" },
  { key: "amber", label: "Amber", light: "#fde68a", dark: "#f59e0b", deep: "#b45309" },
  { key: "red", label: "Red", light: "#fecaca", dark: "#ef4444", deep: "#b91c1c" },
  { key: "purple", label: "Purple", light: "#e9d5ff", dark: "#a855f7", deep: "#7e22ce" },
  { key: "cyan", label: "Cyan", light: "#a5f3fc", dark: "#06b6d4", deep: "#0e7490" },
  { key: "pink", label: "Pink", light: "#fbcfe8", dark: "#ec4899", deep: "#be185d" },
  { key: "lime", label: "Lime", light: "#d9f99d", dark: "#84cc16", deep: "#4d7c0f" },
]

export const MARKER_COLOR_DEFAULT = "default"

export function markerColor(key?: string | null): MarkerColor {
  return (
    MARKER_COLORS.find((c) => c.key === key) ||
    MARKER_COLORS.find((c) => c.key === MARKER_COLOR_DEFAULT) ||
    MARKER_COLORS[0]
  )
}

// ── Tint modes ──
// How the chosen colour is applied to a marker's icon.
//   "original"    — circle → light shade, glyph untouched (the original
//                   look), strong dark border
//   "circle-fill" — the whole circle → deep shade, glyph → white/grey so the
//                   symbol always stays visible, no border
//   "icon-fill"   — glyph → deep rich shade, circle → pure white/grey
//                   canvas, subtle neutral grey rim
//   "icon-only"   — glyph → DEEP shade, the circle is removed entirely
//                   (transparent) so only the coloured icon remains
//   "icon-dark-glass"  — glyph → bright accent shade, with a DARK
//                   translucent disc behind (bright icon pops on dark)
//   "icon-light-glass" — glyph → DEEP shade, with the light frosted
//                   translucent disc behind (darker icon, light disc)
export interface TintMode {
  key: string
  label: string
}

export const TINT_MODES: TintMode[] = [
  { key: "original", label: "Original" },
  { key: "circle-fill", label: "Circle fill" },
  { key: "icon-fill", label: "Icon fill" },
  { key: "icon-only", label: "Icon only" },
  { key: "icon-dark-glass", label: "Icon dark glass" },
  { key: "icon-light-glass", label: "Icon light glass" },
]

export const TINT_MODE_DEFAULT = "original"

export function tintMode(key?: string | null): TintMode {
  return (
    TINT_MODES.find((t) => t.key === key) ||
    TINT_MODES.find((t) => t.key === TINT_MODE_DEFAULT) ||
    TINT_MODES[0]
  )
}
