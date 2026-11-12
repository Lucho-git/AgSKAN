/**
 * One Mapbox style holding both looks of the new map:
 *
 *   "satellite"  real imagery, eased back a touch so fences, trails and
 *                chips read, but still the colour of the country
 *   "paper"      a drawn map in the landing page's colours: cream ground,
 *                contour lines, lanes, and paddocks filled like the
 *                illustrated farm map
 *
 * Both sets of layers live in the same style and are switched by visibility,
 * so changing look never reloads the map or drops the app's own layers.
 */

export type BaseLook = "satellite" | "paper"

// mapbox-gl 1.x ships no type declarations in this repo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MapboxMap = any

const INK = "#15261C"
const PAPER = "#E6DEC2"
const CARD = "#FBF9F2"
const WATER = "#9DBBD0"

export const FARM_SOURCE = "mv-paddocks"
export const SCRUB_SOURCE = "mv-scrub"
export const TRAIL_SOURCE = "mv-trails"
export const MY_TRAIL_SOURCE = "mv-my-trail"
export const ACCURACY_SOURCE = "mv-accuracy"
/** Finished trails (the live map only). */
export const HISTORY_SOURCE = "mv-history"
/** Paddock names, one point per paddock (the live map only). */
export const LABEL_SOURCE = "mv-paddock-labels"
/** Pins drawn by the map itself rather than as DOM markers (the live map). */
export const PIN_SOURCE = "mv-pins"
export const PIN_LAYER = "mv-pins"
/** The one trail picked out (its centre line), and a trail being replayed. */
export const PICKED_TRAIL_SOURCE = "mv-picked-trail"
export const REPLAY_SOURCE = "mv-replay"

/** Pin size by zoom: the layer's `icon-size` stops, on a 48px image. */
const PIN_STOPS: [number, number][] = [
  [9, 0.34],
  [12, 0.5],
  [15, 0.74],
  [17, 0.84],
]

/** How many pixels across a pin is drawn at a zoom level. */
export function pinPixels(zoom: number) {
  const stops = PIN_STOPS
  if (zoom <= stops[0][0]) return 48 * stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [z0, s0] = stops[i - 1]
    const [z1, s1] = stops[i]
    if (zoom <= z1) return 48 * (s0 + ((zoom - z0) / (z1 - z0)) * (s1 - s0))
  }
  return 48 * stops[stops.length - 1][1]
}

/**
 * Frames of a dashed line that appears to march along itself; step through
 * them on a timer with `line-dasharray`.
 */
export const MARCH: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
]

const empty = { type: "FeatureCollection", features: [] }

// On imagery a paddock is a faint wash of its own colour; on the drawn map it
// is filled in. A feature may carry `tint` (its colour on imagery) and `wash`
// (how strong); without them its `fill` is used at a light wash.
const SAT_FILL = ["coalesce", ["get", "tint"], ["get", "fill"]]
const SAT_FILL_OPACITY = ["coalesce", ["get", "wash"], 0.16]

/** Trail width in metres → pixels, the same way the real viewer does it. */
const trailWidth = [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  10,
  ["*", ["get", "width"], Math.pow(2, -6)],
  24,
  ["*", ["get", "width"], Math.pow(2, 8)],
]

const NOT_PAUSED = ["!=", ["get", "segment"], "pause"]
const PAUSED = ["==", ["get", "segment"], "pause"]

const trailLayer = (id: string, source: string) => ({
  id,
  type: "line",
  source,
  filter: NOT_PAUSED,
  layout: { "line-join": "round", "line-cap": "butt" },
  paint: {
    "line-color": ["get", "color"],
    "line-width": trailWidth,
    "line-opacity": 0.5,
  },
})

/** Stretches driven with the trail paused: a thin dotted line, not coverage. */
const pauseLayer = (id: string, source: string) => ({
  id,
  type: "line",
  source,
  filter: PAUSED,
  layout: { "line-join": "round", "line-cap": "round" },
  paint: {
    "line-color": ["get", "color"],
    "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1, 16, 2.5],
    "line-opacity": 0.7,
    "line-dasharray": [0.4, 2.2],
  },
})

const TRAIL_LAYERS = ["mv-history", "mv-trails", "mv-my-trail"]

/** How strongly trails are drawn in each look (the old viewer's 0.5). */
export const trailOpacity = (look: BaseLook) => (look === "paper" ? 0.56 : 0.5)

/**
 * Pick one finished trail out: it is drawn stronger and the rest fade back.
 * `null` puts every trail back to normal.
 */
