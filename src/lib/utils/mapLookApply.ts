// Applies a MapLook (see mapLook.ts) to a live mapbox-gl map.
//
// Every function here is idempotent and only touches a property when its value
// actually differs. That matters: setPaintProperty fires `styledata`, and the
// applier re-runs on `styledata`, so a blind write would loop forever.
import {
  OUTSIDE_TONES,
  basemapPaint,
  buildOutsideMask,
  resolveTrailColor,
  trailColorExpr,
  type MapLook,
} from "./mapLook"

// mapbox-gl 1.x ships no type declarations in this repo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MapboxMap = any

export const LOOK_MASK_SOURCE = "look-mask"
export const LOOK_MASK_LAYER = "look-mask-layer"

/** The source the Mapbox streets style draws its roads, borders and labels from. */
const BASEMAP_VECTOR_SOURCE = "composite"
/** Raster layers that are data, not imagery, and must keep their own colours. */
const RASTER_SKIP = new Set(["ndvi-layer"])

const ACTIVE_WORK_LAYER = "all-active-trails-layer"
const ACTIVE_PAUSE_LAYER = "all-active-trails-pause-layer"

type AnyLayer = {
  id: string
  type: string
  source?: unknown
  metadata?: Record<string, unknown>
  layout?: Record<string, unknown>
}

function layersOf(map: MapboxMap): AnyLayer[] {
  try {
    return ((map.getStyle()?.layers ?? []) as unknown as AnyLayer[]) || []
  } catch {
    return []
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function setPaint(
  map: MapboxMap,
  layerId: string,
  prop: string,
  value: unknown,
) {
  try {
    if (!map.getLayer(layerId)) return
    if (same(map.getPaintProperty(layerId, prop), value)) return
    map.setPaintProperty(layerId, prop, value)
  } catch {
    /* layer removed mid-pass */
  }
}

/** Imagery treatment: every raster imagery layer, whichever provider is active. */
export function applyBasemapLook(map: MapboxMap, look: MapLook) {
  const paint = basemapPaint(look)
  for (const layer of layersOf(map)) {
    if (layer.type !== "raster" || RASTER_SKIP.has(layer.id)) continue
    for (const [prop, value] of Object.entries(paint))
      setPaint(map, layer.id, prop, value)
  }
}

// Visibility each basemap layer had before we hid it, so un-hiding restores the
// style exactly (some style layers are hidden by design).
const hiddenBasemapLayers = new WeakMap<MapboxMap, Map<string, string>>()

/** Show or hide the Mapbox style's own roads, borders and place labels. */
export function applyBasemapLabels(map: MapboxMap, look: MapLook) {
  let remembered = hiddenBasemapLayers.get(map)
  if (!remembered) {
    remembered = new Map()
    hiddenBasemapLayers.set(map, remembered)
  }
  const hide = look.basemap.hideRoadsAndLabels
  for (const layer of layersOf(map)) {
    if (layer.source !== BASEMAP_VECTOR_SOURCE) continue
    try {
      const current =
        (map.getLayoutProperty(layer.id, "visibility") as string) ?? "visible"
      if (hide) {
        if (!remembered.has(layer.id)) remembered.set(layer.id, current)
        if (current !== "none")
          map.setLayoutProperty(layer.id, "visibility", "none")
      } else if (remembered.has(layer.id)) {
        const original = remembered.get(layer.id)!
        remembered.delete(layer.id)
        if (current !== original)
          map.setLayoutProperty(layer.id, "visibility", original)
      }
    } catch {
      /* layer removed mid-pass */
    }
  }
}

/** First layer that belongs to the app (not imagery, not the basemap's own vectors). */
function firstAppLayerId(map: MapboxMap): string | undefined {
  for (const layer of layersOf(map)) {
    if (layer.id === LOOK_MASK_LAYER) continue
    if (layer.type === "raster" || layer.type === "background") continue
    if (layer.source === BASEMAP_VECTOR_SOURCE) continue
    return layer.id
  }
  return undefined
}

/**
 * The wash over everything outside the fields. Pass the field list to rebuild
 * the cut-outs; omit it to only refresh colour, strength and stacking.
 */
export function applyOutsideLook(
  map: MapboxMap,
  look: MapLook,
  fields?: Array<{
    boundary?: { type: string; coordinates: unknown } | null
  }> | null,
) {
  try {
    const existing = map.getSource(LOOK_MASK_SOURCE) as
      | { setData?: (d: unknown) => void }
      | undefined
    if (fields !== undefined || !existing) {
      const geometry = buildOutsideMask(fields ?? [])
      const data = geometry
        ? { type: "Feature", properties: {}, geometry }
        : { type: "FeatureCollection", features: [] }
      if (existing?.setData) existing.setData(data)
      else map.addSource(LOOK_MASK_SOURCE, { type: "geojson", data } as never)
    }

    const strength = Math.max(0, Math.min(1, look.outside.strength))
    const color = OUTSIDE_TONES[look.outside.tone] ?? OUTSIDE_TONES.dark

    if (!map.getLayer(LOOK_MASK_LAYER)) {
      map.addLayer(
        {
          id: LOOK_MASK_LAYER,
          type: "fill",
          source: LOOK_MASK_SOURCE,
          paint: {
            "fill-color": color,
            "fill-opacity": strength,
            "fill-antialias": false,
          },
        } as never,
        firstAppLayerId(map),
      )
      return
    }

    setPaint(map, LOOK_MASK_LAYER, "fill-color", color)
    setPaint(map, LOOK_MASK_LAYER, "fill-opacity", strength)

    // Keep the wash underneath everything the app draws.
    const ids = layersOf(map).map((l) => l.id)
    const firstApp = firstAppLayerId(map)
    if (firstApp && ids.indexOf(LOOK_MASK_LAYER) > ids.indexOf(firstApp)) {
      map.moveLayer(LOOK_MASK_LAYER, firstApp)
    }
  } catch (e) {
    console.warn("[map look] outside wash failed:", e)
  }
}

/** Field fill and outline paint. Field colours themselves are feature properties (see fieldColors). */
export function applyFieldPaint(map: MapboxMap, look: MapLook) {
  const f = look.fields
  setPaint(map, "fields-fill", "fill-opacity", f.fillOpacity)
  setPaint(map, "fields-fill-selected", "fill-opacity", f.selectedFillOpacity)
  setPaint(map, "fields-outline", "line-width", f.outlineWidth)
  setPaint(map, "fields-outline", "line-opacity", f.outlineOpacity)
}

/**
 * Trail colour and opacity. The combined active-trails layers take a palette
 * expression; per-trail layers carry their stored colour in layer metadata.
 */
export function applyTrailLook(map: MapboxMap, look: MapLook) {
  const expr = trailColorExpr(look)
  setPaint(map, ACTIVE_WORK_LAYER, "line-color", expr)
  setPaint(map, ACTIVE_WORK_LAYER, "line-opacity", look.trails.opacity)
  setPaint(map, ACTIVE_PAUSE_LAYER, "line-color", expr)
  setPaint(map, ACTIVE_PAUSE_LAYER, "line-opacity", look.trails.pauseOpacity)

  for (const layer of layersOf(map)) {
    const stored = layer.metadata?.agskanTrailColor
    if (typeof stored !== "string") continue
    const pause = layer.metadata?.agskanTrailRole === "pause"
    setPaint(map, layer.id, "line-color", resolveTrailColor(stored, look))
    setPaint(
      map,
      layer.id,
      "line-opacity",
      pause ? look.trails.pauseOpacity : look.trails.opacity,
    )
  }
}
