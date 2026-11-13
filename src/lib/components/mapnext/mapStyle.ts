/**
 * One Mapbox style holding both looks of the new map:
 *
 *   "satellite"  real imagery, eased back a touch so fences, trails and
 *                chips read, but still the colour of the country
 *   "paper"      a drawn map in the landing page's colours: cream ground,
 *                contour lines, lanes, and paddocks filled like the
 *                illustrated farm map
 *   "dark"       the admin global map's look: Mapbox's dark map from far
 *                away, with paddocks as blocks of bright colour, and the
 *                imagery fading in as the map closes in on a paddock
 *
 * Both sets of layers live in the same style and are switched by visibility,
 * so changing look never reloads the map or drops the app's own layers.
 */

export type BaseLook = "satellite" | "paper" | "dark"

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
/** The line or shape being measured with the measure tool. */
export const MEASURE_SOURCE = "mv-measure"
/**
 * Direction arrows: one point every so many metres along a trail, with the
 * way it was heading. One source for every trail on the map, one for the
 * trail picked out.
 */
export const ARROW_SOURCE = "mv-arrows"
export const PICKED_ARROW_SOURCE = "mv-picked-arrows"
export const ARROW_LAYER = "mv-arrows"
export const PICKED_ARROW_LAYER = "mv-picked-arrows"
/** Areas and lines kept on a paddock, each with a name. */
export const FEATURE_SOURCE = "mv-paddock-features"
export const FEATURE_LAYERS = ["mv-feature-fill", "mv-feature-line"]
/** The lasso drawn round pins to remove, and the pins it caught. */
export const LASSO_SOURCE = "mv-lasso"
/** Areas and lines drawn on the map and attached to a pin. */
export const DRAWING_SOURCE = "mv-drawings"
export const DRAWING_LAYERS = [
  "mv-drawing-fill",
  "mv-drawing-hair",
  "mv-drawing-line",
  "mv-drawing-dash",
]

/** What the Layers tool can show and hide, and the style layers behind each. */
export const LAYER_GROUPS: Record<string, string[]> = {
  fields: [
    "mv-paddock-fill",
    "mv-scrub",
    "mv-fence",
    "mv-fence-solid",
    "mv-paddock-dots",
    "mv-feature-fill",
    "mv-feature-line",
    "mv-feature-name",
  ],
  fieldLabels: ["mv-paddock-name"],
  markers: ["mv-pins"],
  markerLabels: ["mv-pin-notes"],
  markerDrawings: DRAWING_LAYERS,
  historicalTrails: ["mv-history", "mv-history-pause"],
  activeTrails: ["mv-trails"],
}

/** Layers that belong to some looks only. */
const LOOK_ONLY: Record<string, BaseLook[]> = {
  "mv-scrub": ["paper"],
  "mv-fence": ["satellite", "paper"],
  "mv-fence-solid": ["dark"],
  "mv-paddock-dots": ["dark"],
}

/** The black centre line that goes with the arrows, by kind of trail. */
const TRAIL_MARKS: Record<string, string[]> = {
  historicalTrails: ["mv-history-centre"],
  activeTrails: ["mv-trails-centre", "mv-my-trail-centre"],
}

/**
 * Show or hide a group of layers. Pin notes also need their pins showing,
 * and the direction arrows (off unless switched on) need their trails.
 */
export function showLayers(
  map: MapboxMap,
  shown: Record<string, boolean>,
  look: BaseLook,
) {
  for (const [group, layers] of Object.entries(LAYER_GROUPS)) {
    let visible = shown[group] !== false
    if (group === "markerLabels" || group === "markerDrawings")
      visible = visible && shown.markers !== false
    for (const layer of layers) {
      const only = LOOK_ONLY[layer]
      const on = visible && (!only || only.includes(look))
      map.setLayoutProperty(layer, "visibility", on ? "visible" : "none")
    }
  }
  const kinds: string[] = []
  for (const [group, layers] of Object.entries(TRAIL_MARKS)) {
    const on = shown.trailArrows === true && shown[group] !== false
    if (on) kinds.push(group)
    for (const layer of layers)
      map.setLayoutProperty(layer, "visibility", on ? "visible" : "none")
  }
  // Each arrow says which kind of trail it belongs to.
  map.setLayoutProperty(
    ARROW_LAYER,
    "visibility",
    kinds.length ? "visible" : "none",
  )
  map.setFilter(ARROW_LAYER, ["in", ["get", "kind"], ["literal", kinds]])
}