export function pickTrail(
  map: MapboxMap,
  id: string | null,
  look: BaseLook,
  /** Being replayed: the trail itself fades too, so the replay paints it in. */
  replaying = false,
) {
  const normal = trailOpacity(look)
  map.setPaintProperty(
    "mv-history",
    "line-opacity",
    id
      ? ["case", ["==", ["get", "id"], id], replaying ? 0.16 : 0.82, 0.13]
      : normal,
  )
  for (const layer of ["mv-trails", "mv-my-trail"])
    map.setPaintProperty(layer, "line-opacity", id ? 0.18 : normal)
}

/** Pick a paddock out (or none). */
export function pickPaddock(map: MapboxMap, id: string | null) {
  for (const layer of [
    "mv-paddock-picked-fill",
    "mv-paddock-picked-case",
    "mv-paddock-picked-line",
  ])
    map.setFilter(layer, ["==", ["get", "id"], id ?? ""])
}

/** Move the marching dashes of whatever is picked on one step. */
export function march(map: MapboxMap, step: number) {
  const frame = MARCH[step % MARCH.length]
  for (const layer of ["mv-paddock-picked-line", "mv-picked-trail"])
    map.setPaintProperty(layer, "line-dasharray", frame)
}

type Layer = Record<string, unknown> & { id: string }
const group = (look: BaseLook, layers: Layer[]) =>
  layers.map((layer) => ({
    ...layer,
    metadata: { look },
    layout: {
      ...((layer.layout as object) ?? {}),
      visibility: look === "satellite" ? "visible" : "none",
    },
  }))

const roadWidth = (scale: number) => [
  "interpolate",
  ["exponential", 1.5],
  ["zoom"],
  10,
  [
    "match",
    ["get", "class"],
    ["motorway", "trunk", "primary"],
    1.6 * scale,
    ["secondary", "tertiary"],
    1.1 * scale,
    0.6 * scale,
  ],
  17,
  [
    "match",
    ["get", "class"],
    ["motorway", "trunk", "primary"],
    11 * scale,
    ["secondary", "tertiary"],
    8 * scale,
    5 * scale,
  ],
]

const ROADS = [
  "match",
  ["get", "class"],
  [
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "street",
    "street_limited",
    "service",
    "track",
  ],
  true,
  false,
]

const placeLabel = (id: string, color: string, halo: string) => ({
  id,
  type: "symbol",
  source: "streets",
  "source-layer": "place_label",
  filter: ["match", ["get", "class"], ["settlement"], true, false],
  layout: {
    "text-field": ["get", "name"],
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
    "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 14, 15],
    "text-letter-spacing": 0.08,
    "text-transform": "uppercase",
    "text-max-width": 8,
  },
  paint: {
    "text-color": color,
    "text-halo-color": halo,
    "text-halo-width": 1.4,
  },
})

