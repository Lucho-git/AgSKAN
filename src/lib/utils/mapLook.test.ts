import { describe, expect, it } from "vitest"
import {
  FIELD_AUTO_PALETTE,
  PRESETS,
  TRAIL_PALETTES,
  MAP_STYLES,
  TRAIL_STYLES,
  basemapPaint,
  composeLook,
  trailLegend,
  buildOutsideMask,
  fieldColors,
  resolveLook,
  resolveTrailColor,
  resolveTrailRgb,
  sanitizeLookState,
  trailColorExpr,
} from "./mapLook"

const classic = PRESETS.classic

describe("presets", () => {
  it("Classic keeps the paint values the map had before looks existed", () => {
    expect(classic.trails).toMatchObject({
      opacity: 0.5,
      pauseOpacity: 0.55,
      dimmedOpacity: 0.25,
    })
    expect(classic.fields).toMatchObject({
      fillOpacity: 0.1,
      selectedFillOpacity: 0.3,
      outlineWidth: 2,
      outlineOpacity: 0.95,
      defaultFill: "#0080ff",
      defaultOutline: "#bfffbf",
    })
    expect(basemapPaint(classic)).toEqual({
      "raster-saturation": 0,
      "raster-contrast": 0,
      "raster-brightness-min": 0,
      "raster-brightness-max": 1,
    })
    expect(classic.outside.strength).toBe(0)
  })

  it("every palette covers the same nine vehicle colours", () => {
    const names = Object.keys(TRAIL_PALETTES.classic).sort()
    expect(names).toHaveLength(9)
    for (const palette of Object.values(TRAIL_PALETTES)) {
      expect(Object.keys(palette).sort()).toEqual(names)
    }
  })

  it("keeps trail opacity where one pass and two passes stay distinguishable", () => {
    for (const look of [
      ...Object.values(PRESETS),
      ...Object.values(TRAIL_STYLES).map((trails) => ({ trails })),
    ]) {
      expect(look.trails.opacity).toBeGreaterThanOrEqual(0.45)
      expect(look.trails.opacity).toBeLessThanOrEqual(0.65)
    }
  })
})

describe("map styles and trail styles", () => {
  it("every wash is dark-only and moderate", () => {
    for (const [name, look] of Object.entries(PRESETS)) {
      expect(look.outside.strength).toBeLessThanOrEqual(
        name === "records" ? 0.6 : 0.4,
      )
      expect(look.outside).not.toHaveProperty("tone")
    }
  })

  it("compose any map style with any trail palette", () => {
    const look = composeLook("mono", "earth")
    expect(look.basemap).toEqual(PRESETS.mono.basemap)
    expect(look.fields).toEqual(PRESETS.mono.fields)
    expect(look.trails).toEqual(TRAIL_STYLES.earth)
    expect(look.trails.palette).toBe("earth")
  })

  it("Classic map + Classic trails is exactly the Classic preset", () => {
    expect(composeLook("classic", "classic")).toEqual(PRESETS.classic)
  })

  it("falls back to Classic for unknown names", () => {
    expect(composeLook("nope" as never, "nope" as never)).toEqual(
      PRESETS.classic,
    )
    expect(Object.keys(MAP_STYLES).sort()).toEqual(Object.keys(PRESETS).sort())
  })
})

describe("resolveLook", () => {
  it("returns the preset when there are no overrides", () => {
    expect(resolveLook({ preset: "mono", overrides: {} })).toEqual(PRESETS.mono)
  })

  it("applies overrides on top of the preset without mutating it", () => {
    const look = resolveLook({
      preset: "muted",
      overrides: { trails: { opacity: 0.6 } },
    })
    expect(look.trails.opacity).toBe(0.6)
    expect(look.trails.palette).toBe("soft")
    expect(PRESETS.muted.trails.opacity).toBe(0.55)
  })

  it("falls back to Classic for a missing or unknown preset", () => {
    expect(resolveLook(null)).toEqual(classic)
    expect(resolveLook({ preset: "nope" as never, overrides: {} })).toEqual(
      classic,
    )
  })
})

describe("sanitizeLookState", () => {
  it("drops unknown presets, groups, keys and wrongly typed values", () => {
    const state = sanitizeLookState({
      preset: "bogus",
      overrides: {
        trails: { opacity: 0.6, palette: 5, extra: 1 },
        nonsense: { a: 1 },
        basemap: "no",
      },
    })
    expect(state).toEqual({
      preset: "classic",
      overrides: { trails: { opacity: 0.6 } },
    })
  })

  it("returns the default for junk input", () => {
    expect(sanitizeLookState("x")).toEqual({ preset: "classic", overrides: {} })
    expect(sanitizeLookState(null)).toEqual({
      preset: "classic",
      overrides: {},
    })
  })
})

describe("resolveTrailColor", () => {
  it("maps a vehicle colour name through the look's palette, whatever its case", () => {
    expect(resolveTrailColor("Red", classic)).toBe("#ff0000")
    expect(resolveTrailColor("Red", PRESETS.muted)).toBe("#ef4444")
    expect(resolveTrailColor("SKYBLUE", PRESETS.muted)).toBe("#38bdf8")
    expect(resolveTrailColor(" hotpink ", composeLook("mono", "earth"))).toBe(
      "#c96b8f",
    )
  })

  it("passes hex and other CSS colours through untouched", () => {
    expect(resolveTrailColor("#12ab34", PRESETS.muted)).toBe("#12ab34")
    expect(resolveTrailColor("white", PRESETS.muted)).toBe("white")
  })

  it("uses the fallback when no colour is stored", () => {
    expect(resolveTrailColor(null, classic)).toBe("#FF0000")
    expect(resolveTrailColor("", classic)).toBe("#FF0000")
  })

  it("gives RGB for palette names and hex, null for other CSS names", () => {
    expect(resolveTrailRgb("Red", PRESETS.muted)).toEqual([239, 68, 68])
    expect(resolveTrailRgb("#000080", classic)).toEqual([0, 0, 128])
    expect(resolveTrailRgb("white", classic)).toBeNull()
  })
})

