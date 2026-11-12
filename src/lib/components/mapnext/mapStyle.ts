/**
 * One Mapbox style holding both looks of the new map:
 *
 *   "satellite"  real imagery, toned down so fences, trails and chips read
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
            "raster-saturation": -0.38,
            "raster-contrast": -0.06,
            "raster-brightness-max": 0.92,
            "raster-fade-duration": 200,
          },
        },
        // A thin wash of the brand ink settles the imagery behind the overlay.
        {
          id: "sat-wash",
          type: "background",
          paint: { "background-color": INK, "background-opacity": 0.16 },
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
      // The pin someone has tapped sits on a yellow disc.
      {
        id: "mv-pin-halo",
        type: "circle",
        source: PIN_SOURCE,
        filter: ["==", ["get", "id"], ""],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 14, 16, 26],
          "circle-color": "#F7DB5C",
          "circle-opacity": 0.92,
          "circle-stroke-color": INK,
          "circle-stroke-width": 1.5,
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
  for (const id of TRAIL_LAYERS)
    map.setPaintProperty(id, "line-opacity", paper ? 0.56 : 0.5)
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
        "raster-saturation": -0.38,
        "raster-contrast": -0.06,
        "raster-brightness-max": 0.92,
        "raster-fade-duration": 200,
      },
    },
    "sat-wash",
  )
}
