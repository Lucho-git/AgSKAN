import { describe, it, expect } from "vitest"
import { markerRowToClientMarker, markerRowVisibility } from "./markerRow"

// Shape mirrors a real public.map_markers row (marker_data is GeoJSON-ish).
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "m-1",
  notes: "Silo 3",
  created_at: "2026-01-01T00:00:00Z",
  last_confirmed: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-02T00:00:00Z",
  marker_data: {
    type: "Feature",
    geometry: { type: "Point", coordinates: [116.1, -30.6] },
    properties: {
      icon: "silo",
      note_label_visible: true,
      drawings_visibility: "selected",
      silo_fill: 42,
      grain_type: "wheat",
      grain_color: "#f5c542",
      marker_color: "red",
      tint_mode: "circle-fill-black",
      capacity_tonnes: 120,
      field_bin_configured: true,
      bin_show_always: false,
      gate_open: true,
      rock_picked: true,
      photos: ["a.jpg"],
    },
  },
  ...overrides,
})

describe("markerRowToClientMarker", () => {
  it("maps every persisted property the map renders", () => {
    const marker = markerRowToClientMarker(row())

    expect(marker).toMatchObject({
      id: "m-1",
      coordinates: [116.1, -30.6],
      iconClass: "silo",
      notes: "Silo 3",
      noteLabelVisible: true,
      siloFill: 42,
      grainType: "wheat",
      grainColor: "#f5c542",
      markerColor: "red",
      tintMode: "circle-fill-black",
      capacityTonnes: 120,
      fieldBinConfigured: true,
      binShowAlways: false,
      gateOpen: true,
      rockPicked: true,
      photos: ["a.jpg"],
    })
    // Restoring must keep the original creation time, not "now".
    expect(marker?.created_at).toBe("2026-02-01T00:00:00Z")
  })

  it("returns null when the row has no coordinates", () => {
    expect(
      markerRowToClientMarker(row({ marker_data: { properties: {} } })),
    ).toBeNull()
  })

  it("falls back to defaults for rows written by older app versions", () => {
    const marker = markerRowToClientMarker(
      row({
        marker_data: {
          geometry: { coordinates: [0, 0] },
          properties: { icon: "default" },
        },
      }),
    )

    expect(marker).toMatchObject({
      noteLabelVisible: true,
      siloFill: 0,
      gateOpen: false,
      rockPicked: false,
      binShowAlways: true,
      photos: [],
    })
  })
})

describe("markerRowVisibility", () => {
  it("returns the saved visibility", () => {
    expect(markerRowVisibility(row())).toBe("selected")
  })

  it("defaults to always for anything unrecognised", () => {
    expect(markerRowVisibility(row({ marker_data: {} }))).toBe("always")
    expect(
      markerRowVisibility(
        row({ marker_data: { properties: { drawings_visibility: "x" } } }),
      ),
    ).toBe("always")
  })
})