describe("trailLegend", () => {
  it("lists the colour each machine's trails are drawn in", () => {
    const legend = trailLegend(PRESETS.muted)
    expect(legend).toHaveLength(9)
    expect(legend.find((l) => l.key === "red")).toEqual({
      key: "red",
      label: "Red",
      color: "#ef4444",
    })
    expect(
      trailLegend(composeLook("muted", "earth")).find((l) => l.key === "red")!
        .color,
    ).toBe("#c8553d")
  })
})

describe("trailColorExpr", () => {
  it("matches on the lower-cased colour property and falls back to the raw value", () => {
    const expr = trailColorExpr(PRESETS.muted) as unknown[]
    expect(expr[0]).toBe("to-color")
    const match = expr[1] as unknown[]
    expect(match[0]).toBe("match")
    expect(match[1]).toEqual(["downcase", ["to-string", ["get", "color"]]])
    expect(match[match.indexOf("red") + 1]).toBe("#ef4444")
    expect(match[match.length - 1]).toEqual(["to-string", ["get", "color"]])
    // 2 head items + 9 name/hex pairs + 1 fallback
    expect(match).toHaveLength(21)
  })
})

describe("basemapPaint", () => {
  it("clamps values and never lets max brightness drop below min", () => {
    const look = resolveLook({
      preset: "classic",
      overrides: {
        basemap: {
          saturation: -5,
          contrast: 3,
          brightnessMin: 0.6,
          brightnessMax: 0.2,
        },
      },
    })
    expect(basemapPaint(look)).toEqual({
      "raster-saturation": -1,
      "raster-contrast": 1,
      "raster-brightness-min": 0.6,
      "raster-brightness-max": 0.6,
    })
  })
})

describe("fieldColors", () => {
  it("uses the look's default pair for default-coloured fields", () => {
    expect(fieldColors("default", 0, classic)).toEqual({
      fillColor: "#0080ff",
      outlineColor: "#bfffbf",
    })
    expect(fieldColors(null, 3, classic)).toEqual({
      fillColor: "#0080ff",
      outlineColor: "#bfffbf",
    })
  })

  it("uses a custom colour for both fill and outline in Classic", () => {
    expect(fieldColors("#FFFF00", 0, classic)).toEqual({
      fillColor: "#FFFF00",
      outlineColor: "#FFFF00",
    })
  })

  it("softens the pure-hex picker colours when the look asks for it", () => {
    expect(fieldColors("#FFFF00", 0, PRESETS.muted).fillColor).toBe("#e9c46a")
    expect(fieldColors("#3b82f6", 0, PRESETS.muted).fillColor).toBe("#3b82f6")
  })

  it("cycles the auto palette by field order and keeps a neutral outline", () => {
    const poster = resolveLook({
      preset: "muted",
      overrides: { fields: { autoPalette: true } },
    })
    expect(fieldColors("default", 0, poster).fillColor).toBe(
      FIELD_AUTO_PALETTE[0],
    )
    expect(
      fieldColors("default", FIELD_AUTO_PALETTE.length + 1, poster).fillColor,
    ).toBe(FIELD_AUTO_PALETTE[1])
    expect(fieldColors("#22c55e", 0, poster)).toEqual({
      fillColor: "#22c55e",
      outlineColor: poster.fields.defaultOutline,
    })
  })
})

describe("buildOutsideMask", () => {
  const square = (x: number, y: number) => [
    [
      [x, y],
      [x + 0.01, y],
      [x + 0.01, y + 0.01],
      [x, y + 0.01],
      [x, y],
    ],
  ]

  it("returns null without usable fields", () => {
    expect(buildOutsideMask([])).toBeNull()
    expect(buildOutsideMask(null)).toBeNull()
    expect(buildOutsideMask([{ boundary: null }])).toBeNull()
  })

  it("cuts every field (and every part of a MultiPolygon) out as a reversed hole", () => {
    const mask = buildOutsideMask([
      { boundary: { type: "Polygon", coordinates: square(115, -32) } },
      {
        boundary: {
          type: "MultiPolygon",
          coordinates: [square(115.1, -32), square(115.2, -32)],
        },
      },
    ])!
    expect(mask.type).toBe("Polygon")
    expect(mask.coordinates).toHaveLength(4) // outer + 3 holes
    expect(mask.coordinates[1]).toEqual([...square(115, -32)[0]].reverse())
  })

  it("pads the outer ring well beyond the fields and keeps it on the globe", () => {
    const mask = buildOutsideMask([
      { boundary: { type: "Polygon", coordinates: square(179.99, 84.99) } },
    ])!
    const [w, s] = mask.coordinates[0][0]
    const [e, n] = mask.coordinates[0][2]
    expect(w).toBeLessThan(179.9)
    expect(s).toBeLessThan(84.9)
    expect(e).toBeLessThanOrEqual(180)
    expect(n).toBeLessThanOrEqual(85)
  })
})