const DRAWING_KIND: Record<string, unknown> = {
  "mv-drawing-fill": ["==", ["get", "kind"], "polygon"],
  "mv-drawing-hair": true,
  "mv-drawing-line": ["!", ["get", "dashed"]],
  "mv-drawing-dash": ["get", "dashed"],
}

/**
 * Which pins' drawings show: those set to show all the time, and those of
 * the pin picked out (`null` for none).
 */
export function showDrawingsFor(map: MapboxMap, pinId: string | null) {
  const showing = [
    "any",
    ["get", "always"],
    ["==", ["get", "pin"], pinId ?? ""],
  ]
  for (const layer of DRAWING_LAYERS)
    map.setFilter(layer, ["all", DRAWING_KIND[layer], showing])
}

/**
 * The direction marks on the one trail picked out or being replayed: its
 * black centre line and its arrows, each switched on its own.
 */
export function showPickedMarks(
  map: MapboxMap,
  marks: { centre: boolean; arrows: boolean },
) {
  for (const id of ["mv-picked-centre", "mv-replay-centre"])
    map.setLayoutProperty(id, "visibility", marks.centre ? "visible" : "none")
  map.setLayoutProperty(
    PICKED_ARROW_LAYER,
    "visibility",
    marks.arrows ? "visible" : "none",
  )
}

/**
 * While a trail replays, its arrows appear as the machine passes them:
 * only those within `metres` of the start show. `null` shows them all.
 */
export function showArrowsTo(map: MapboxMap, metres: number | null) {
  map.setFilter(
    PICKED_ARROW_LAYER,
    metres === null ? null : ["<=", ["get", "d"], metres],
  )
}

/**
 * Pins are one size at every zoom, as in the current viewer: the image is
 * drawn at three times its size on screen and only ever scaled down a
 * little, which is what keeps it sharp.
 */
const PIN_SCALE = 0.78

/** How many pixels across a pin is drawn (its image is 48px at scale 1). */
export const pinPixels = () => 48 * PIN_SCALE

const empty = { type: "FeatureCollection", features: [] }

// On imagery a paddock is a faint wash of its own colour; on the drawn map it
// is filled in. A feature may carry `tint` (its colour on imagery) and `wash`
// (how strong); without them its `fill` is used at a light wash.
const SAT_FILL = ["coalesce", ["get", "tint"], ["get", "fill"]]
const SAT_FILL_OPACITY = ["coalesce", ["get", "wash"], 0.16]
// On the dark map a paddock is a block of its colour (`glow`): strong from
// far away, where the farm is a handful of bright shapes, and easing back
// as the imagery comes up underneath. The admin global map's numbers.
const DARK_FILL = [
  "coalesce",
  ["get", "glow"],
  ["get", "tint"],
  ["get", "fill"],
]
const DARK_FILL_OPACITY = ["interpolate", ["linear"], ["zoom"], 6, 0.6, 12, 0.3]
// A fence is dashed in its paddock's own colour, white where it has none.
const FENCE_COLOUR = ["coalesce", ["get", "line"], "#ffffff"]

/** Trail width in metres → pixels, the same way the real viewer does it. */
const trailWidthBy = (times: number) => [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  10,
  ["*", ["get", "width"], times * Math.pow(2, -6)],
  24,
  ["*", ["get", "width"], times * Math.pow(2, 8)],
]
const trailWidth = trailWidthBy(1)

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

/**
 * A thin black line down the middle of a trail, as the current viewer draws
 * with its direction arrows.
 */