export function buildStyle() {
  return {
    version: 8,
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    sources: {
      satellite: {
        type: "raster",
        url: "mapbox://mapbox.satellite",
        tileSize: 256,
      },
      streets: { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" },
      terrain: { type: "vector", url: "mapbox://mapbox.mapbox-terrain-v2" },
      [FARM_SOURCE]: { type: "geojson", data: empty },
      [SCRUB_SOURCE]: { type: "geojson", data: empty },
      [TRAIL_SOURCE]: { type: "geojson", data: empty },
      [MY_TRAIL_SOURCE]: { type: "geojson", data: empty },
      [ACCURACY_SOURCE]: { type: "geojson", data: empty },
      [HISTORY_SOURCE]: { type: "geojson", data: empty },
      [LABEL_SOURCE]: { type: "geojson", data: empty },
      [PIN_SOURCE]: { type: "geojson", data: empty },
      [PICKED_TRAIL_SOURCE]: { type: "geojson", data: empty },
      [REPLAY_SOURCE]: { type: "geojson", data: empty },
    },
    layers: [
      {
        id: "ground",
        type: "background",
        paint: { "background-color": PAPER },
      },

      // ── Drawn map ──
      ...group("paper", [
        {
          id: "paper-landcover",
          type: "fill",
          source: "terrain",
          "source-layer": "landcover",
          paint: {
            "fill-color": [
              "match",
              ["get", "class"],
              "wood",
              "#A9BE8F",
              "scrub",
              "#C4CB9C",
              "grass",
              "#D6D6A6",
              "crop",
              "#E8DCA9",
              PAPER,
            ],
            "fill-opacity": 0.7,
            "fill-antialias": false,
          },
        },
        {
          id: "paper-contour",
          type: "line",
          source: "terrain",
          "source-layer": "contour",
          paint: {
            "line-color": INK,
            "line-opacity": ["match", ["get", "index"], [5, 10], 0.2, 0.1],
            "line-width": ["match", ["get", "index"], [5, 10], 1, 0.6],
          },
        },
        {
          id: "paper-water",
          type: "fill",
          source: "streets",
          "source-layer": "water",
          paint: { "fill-color": WATER },
        },
        {
          id: "paper-waterway",
          type: "line",
          source: "streets",
          "source-layer": "waterway",
          paint: {
            "line-color": WATER,
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 16, 3],
          },
        },
        {
          id: "paper-building",
          type: "fill",
          source: "streets",
          "source-layer": "building",
          minzoom: 14,
          paint: { "fill-color": "#CFC5A4", "fill-outline-color": "#B5AA85" },
        },
        {
          id: "paper-road-case",
          type: "line",
          source: "streets",
          "source-layer": "road",
          filter: ROADS,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": INK,
            "line-opacity": 0.32,
            "line-width": roadWidth(1),
            "line-gap-width": 0,
          },
        },
        {
          id: "paper-road",
          type: "line",
          source: "streets",
          "source-layer": "road",
          filter: ROADS,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": CARD,
            "line-width": roadWidth(0.72),
          },
        },
        placeLabel("paper-place", INK, PAPER),
      ]),

      // ── Imagery ──
      ...group("satellite", [
        {
          id: "sat-imagery",
          type: "raster",
          source: "satellite",
          paint: {
            "raster-saturation": -0.12,
            "raster-contrast": 0,
            "raster-brightness-max": 0.97,
            "raster-fade-duration": 200,
          },
        },
        // A thin wash of the brand ink settles the imagery behind the overlay.
        {
          id: "sat-wash",
          type: "background",
          paint: { "background-color": INK, "background-opacity": 0.07 },
        },
        {
          id: "sat-road",
          type: "line",
          source: "streets",
          "source-layer": "road",
          filter: ROADS,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#F4F1E6",
            "line-opacity": 0.4,
            "line-width": roadWidth(0.3),
          },
        },
        placeLabel("sat-place", "#F4F1E6", "rgba(21,38,28,0.85)"),
      ]),

      // ── The farm: the same data in both looks ──
      {
        id: "mv-paddock-fill",
        type: "fill",
        source: FARM_SOURCE,
        paint: { "fill-color": SAT_FILL, "fill-opacity": SAT_FILL_OPACITY },
      },
      {
        id: "mv-scrub",
        type: "fill",
        source: SCRUB_SOURCE,
        layout: { visibility: "none" },
        paint: { "fill-color": "#3F6B4A", "fill-opacity": 0.85 },
      },
      {
        id: "mv-paddock-picked-fill",
        type: "fill",
        source: FARM_SOURCE,
        filter: ["==", ["get", "id"], ""],
        paint: { "fill-color": "#F7DB5C", "fill-opacity": 0.22 },
      },
      trailLayer("mv-history", HISTORY_SOURCE),
      pauseLayer("mv-history-pause", HISTORY_SOURCE),
      trailLayer("mv-trails", TRAIL_SOURCE),
      trailLayer("mv-my-trail", MY_TRAIL_SOURCE),
      {
        id: "mv-fence",
        type: "line",
        source: FARM_SOURCE,
        layout: { "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-opacity": 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 15, 1.8],
          "line-dasharray": [3, 2.4],
        },
      },
      // A trail being replayed paints itself in again as the machine goes.
      {
        ...trailLayer("mv-replay", REPLAY_SOURCE),
        paint: {
          "line-color": ["get", "color"],
          "line-width": trailWidth,
          "line-opacity": 0.72,
        },
      },
      // The picked trail: its centre line, marching the way it was driven.
      {
        id: "mv-picked-trail-case",
        type: "line",
        source: PICKED_TRAIL_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": INK,
          "line-opacity": 0.55,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 6],
        },
      },
      {
        id: "mv-picked-trail",
        type: "line",
        source: PICKED_TRAIL_SOURCE,
        layout: { "line-join": "round" },
        paint: {
          "line-color": "#F7DB5C",
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 16, 3.2],
          "line-dasharray": MARCH[0],
        },
      },
      // The picked paddock's fence, on top of everything drawn in it.
      {
        id: "mv-paddock-picked-case",
        type: "line",
        source: FARM_SOURCE,
        filter: ["==", ["get", "id"], ""],
        layout: { "line-join": "round" },
        paint: {
          "line-color": INK,
          "line-opacity": 0.6,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 7.5],
        },
      },
      {
        id: "mv-paddock-picked-line",
        type: "line",
        source: FARM_SOURCE,
        filter: ["==", ["get", "id"], ""],
        layout: { "line-join": "round" },
        paint: {
          "line-color": "#F7DB5C",
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4],
          "line-dasharray": MARCH[0],
        },
      },
      {
        id: "mv-accuracy",
        type: "fill",
        source: ACCURACY_SOURCE,
        paint: { "fill-color": "#ffffff", "fill-opacity": 0.16 },
      },
      {
        id: "mv-paddock-name",
        type: "symbol",
        source: LABEL_SOURCE,
        minzoom: 11.4,
        layout: {
          "text-field": [
            "format",
            ["get", "name"],
            {},
            "\n",
            {},
            ["get", "sub"],
            { "font-scale": 0.76 },
          ],
          "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11.4,
            9,
            13,
            11.5,
            15,
            15,
            17,
            19,
          ],
          "text-letter-spacing": 0.03,
          "text-line-height": 1.15,
          "text-max-width": 9,
          "text-padding": 6,
        },
        paint: {
          "text-color": "#F4F1E6",
          "text-halo-color": "rgba(13,22,17,0.85)",
          "text-halo-width": 1.6,
        },
      },
      {
        id: PIN_LAYER,
        type: "symbol",
        source: PIN_SOURCE,
        layout: {
          "icon-image": ["get", "image"],
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.34,
            12,
            0.5,
            15,
            0.74,
            17,
            0.84,
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        // Looking at a whole district, hundreds of pins are just a smear:
        // they fade out, and come back as the map closes in on a paddock.
        paint: {
          "icon-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8.8,
            0,
            10.4,
            1,
          ],
        },
      },
      {
        id: "mv-pin-notes",
        type: "symbol",
        source: PIN_SOURCE,
        minzoom: 13.6,
        filter: ["!=", ["get", "note"], ""],
        layout: {
          "text-field": ["get", "note"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
          "text-size": 11.5,
          "text-anchor": "top",
          "text-offset": [0, 1.55],
          "text-max-width": 9,
        },
        paint: {
          "text-color": "#F4F1E6",
          "text-halo-color": "rgba(13,22,17,0.85)",
          "text-halo-width": 1.4,
        },
      },
    ],
  }
}

