<!-- src/routes/map-look-lab/+page.svelte -->
<!-- Dev-only lab for comparing map looks without logging in. A demo farm with
     made-up paddocks and trails that cross and double up, drawn with the same
     layer ids, look module and tuner panel as the real map viewer. Renders
     nothing in production builds. -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { dev } from "$app/environment"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  // mapbox-gl ships no types; default import so accessToken is assignable.
  // @ts-expect-error -- no type declarations for mapbox-gl 1.x
  import mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import MapLook from "$lib/components/map/MapLook.svelte"
  import MapLookPanel from "$lib/components/map/dev/MapLookPanel.svelte"
  import {
    currentLook,
    trailLineColor,
    trailOpacity,
  } from "$lib/stores/mapLookStore"
  import { fieldColors, trailColorExpr } from "$lib/utils/mapLook"
  import { applyFieldPaint, type MapboxMap } from "$lib/utils/mapLookApply"
  import { calculateZoomDependentWidth } from "$lib/utils/trailGeometry"

  const CENTER: [number, number] = [118.257866, -32.238795]
  const M_LAT = 1 / 111320
  const M_LNG = 1 / (111320 * Math.cos((CENTER[1] * Math.PI) / 180))

  /** Metres east/north of the centre → [lng, lat]. */
  const at = (x: number, y: number): [number, number] => [
    CENTER[0] + x * M_LNG,
    CENTER[1] + y * M_LAT,
  ]

  function rect(x0: number, y0: number, x1: number, y1: number, skew = 0) {
    const ring = [
      at(x0, y0),
      at(x1, y0 + skew),
      at(x1, y1 + skew),
      at(x0, y1),
      at(x0, y0),
    ]
    return { type: "Polygon", coordinates: [ring] }
  }

  // Four paddocks with a laneway between them. Two keep the default colour,
  // two use colours from the field colour picker.
  const fields = [
    {
      name: "Top West",
      color: "default",
      boundary: rect(-900, 60, -60, 700, 20),
    },
    {
      name: "Top East",
      color: "#FFFF00",
      boundary: rect(0, 80, 820, 720, -15),
    },
    {
      name: "Bottom West",
      color: "default",
      boundary: rect(-900, -700, -60, 0, 20),
    },
    {
      name: "Bottom East",
      color: "#22c55e",
      boundary: rect(0, -680, 820, 20, -15),
    },
  ]

  /** Back-and-forth passes across a block: x0→x1, stepping north by `gap`. */
  function passes(
    x0: number,
    x1: number,
    y0: number,
    gap: number,
    count: number,
  ) {
    const pts: [number, number][] = []
    for (let i = 0; i < count; i++) {
      const y = y0 + i * gap
      if (i % 2 === 0) pts.push(at(x0, y), at(x1, y))
      else pts.push(at(x1, y), at(x0, y))
    }
    return pts
  }

  type DemoTrail = {
    id: string
    color: string
    swath: number
    coords: [number, number][]
    pause?: boolean
  }

  // Closed trails: one layer each, like HistoricalTrailManager.
  const closedTrails: DemoTrail[] = [
    // Boom spray, passes slightly closer than the swath so neighbours overlap.
    {
      id: "red",
      color: "Red",
      swath: 36,
      coords: passes(-860, -110, 110, 32, 9),
    },
    // A second machine re-covering the same block at an angle.
    {
      id: "orange",
      color: "Orange",
      swath: 36,
      coords: [at(-860, 120), at(-110, 400), at(-860, 400), at(-110, 660)],
    },
    {
      id: "blue",
      color: "Blue",
      swath: 12,
      coords: passes(60, 780, 130, 12, 22),
    },
    {
      id: "yellow",
      color: "Yellow",
      swath: 36,
      coords: [at(40, 120), at(780, 680), at(780, 420), at(40, 420)],
    },
    {
      id: "green",
      color: "Green",
      swath: 12,
      coords: passes(-860, -110, -660, 12, 24),
    },
    {
      id: "lightgreen",
      color: "LightGreen",
      swath: 12,
      coords: passes(-860, -480, -660, 12, 24),
    },
    {
      id: "skyblue",
      color: "SkyBlue",
      swath: 36,
      coords: passes(60, 780, -640, 36, 6),
    },
    {
      id: "hotpink",
      color: "HotPink",
      swath: 36,
      coords: passes(60, 780, -400, 36, 5),
    },
    // Paused transfer between the two east paddocks.
    {
      id: "pause",
      color: "Blue",
      swath: 12,
      pause: true,
      coords: [at(420, 130), at(420, -200)],
    },
  ]

  // Live trails: features in one combined layer, like ActiveTrailManager.
  const activeTrails: DemoTrail[] = [
    {
      id: "purple",
      color: "Purple",
      swath: 36,
      coords: [at(120, -660), at(700, -40), at(700, -660), at(120, -40)],
    },
    {
      id: "red-live",
      color: "Red",
      swath: 12,
      coords: passes(-420, -110, -380, 12, 20),
    },
  ]

  let container: HTMLDivElement
  let map: MapboxMap | null = null
  let mapLoaded = false
  let unsubscribeLook: (() => void) | null = null

  function fieldsGeojson() {
    return {
      type: "FeatureCollection",
      features: fields.map((field, index) => {
        const colors = fieldColors(field.color, index, $currentLook)
        return {
          type: "Feature",
          geometry: field.boundary,
          properties: { id: index, name: field.name, ...colors },
        }
      }),
    }
  }

  function line(coords: [number, number][], properties = {}) {
    return {
      type: "Feature",
      properties,
      geometry: { type: "LineString", coordinates: coords },
    }
  }

  function setup() {
    map.addSource("fields", { type: "geojson", data: fieldsGeojson() })
    map.addLayer({
      id: "fields-fill",
      type: "fill",
      source: "fields",
      paint: {
        "fill-color": ["get", "fillColor"],
        "fill-opacity": $currentLook.fields.fillOpacity,
      },
    })

    for (const trail of closedTrails) {
      map.addSource(`trail-source-${trail.id}`, {
        type: "geojson",
        data: line(trail.coords),
      })
      map.addLayer({
        id: `trail-layer-${trail.id}`,
        type: "line",
        source: `trail-source-${trail.id}`,
        metadata: {
          agskanTrailColor: trail.color,
          agskanTrailRole: trail.pause ? "pause" : "work",
        },
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": trailLineColor(trail.color),
          "line-width": calculateZoomDependentWidth(
            trail.swath,
            trail.pause ? 0.6 : 1,
          ),
          "line-opacity": trailOpacity(trail.pause ? "pause" : "work"),
          ...(trail.pause ? { "line-dasharray": [0.12, 1.5] } : {}),
        },
      })
    }

    map.addSource("all-active-trails-combined", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: activeTrails.map((t, i) =>
          line(t.coords, { color: t.color, width: t.swath, sortKey: i }),
        ),
      },
    })
    map.addLayer({
      id: "all-active-trails-layer",
      type: "line",
      source: "all-active-trails-combined",
      layout: {
        "line-join": "round",
        "line-cap": "round",
        "line-sort-key": ["get", "sortKey"],
      },
      paint: {
        "line-color": trailColorExpr($currentLook),
        "line-width": [
          "interpolate",
          ["exponential", 2],
          ["zoom"],
          10,
          ["*", ["get", "width"], ["^", 2, -6]],
          24,
          ["*", ["get", "width"], ["^", 2, 8]],
        ],
        "line-opacity": trailOpacity("work"),
      },
    })

    map.addLayer({
      id: "fields-outline",
      type: "line",
      source: "fields",
      paint: {
        "line-color": ["get", "outlineColor"],
        "line-opacity": $currentLook.fields.outlineOpacity,
        "line-width": $currentLook.fields.outlineWidth,
      },
    })
    map.addLayer({
      id: "fields-labels",
      type: "symbol",
      source: "fields",
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
        "text-size": 14,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 2,
      },
    })

    mapLoaded = true

    let first = true
    unsubscribeLook = currentLook.subscribe((look) => {
      if (first) {
        first = false
        return
      }
      applyFieldPaint(map, look)
      map.getSource("fields")?.setData(fieldsGeojson())
    })
  }

  onMount(() => {
    if (!dev) return
    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
    map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: CENTER,
      zoom: 14.6,
      accessToken: PUBLIC_MAPBOX_ACCESS_TOKEN,
    })
    map.on("load", setup)
    // Lets the screen-recording harness and manual checks reach the map.
    window.__agskanMap = map
  })

  onDestroy(() => {
    unsubscribeLook?.()
    try {
      map?.remove()
    } catch {
      /* already removed */
    }
  })
</script>

<svelte:head>
  <title>Map look lab</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if dev}
  <div class="lab-map" bind:this={container}></div>
  {#if map}
    <MapLook {map} {mapLoaded} {fields} />
  {/if}
  <MapLookPanel />
{/if}

<style>
  .lab-map {
    position: fixed;
    inset: 0;
    z-index: 10;
  }
</style>