// Like the trail itself, the centre line and the arrows are a size on the
// ground, not on the screen: they double with every zoom level, so they sit
// still on the trail as the map zooms. The current viewer's numbers.
const onGround = (atZoom16: number) => [
  "interpolate",
  ["exponential", 2],
  ["zoom"],
  10,
  atZoom16 * Math.pow(2, -6),
  24,
  atZoom16 * Math.pow(2, 8),
]

const centreLayer = (id: string, source: string, filter: unknown) => ({
  id,
  type: "line",
  source,
  minzoom: 13,
  filter,
  layout: { "line-join": "round", "line-cap": "round", visibility: "none" },
  paint: {
    "line-color": "#000000",
    "line-width": onGround(0.3),
    "line-opacity": 0.8,
  },
})

/**
 * Arrows along a trail, pointing the way it was driven, the way the current
 * viewer draws them: one every 30 metres of ground (the points are worked
 * out by the engine), in the trail's colour inside a black edge.
 */
const arrowLayer = (id: string, source: string) => ({
  id,
  type: "symbol",
  source,
  minzoom: 13,
  layout: {
    "text-field": "\u27A4",
    "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
    "text-size": onGround(9),
    // The glyph points east; `rot` turns it to the trail's heading.
    "text-rotate": ["get", "rot"],
    "text-rotation-alignment": "map",
    "text-pitch-alignment": "map",
    "text-allow-overlap": true,
    "text-ignore-placement": true,
    "text-anchor": "center",
    visibility: "none",
  },
  paint: {
    "text-color": ["get", "color"],
    "text-halo-color": "rgba(0, 0, 0, 0.8)",
    "text-halo-width": 1,
  },
})

const NOT_HEAD = ["!=", ["get", "segment"], "head"]

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
    "mv-paddock-picked-glow",
    "mv-paddock-picked-case",
    "mv-paddock-picked-line",
  ])
    map.setFilter(layer, ["==", ["get", "id"], id ?? ""])
}

/**
 * Let whatever is picked breathe: `level` runs 0 to 1 and back, and the glow
 * round the picked paddock and trail follows it.
 */
