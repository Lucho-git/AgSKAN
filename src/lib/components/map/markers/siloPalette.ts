// Shared silo grain/fill colour palette.
//
// The colour `key` is persisted on silo markers (`grainColor` →
// `grain_color` in the DB) and tints the on-map fill gauge. Keep the list
// small and fixed so the gauge images can be pre-registered per (colour ×
// level) without registering arbitrary colours at runtime.

export interface SiloGrainColor {
  key: string
  label: string
  light: string
  dark: string
}

export const SILO_GRAIN_COLORS: SiloGrainColor[] = [
  { key: "amber", label: "Amber", light: "#fde68a", dark: "#f59e0b" },
  { key: "green", label: "Green", light: "#86efac", dark: "#22c55e" },
  { key: "blue", label: "Blue", light: "#93c5fd", dark: "#3b82f6" },
  { key: "red", label: "Red", light: "#fca5a5", dark: "#ef4444" },
  { key: "purple", label: "Purple", light: "#d8b4fe", dark: "#a855f7" },
]

export const SILO_GRAIN_DEFAULT = "amber"

export function siloGrainColor(key?: string | null): SiloGrainColor {
  return (
    SILO_GRAIN_COLORS.find((c) => c.key === key) ||
    SILO_GRAIN_COLORS.find((c) => c.key === SILO_GRAIN_DEFAULT) ||
    SILO_GRAIN_COLORS[0]
  )
}