/** Switch between imagery and the drawn map. */
export function applyBase(map: MapboxMap, look: BaseLook) {
  for (const layer of map.getStyle().layers as {
    id: string
    metadata?: { look?: BaseLook }
  }[]) {
    const owner = layer.metadata?.look
    if (!owner) continue
    map.setLayoutProperty(
      layer.id,
      "visibility",
      owner === look ? "visible" : "none",
    )
  }
  const paper = look === "paper"
  map.setPaintProperty(
    "mv-paddock-fill",
    "fill-color",
    paper ? ["get", "fill"] : SAT_FILL,
  )
  map.setPaintProperty(
    "mv-paddock-fill",
    "fill-opacity",
    paper ? 1 : SAT_FILL_OPACITY,
  )
  map.setLayoutProperty("mv-scrub", "visibility", paper ? "visible" : "none")
  // (A picked trail's dimming is put back by the caller after this.)
  for (const id of TRAIL_LAYERS)
    map.setPaintProperty(id, "line-opacity", trailOpacity(look))
  for (const id of ["mv-paddock-name", "mv-pin-notes"]) {
    map.setPaintProperty(id, "text-color", paper ? INK : "#F4F1E6")
    map.setPaintProperty(
      id,
      "text-halo-color",
      paper ? "rgba(230,222,194,0.9)" : "rgba(13,22,17,0.85)",
    )
  }
  map.setPaintProperty("mv-fence", "line-opacity", paper ? 1 : 0.9)
  map.setPaintProperty(
    "mv-accuracy",
    "fill-color",
    paper ? "#15261C" : "#ffffff",
  )
}

/**
 * Other imagery the app already offers, laid over the Mapbox imagery when
 * chosen. `null` goes back to Mapbox's own.
 */
export const IMAGERY: Record<
  string,
  { label: string; tiles: string[]; maxzoom: number; credit: string }
> = {
  google_satellite: {
    label: "Google",
    tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
    maxzoom: 20,
    credit: "Google",
  },
  bing_aerial: {
    label: "Bing",
    tiles: [0, 1, 2, 3].map(
      (n) =>
        `https://ecn.t${n}.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=12574`,
    ),
    maxzoom: 18,
    credit: "Microsoft",
  },
}

const ALT_IMAGERY = "mv-alt-imagery"

export function setImagery(map: MapboxMap, key: string | null, look: BaseLook) {
  if (map.getLayer(ALT_IMAGERY)) map.removeLayer(ALT_IMAGERY)
  if (map.getSource(ALT_IMAGERY)) map.removeSource(ALT_IMAGERY)
  const imagery = key ? IMAGERY[key] : null
  if (!imagery) return
  map.addSource(ALT_IMAGERY, {
    type: "raster",
    tiles: imagery.tiles,
    tileSize: 256,
    maxzoom: imagery.maxzoom,
  })
  map.addLayer(
    {
      id: ALT_IMAGERY,
      type: "raster",
      source: ALT_IMAGERY,
      metadata: { look: "satellite" },
      layout: { visibility: look === "satellite" ? "visible" : "none" },
      paint: {
        "raster-saturation": -0.12,
        "raster-contrast": 0,
        "raster-brightness-max": 0.97,
        "raster-fade-duration": 200,
      },
    },
    "sat-wash",
  )
}