export function breathe(map: MapboxMap, level: number) {
  map.setPaintProperty(
    "mv-paddock-picked-glow",
    "line-opacity",
    0.15 + 0.5 * level,
  )
  map.setPaintProperty(
    "mv-paddock-picked-fill",
    "fill-opacity",
    0.16 + 0.12 * level,
  )
  map.setPaintProperty(
    "mv-picked-trail-glow",
    "line-opacity",
    0.12 + 0.55 * level,
  )
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

const placeLabel = (
  id: string,
  color: string,
  halo: string,
  capitals = true,
) => ({
  id,
  type: "symbol",
  source: "streets",
  "source-layer": "place_label",
  filter: ["match", ["get", "class"], ["settlement"], true, false],
  layout: {
    "text-field": ["get", "name"],
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
    "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 14, 15],
    "text-letter-spacing": capitals ? 0.08 : 0.01,
    "text-transform": capitals ? "uppercase" : "none",
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
      [MEASURE_SOURCE]: { type: "geojson", data: empty },
      [ARROW_SOURCE]: { type: "geojson", data: empty },
      [DRAWING_SOURCE]: { type: "geojson", data: empty },
      [FEATURE_SOURCE]: { type: "geojson", data: empty },
      [LASSO_SOURCE]: { type: "geojson", data: empty },
      [PICKED_ARROW_SOURCE]: { type: "geojson", data: empty },
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

      // ── Dark map (the admin global map's look) ──
      // Mapbox's dark map from far away; the imagery fades in between zoom
      // 8 and 10.5, as the map closes in on a paddock.
      ...group("dark", [
        {
          id: "dark-ground",
          type: "background",
          paint: { "background-color": "hsl(55, 1%, 20%)" },
        },
        {
          id: "dark-park",
          type: "fill",
          source: "streets",
          "source-layer": "landuse_overlay",
          minzoom: 5,
          filter: ["==", ["get", "class"], "national_park"],
          paint: { "fill-color": "hsl(132, 2%, 20%)", "fill-opacity": 0.5 },
        },
        {
          id: "dark-water",
          type: "fill",
          source: "streets",
          "source-layer": "water",
          paint: { "fill-color": "hsl(185, 2%, 10%)" },
        },
        {
          id: "dark-waterway",
          type: "line",
          source: "streets",
          "source-layer": "waterway",
          minzoom: 8,
          paint: {
            "line-color": "hsl(185, 2%, 10%)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 3],
          },
        },
        {
          id: "dark-road-case",
          type: "line",
          source: "streets",
          "source-layer": "road",
          filter: ROADS,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "hsl(0, 0%, 17%)",
            "line-width": roadWidth(0.9),
          },
        },
        {
          id: "dark-road",
          type: "line",
          source: "streets",
          "source-layer": "road",
          filter: ROADS,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "hsl(0, 0%, 27%)",
            "line-width": roadWidth(0.6),
          },
        },
        {
          id: "dark-border",
          type: "line",
          source: "streets",
          "source-layer": "admin",
          filter: [
            "all",
            ["==", ["get", "admin_level"], 1],
            ["==", ["get", "maritime"], "false"],
          ],
          paint: { "line-color": "hsl(0, 0%, 35%)", "line-width": 0.8 },
        },
        {
          id: "dark-imagery",
          type: "raster",
          source: "satellite",
          minzoom: 8,
          paint: {
            "raster-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0,
              10.5,
              1,
            ],
            "raster-fade-duration": 200,
          },
        },
        placeLabel(
          "dark-place",
          "hsl(0, 0%, 88%)",
          "hsla(0, 0%, 10%, 0.75)",
          false,
        ),
      ]),

      // ── The farm: the same data in every look ──
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
      // What people have drawn and attached to pins: over the paddocks,
      // under the trails. An area is filled in its colour; outlines and lines
      // are a width on the ground, as the current viewer draws them, with a
      // hairline under them so they don't vanish from far away.
      {
        id: "mv-drawing-fill",
        type: "fill",
        source: DRAWING_SOURCE,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["get", "fillOpacity"],
        },
      },
      {
        id: "mv-drawing-hair",
        type: "line",
        source: DRAWING_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.2,
          "line-opacity": 0.9,
        },
      },
      {
        id: "mv-drawing-line",
        type: "line",
        source: DRAWING_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": trailWidth },
      },
      {
        id: "mv-drawing-dash",
        type: "line",
        source: DRAWING_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": trailWidth,
          "line-dasharray": [2, 2],
        },
      },
      trailLayer("mv-history", HISTORY_SOURCE),
      pauseLayer("mv-history-pause", HISTORY_SOURCE),
      trailLayer("mv-trails", TRAIL_SOURCE),
      trailLayer("mv-my-trail", MY_TRAIL_SOURCE),
      // Direction marks over every trail: off unless switched on in Layers.
      centreLayer("mv-history-centre", HISTORY_SOURCE, NOT_PAUSED),
      centreLayer("mv-trails-centre", TRAIL_SOURCE, NOT_PAUSED),
      centreLayer("mv-my-trail-centre", MY_TRAIL_SOURCE, NOT_PAUSED),
      arrowLayer(ARROW_LAYER, ARROW_SOURCE),
      {
        id: "mv-fence",
        type: "line",
        source: FARM_SOURCE,
        layout: { "line-join": "round" },
        paint: {
          "line-color": FENCE_COLOUR,
          "line-opacity": 0.95,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1, 15, 2.2],
          "line-dasharray": [3, 2.4],
        },
      },
      // The dark map draws a fence the way the admin global map does: a
      // thin solid line in the paddock's colour, once the map is close.
      {
        id: "mv-fence-solid",
        type: "line",
        source: FARM_SOURCE,
        minzoom: 8,
        layout: { "line-join": "round", visibility: "none" },
        paint: {
          "line-color": DARK_FILL,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 13, 1.8],
        },
      },
      // From far away on the dark map a paddock is too small to see, so
      // each stands in as a dot of its colour, never smaller than a couple
      // of pixels: the farm reads as a cloud of paddocks long before their
      // shapes do. (The admin global map's far-away view.)
      {
        id: "mv-paddock-dots",
        type: "circle",
        source: LABEL_SOURCE,
        maxzoom: 11,
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["coalesce", ["get", "glow"], "#38bdf8"],
          "circle-radius": [
            "interpolate",
            ["exponential", 2],
            ["zoom"],
            4,
            1.6,
            7,
            [
              "max",
              1.6,
              ["*", 0.054, ["sqrt", ["coalesce", ["get", "ha"], 0]]],
            ],
            10,
            [
              "max",
              1.6,
              ["*", 0.434, ["sqrt", ["coalesce", ["get", "ha"], 0]]],
            ],
          ],
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8.5,
            0.85,
            10.5,
            0,
          ],
        },
      },
      // The picked trail, the way the current viewer shows it: a soft white
      // glow that breathes, a white edge, and the trail itself at full
      // strength on top.
      {
        id: "mv-picked-trail-glow",
        type: "line",
        source: PICKED_TRAIL_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": trailWidthBy(2.4),
          "line-blur": 8,
          "line-opacity": 0.4,
        },
      },
      {
        id: "mv-picked-trail-edge",
        type: "line",
        source: PICKED_TRAIL_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": trailWidthBy(1.45),
          "line-opacity": 0.95,
        },
      },
      {
        id: "mv-picked-trail",
        type: "line",
        source: PICKED_TRAIL_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": trailWidth,
          "line-opacity": 1,
        },
      },
      centreLayer("mv-picked-centre", PICKED_TRAIL_SOURCE, NOT_PAUSED),
      // A trail being replayed paints itself in again as the machine goes:
      // solid in its own colour inside a white edge, with the stretch just
      // laid still bright behind the machine.
      {
        id: "mv-replay-edge",
        type: "line",
        source: REPLAY_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": trailWidthBy(1.3),
          "line-opacity": 0.92,
        },
      },
      {
        id: "mv-replay",
        type: "line",
        source: REPLAY_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": trailWidth,
          "line-opacity": 1,
        },
      },
      {
        id: "mv-replay-head",
        type: "line",
        source: REPLAY_SOURCE,
        filter: ["==", ["get", "segment"], "head"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#FFF6C2",
          "line-width": trailWidth,
          "line-opacity": 0.9,
        },
      },
      centreLayer("mv-replay-centre", REPLAY_SOURCE, NOT_HEAD),
      arrowLayer(PICKED_ARROW_LAYER, PICKED_ARROW_SOURCE),
      // The picked paddock's fence, on top of everything drawn in it: a
      // solid line over a soft glow that breathes.
      {
        id: "mv-paddock-picked-glow",
        type: "line",
        source: FARM_SOURCE,
        filter: ["==", ["get", "id"], ""],
        layout: { "line-join": "round" },
        paint: {
          "line-color": "#F7DB5C",
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 8, 16, 18],
          "line-blur": 8,
          "line-opacity": 0.4,
        },
      },
      {
        id: "mv-paddock-picked-case",
        type: "line",
        source: FARM_SOURCE,
        filter: ["==", ["get", "id"], ""],
        layout: { "line-join": "round" },
        paint: {
          "line-color": INK,
          "line-opacity": 0.55,
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3.5, 16, 6.5],
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
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.8, 16, 3.6],
        },
      },
      // What has been kept on a paddock: an area or a line with a name,
      // over the trails so it can be read and tapped.
      {
        id: "mv-feature-fill",
        type: "fill",
        source: FEATURE_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.32 },
      },
      {
        id: "mv-feature-line",
        type: "line",
        source: FEATURE_SOURCE,
        filter: ["!=", ["geometry-type"], "Point"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.4, 16, 3],
        },
      },
      // The lasso for removing pins: red, dashed, with a ring on each pin
      // it has caught.
      {
        id: "mv-lasso-fill",
        type: "fill",
        source: LASSO_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#ef4444", "fill-opacity": 0.15 },
      },
      {
        id: "mv-lasso-line",
        type: "line",
        source: LASSO_SOURCE,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ef4444",
          "line-width": 3,
          "line-dasharray": [2, 1.4],
        },
      },
      // The measure tool: the shape so far, its outline, and its corners.
      {
        id: "mv-measure-fill",
        type: "fill",
        source: MEASURE_SOURCE,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": ["coalesce", ["get", "color"], "#F7DB5C"],
          "fill-opacity": 0.3,
        },
      },
      {
        id: "mv-measure-case",
        type: "line",
        source: MEASURE_SOURCE,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": INK, "line-opacity": 0.6, "line-width": 6 },
      },
      {
        id: "mv-measure-line",
        type: "line",
        source: MEASURE_SOURCE,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["coalesce", ["get", "color"], "#F7DB5C"],
          "line-width": 3,
        },
      },
      {
        id: "mv-measure-corner",
        type: "circle",
        source: MEASURE_SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": ["coalesce", ["get", "color"], "#F7DB5C"],
          "circle-stroke-color": INK,
          "circle-stroke-width": 2,
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
          "icon-size": PIN_SCALE,
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
      // A pin's note, the way the current viewer shows it: above the pin
      // in pale yellow with a hard black edge, growing as the map closes in.
      {
        id: "mv-pin-notes",
        type: "symbol",
        source: PIN_SOURCE,
        minzoom: 12,
        filter: ["!=", ["get", "note"], ""],
        layout: {
          "text-field": ["get", "note"],
          "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12,
            12.5,
            14,
            14.5,
            16,
            16.5,
            18,
            19,
          ],
          "text-anchor": "bottom",
          "text-offset": [0, -1.45],
          "text-max-width": 14,
          "text-letter-spacing": 0.02,
          "text-optional": true,
        },
        paint: {
          "text-color": "#ffee8c",
          "text-halo-color": "#000000",
          "text-halo-width": 2,
        },
      },
      // The name on something kept on a paddock.
      {
        id: "mv-feature-name",
        type: "symbol",
        source: FEATURE_SOURCE,
        minzoom: 12.5,
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "text-field": [
            "format",
            ["get", "label"],
            {},
            "\n",
            {},
            ["get", "size"],
            { "font-scale": 0.8 },
          ],
          "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 11, 16, 15],
          "text-max-width": 10,
          "text-line-height": 1.15,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.8)",
          "text-halo-width": 1.6,
        },
      },
      // The pins a lasso has caught, ringed in red.
      {
        id: "mv-lasso-hits",
        type: "circle",
        source: LASSO_SOURCE,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 24,
          "circle-color": "rgba(239, 68, 68, 0.25)",
          "circle-stroke-color": "#ef4444",
          "circle-stroke-width": 3,
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
  const dark = look === "dark"
  map.setPaintProperty(
    "mv-paddock-fill",
    "fill-color",
    paper ? ["get", "fill"] : dark ? DARK_FILL : SAT_FILL,
  )
  map.setPaintProperty(
    "mv-paddock-fill",
    "fill-opacity",
    paper ? 1 : dark ? DARK_FILL_OPACITY : SAT_FILL_OPACITY,
  )
  for (const [layer, looks] of Object.entries(LOOK_ONLY))
    map.setLayoutProperty(
      layer,
      "visibility",
      looks.includes(look) ? "visible" : "none",
    )
  // (A picked trail's dimming is put back by the caller after this.)
  for (const id of TRAIL_LAYERS)
    map.setPaintProperty(id, "line-opacity", trailOpacity(look))
  map.setPaintProperty("mv-paddock-name", "text-color", paper ? INK : "#F4F1E6")
  map.setPaintProperty(
    "mv-paddock-name",
    "text-halo-color",
    paper ? "rgba(230,222,194,0.9)" : "rgba(13,22,17,0.85)",
  )
  // Pale yellow on black can't be read on the cream map: ink there.
  map.setPaintProperty("mv-pin-notes", "text-color", paper ? INK : "#ffee8c")
  map.setPaintProperty(
    "mv-pin-notes",
    "text-halo-color",
    paper ? "rgba(251,249,242,0.95)" : "#000000",
  )
  map.setPaintProperty("mv-fence", "line-opacity", paper ? 1 : 0.95)
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
