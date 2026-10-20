// src/lib/utils/markerRow.ts
// Maps a `map_markers` database row to the shape the map stores/renders.
// Mirrors the mapping used when markers are loaded or received over realtime,
// so a restored marker looks identical to one that was never deleted.
import {
  MARKER_COLOR_DEFAULT,
  TINT_MODE_DEFAULT,
  SILO_COLOR_DEFAULT,
  grainBinDefaultCapacity,
} from "$lib/components/map/markers/markerPalette"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function markerRowToClientMarker(row: any) {
  const coordinates = row?.marker_data?.geometry?.coordinates
  if (!coordinates) return null

  const props = row?.marker_data?.properties || {}
  const iconClass = props.icon || "default"

  return {
    id: row.id,
    coordinates,
    iconClass,
    notes: row.notes,
    noteLabelVisible: props.note_label_visible !== false,
    siloFill: props.silo_fill ?? 0,
    grainType: props.grain_type ?? "",
    grainColor: props.grain_color ?? SILO_COLOR_DEFAULT,
    markerColor: props.marker_color ?? MARKER_COLOR_DEFAULT,
    tintMode: props.tint_mode ?? TINT_MODE_DEFAULT,
    capacityTonnes: props.capacity_tonnes ?? grainBinDefaultCapacity(iconClass),
    fieldBinConfigured: props.field_bin_configured === true,
    gateOpen: props.gate_open === true,
    rockPicked: props.rock_picked === true,
    binShowAlways: props.bin_show_always !== false,
    photos: props.photos || [],
    created_at: row.last_confirmed || row.created_at,
    updated_at: row.updated_at,
  }
}

/** The per-marker visibility the marker was saved with (store default "always"). */
export function markerRowVisibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
): "always" | "selected" | "hidden" {
  const value = row?.marker_data?.properties?.drawings_visibility
  return value === "selected" || value === "hidden" ? value : "always"
}
