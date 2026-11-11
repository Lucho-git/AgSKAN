<!--
  src/routes/(marketing)/mapsurvey/+page.svelte
  Public "Map Style Survey" page: a live map of a demo farm (real paddocks,
  trails and markers from farms that agreed to it, with every name removed).
  Farmers make two separate choices and can mix them freely on the map:

    - the MAP style  (satellite treatment + paddocks)  shown as Map 1…4
    - the TRAIL colours                                 shown as Trails A…C

  Both come from $lib/utils/mapLook.ts and are drawn with the same apply
  functions as the real map viewer, so what is voted on is what would ship.
  Numbers and letters are in a fixed scrambled order so nobody can tell which
  is today's map. Responses go to `map_look_survey_responses` (anon INSERT
  only), stored by style key.

  Demo data lives in static/mapsurvey-data/farm-*.json and is built by
  scripts/build-map-survey-farms.mjs.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  // @ts-expect-error -- no type declarations for mapbox-gl 1.x
  import mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import { supabase } from "$lib/supabaseClient"
  import {
    composeLook,
    fieldColors,
    resolveTrailColor,
    type PresetName,
    type TrailPaletteName,
  } from "$lib/utils/mapLook"
  import {
    applyBasemapLabels,
    applyBasemapLook,
    applyFieldPaint,
    applyOutsideLook,
    applyTrailLook,
    type MapboxMap,
  } from "$lib/utils/mapLookApply"
  import { calculateZoomDependentWidth } from "$lib/utils/trailGeometry"
  import {
    TINT_MODE_DEFAULT,
    isNoBackgroundIcon,
    markerColor,
    styleDefaultColor,
  } from "$lib/components/map/markers/markerPalette"
  import {
    getIconBaseCanvas,
    tintMarkerCanvas,
  } from "$lib/components/map/markers/markerTint"
  import {
    MARKER_ICON_PIXEL_RATIO,
    isSvgRenderedIcon,
    renderSvgMarkerImageData,
  } from "$lib/components/map/markers/markerSvgRenderer"

  // Fixed, scrambled labels: neither list hints at which option is today's
  // map, and "Map 3" / "Trails A" mean the same thing in every comment.
  const MAPS: { label: string; key: PresetName }[] = [
    { label: "1", key: "muted" },
    { label: "2", key: "classic" },
    { label: "3", key: "spotlight" },
    { label: "4", key: "mono" },
  ]
  const TRAILS: { label: string; key: TrailPaletteName }[] = [
    { label: "A", key: "soft" },
    { label: "B", key: "classic" },
    { label: "C", key: "earth" },
  ]
  const FARMS = ["a", "b", "c", "d", "e"]

  type DemoFarm = {
    center: [number, number]
    fields: {
      name: string
      color: string
      area: number
      boundary: { type: string; coordinates: unknown }
    }[]
    trails: {
      color: string
      width: number
      geometry: { type: string; coordinates: unknown }
    }[]
    markers: { icon: string; color: string; at: [number, number] }[]
  }

  let mapContainer: HTMLDivElement
  let map: MapboxMap | null = null
  let mapReady = false
  let mapError: string | null = null
  let farmLoading = false

  let mapChoice: PresetName = MAPS[0].key
  let trailChoice: TrailPaletteName = TRAILS[0].key
  let farmIndex = 0
  let farm: DemoFarm | null = null
  let trailLayerIds: string[] = []
  const farmCache = new Map<string, DemoFarm>()
  let viewedMaps = new Set<string>([mapChoice])
  let viewedTrails = new Set<string>([trailChoice])

  $: look = composeLook(mapChoice, trailChoice)
  $: isCurrent = mapChoice === "classic" && trailChoice === "classic"
  $: mapLabel = MAPS.find((m) => m.key === mapChoice)?.label ?? ""
  $: trailLabel = TRAILS.find((t) => t.key === trailChoice)?.label ?? ""

  // ── Form state ──
  let name = ""
  // The vote. Picking an answer also shows it on the map.
  let mapVote: PresetName | "" = ""
  let trailVote: TrailPaletteName | "" = ""
  let comments = ""
  let submitting = false
  let submitError: string | null = null
  let submitted = false

  // ── Drawing ──

  function fieldsGeojson(f: DemoFarm) {
    return {
      type: "FeatureCollection",
      features: f.fields.map((field, index) => ({
        type: "Feature",
        geometry: field.boundary,
        properties: {
          id: index,
          name: field.name,
          ...fieldColors(field.color, index, look),
        },
      })),
    }
  }

  function removeFarmLayers() {
    if (!map) return
    const ids = [
      "survey-markers",
      "fields-labels",
      "fields-outline",
      ...trailLayerIds,
      "fields-fill",
    ]
    for (const id of ids) if (map.getLayer(id)) map.removeLayer(id)
    for (const id of trailLayerIds) {
      const source = id.replace("trail-layer-", "trail-source-")
      if (map.getSource(source)) map.removeSource(source)
    }
    for (const id of ["survey-markers", "fields"])
      if (map.getSource(id)) map.removeSource(id)
    trailLayerIds = []
  }

  /** Register one tinted marker image (same pipeline as the real map) and return its name. */
  async function markerImage(
    icon: string,
    colorKey: string,
  ): Promise<string | null> {
    const key = icon || "default"
    const tintMode =
      key === "default"
        ? "default-pin"
        : isNoBackgroundIcon(key)
          ? "icon-only"
          : TINT_MODE_DEFAULT
    const color =
      colorKey && colorKey !== "default"
        ? colorKey
        : styleDefaultColor(TINT_MODE_DEFAULT)
    const imageName = `survey-${key}-${tintMode}-${color}`
    if (map.hasImage(imageName)) return imageName
    try {
      if (key === "default" || !isSvgRenderedIcon(key)) {
        const base = await getIconBaseCanvas(key)
        if (!base) return null
        const canvas = document.createElement("canvas")
        canvas.width = base.width
        canvas.height = base.height
        const ctx = canvas.getContext("2d")
        if (!ctx) return null
        ctx.drawImage(base, 0, 0)
        tintMarkerCanvas(canvas, markerColor(color, "default-pin"), tintMode)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
        map.addImage(imageName, {
          width: canvas.width,
          height: canvas.height,
          data: data.data,
        })
      } else {
        const image = await renderSvgMarkerImageData(key, color, tintMode, 0.3)
        map.addImage(imageName, image, { pixelRatio: MARKER_ICON_PIXEL_RATIO })
      }
      return imageName
    } catch (e) {
      console.warn(`mapsurvey: could not prepare marker ${key}`, e)
      return null
    }
  }

  async function drawFarm(f: DemoFarm) {
    removeFarmLayers()

    map.addSource("fields", { type: "geojson", data: fieldsGeojson(f) })
    map.addLayer({
      id: "fields-fill",
      type: "fill",
      source: "fields",
      paint: {
        "fill-color": ["get", "fillColor"],
        "fill-opacity": look.fields.fillOpacity,
      },
    })

    // Oldest first, so the newest trail is drawn on top like the real map.
    const ids: string[] = []
    f.trails
      .slice()
      .reverse()
      .forEach((trail, i) => {
        const sourceId = `trail-source-${i}`
        const layerId = `trail-layer-${i}`
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: trail.geometry },
        })
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          metadata: {
            agskanTrailColor: trail.color || "Red",
            agskanTrailRole: "work",
          },
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": resolveTrailColor(trail.color, look),
            "line-width": calculateZoomDependentWidth(trail.width || 12, 1),
            "line-opacity": look.trails.opacity,
          },
        })
        ids.push(layerId)
      })
    trailLayerIds = ids

    map.addLayer({
      id: "fields-outline",
      type: "line",
      source: "fields",
      paint: {
        "line-color": ["get", "outlineColor"],
        "line-opacity": look.fields.outlineOpacity,
        "line-width": look.fields.outlineWidth,
      },
    })
    map.addLayer({
      id: "fields-labels",
      type: "symbol",
      source: "fields",
      minzoom: 12.5,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 10, 16, 16],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 2,
      },
    })

    const markerFeatures = []
    for (const marker of f.markers) {
      const image = await markerImage(marker.icon, marker.color)
      if (!image) continue
      markerFeatures.push({
        type: "Feature",
        properties: { image },
        geometry: { type: "Point", coordinates: marker.at },
      })
    }
    // The farm may have been switched while images were rendering.
    if (farm !== f || !map) return
    map.addSource("survey-markers", {
      type: "geojson",
      data: { type: "FeatureCollection", features: markerFeatures },
    })
    map.addLayer({
      id: "survey-markers",
      type: "symbol",
      source: "survey-markers",
      layout: {
        "icon-image": ["get", "image"],
        // Same size as the real map's marker layer.
        "icon-size": 0.35,
        "icon-allow-overlap": true,
      },
    })
  }

  function applyLook() {
    if (!map || !mapReady) return
    applyBasemapLook(map, look)
    applyBasemapLabels(map, look)
    applyOutsideLook(map, look, farm?.fields ?? [])
    applyFieldPaint(map, look)
    applyTrailLook(map, look)
    if (farm) map.getSource("fields")?.setData(fieldsGeojson(farm))
  }

  function fitFarm(f: DemoFarm) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const walk = (c: unknown) => {
      if (!Array.isArray(c)) return
      if (typeof c[0] === "number") {
        minX = Math.min(minX, c[0])
        maxX = Math.max(maxX, c[0])
        minY = Math.min(minY, c[1])
        maxY = Math.max(maxY, c[1])
      } else c.forEach(walk)
    }
    f.fields.forEach((field) => walk(field.boundary.coordinates))
    if (!Number.isFinite(minX)) {
      map.jumpTo({ center: f.center, zoom: 13.5 })
      return
    }
    map.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 30, duration: 0 },
    )
  }

  async function loadFarm(index: number) {
    if (!map || !mapReady) return
    farmLoading = true
    try {
      const key = FARMS[index]
      let data = farmCache.get(key)
      if (!data) {
        const response = await fetch(`/mapsurvey-data/farm-${key}.json`)
        if (!response.ok) throw new Error(`farm ${key}: ${response.status}`)
        data = (await response.json()) as DemoFarm
        farmCache.set(key, data)
      }
      farm = data
      farmIndex = index
      fitFarm(data)
      await drawFarm(data)
      applyLook()
    } catch (e) {
      console.error("mapsurvey: could not load demo farm", e)
      mapError = "Couldn't load the demo farm. Please refresh and try again."
    } finally {
      farmLoading = false
    }
  }

  function showMap(key: PresetName) {
    mapChoice = key
    viewedMaps = new Set([...viewedMaps, key])
  }

  function showTrails(key: TrailPaletteName) {
    trailChoice = key
    viewedTrails = new Set([...viewedTrails, key])
  }

  function voteMap(key: PresetName) {
    mapVote = key
    showMap(key)
  }

  function voteTrails(key: TrailPaletteName) {
    trailVote = key
    showTrails(key)
  }

  /** Show the map exactly as it is in the app today: no changes to map or trails. */
  function showCurrent() {
    showMap("classic")
    showTrails("classic")
  }

  // Repaint whenever the chosen style changes.
  $: if (mapReady) {
    look
    applyLook()
  }

  /** Town and road names would give the farm's location away; the survey never shows them. */
  function hidePlaceLabels() {
    for (const layer of map.getStyle().layers) {
      if (layer.type === "symbol" && layer.source === "composite") {
        map.setLayoutProperty(layer.id, "visibility", "none")
      }
    }
  }

  onMount(() => {
    try {
      mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
      map = new mapboxgl.Map({
        container: mapContainer,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        // Start over the wheatbelt, close in, so few tiles are needed before
        // the first farm (which sets its own bounds) appears.
        center: [118.2, -31.9],
        zoom: 11,
        accessToken: PUBLIC_MAPBOX_ACCESS_TOKEN,
        attributionControl: true,
      })
      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "bottom-right",
      )
      // "style.load", not "load": the farm can be drawn as soon as the style
      // is ready, without waiting for every satellite tile to arrive.
      map.once("style.load", () => {
        hidePlaceLabels()
        mapReady = true
        loadFarm(0)
      })
      map.on("error", (e: { error?: { message?: string } }) => {
        console.warn("mapsurvey: map error", e?.error?.message)
      })
    } catch (e) {
      console.error("mapsurvey: map failed to start", e)
      mapError = "The map couldn't start on this device."
    }
  })

  onDestroy(() => {
    try {
      map?.remove()
    } catch {
      /* already removed */
    }
  })

  // ── Survey ──

  async function submitSurvey() {
    submitError = null
    if (!name.trim()) {
      submitError = "Please enter your name."
      return
    }
    if (!mapVote || !trailVote) {
      submitError = "Please pick the map and the trail colours you like best."
      return
    }

    submitting = true
    try {
      const { error } = await supabase
        .from("map_look_survey_responses")
        .insert({
          name: name.trim().slice(0, 100),
          map_style: mapVote,
          trail_style: trailVote,
          viewed_looks: [...viewedMaps],
          viewed_trail_styles: [...viewedTrails],
          demo_farm: `farm-${FARMS[farmIndex]}`,
          comments: comments.trim().slice(0, 4000) || null,
        })
      if (error) throw error
      submitted = true
    } catch (e) {
      console.error("mapsurvey: submit failed", e)
      submitError =
        "Something went wrong submitting your response. Please try again."
    } finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>Map Style Survey — AgSKAN</title>
  <meta
    name="description"
    content="Help us choose the look of the AgSKAN map — flick through the styles on a demo farm and tell us your favourites."
  />
</svelte:head>

<div class="survey-wrap">
  <div class="survey-hero">
    <h1>Help us choose the look of the map</h1>
    <p>
      We're refreshing the colours of the AgSKAN map. There are two things to
      choose, and you can mix them however you like on the demo farm below (the <strong
        >Existing settings</strong
      >
      button shows how it looks today): the <strong>map</strong>
      (the satellite view and your paddocks) and the
      <strong>trail colours</strong> your machines leave.
    </p>
    <p class="survey-sub">
      Try each one, zoom in on where trails overlap, then tell us which map and
      which trail colours you'd want to look at all day. It takes about a
      minute.
    </p>
  </div>

  <div class="survey-map-card">
    <div class="survey-pickers">
      <div class="survey-stylebar">
        <span class="survey-stylebar-label">Map</span>
        <div class="survey-stylebtns">
          {#each MAPS as option (option.key)}
            <button
              class="survey-stylebtn"
              class:active={mapChoice === option.key}
              class:seen={viewedMaps.has(option.key) &&
                mapChoice !== option.key}
              on:click={() => showMap(option.key)}
              aria-label={`Map ${option.label}`}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>
      <div class="survey-stylebar">
        <span class="survey-stylebar-label">Trails</span>
        <div class="survey-stylebtns">
          {#each TRAILS as option (option.key)}
            <button
              class="survey-stylebtn"
              class:active={trailChoice === option.key}
              class:seen={viewedTrails.has(option.key) &&
                trailChoice !== option.key}
              on:click={() => showTrails(option.key)}
              aria-label={`Trails ${option.label}`}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>
      <button
        class="survey-current"
        class:active={isCurrent}
        on:click={showCurrent}
        title="Show the map with its existing settings, as it is in the app today"
      >
        Existing settings
      </button>
    </div>

    <div class="survey-map" bind:this={mapContainer}>
      {#if mapError}
        <div class="survey-map-overlay error">{mapError}</div>
      {:else if !mapReady || (farmLoading && !farm)}
        <div class="survey-map-overlay">Loading map…</div>
      {:else}
        <div class="survey-map-chip">
          Map {mapLabel} · Trails {trailLabel}{isCurrent
            ? " · existing settings"
            : ""}
        </div>
      {/if}
    </div>

    <div class="survey-farmbar">
      <span class="survey-stylebar-label">Demo farm</span>
      <div class="survey-stylebtns">
        {#each FARMS as farmKey, i (farmKey)}
          <button
            class="survey-farmbtn"
            class:active={farmIndex === i}
            disabled={!mapReady || farmLoading}
            on:click={() => loadFarm(i)}
          >
            Farm {i + 1}
          </button>
        {/each}
      </div>
    </div>
    <p class="survey-map-hint">
      Scroll or pinch to zoom, drag to pan. The farms are real paddocks and
      trails with the names removed.
    </p>
  </div>

  <form class="survey-form" on:submit|preventDefault={submitSurvey}>
    <div class="survey-card">
      <h2>Which map do you like best?</h2>
      <p class="survey-card-desc">
        The satellite view and paddocks. Tap one to see it on the map again.
      </p>
      <div class="survey-choices">
        {#each MAPS as option (option.key)}
          <button
            type="button"
            class="survey-choice"
            class:chosen={mapVote === option.key}
            aria-pressed={mapVote === option.key}
            on:click={() => voteMap(option.key)}
          >
            Map {option.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="survey-card">
      <h2>Which trail colours do you like best?</h2>
      <p class="survey-card-desc">
        Think about telling machines apart and seeing where passes overlap.
      </p>
      <div class="survey-choices">
        {#each TRAILS as option (option.key)}
          <button
            type="button"
            class="survey-choice"
            class:chosen={trailVote === option.key}
            aria-pressed={trailVote === option.key}
            on:click={() => voteTrails(option.key)}
          >
            Trails {option.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="survey-card">
      <h2>Comments</h2>
      <p class="survey-card-desc">
        Optional. Anything you liked or disliked, or that was hard to see?
      </p>
      <textarea
        class="survey-textarea"
        bind:value={comments}
        rows="4"
        maxlength="4000"
        placeholder="e.g. Map 4 is easiest to read, but Trails C are hard to tell apart…"
      ></textarea>
    </div>

    <div class="survey-submit-card">
      <label class="survey-field survey-name-field">
        <span>Your name</span>
        <input
          type="text"
          bind:value={name}
          placeholder="e.g. Jane Farmer"
          maxlength="100"
        />
      </label>

      {#if submitError}
        <p class="survey-error">{submitError}</p>
      {/if}

      <button
        class="survey-submit"
        type="submit"
        disabled={submitting || submitted}
      >
        {submitting ? "Submitting…" : submitted ? "Submitted" : "Submit"}
      </button>

      {#if submitted}
        <div class="survey-thanks">
          <strong>Thanks, {name.trim()}!</strong>
          <span>
            Your vote is recorded. It'll help decide how the map looks.
          </span>
        </div>
      {/if}
    </div>
  </form>
</div>

<style>
  .survey-wrap {
    max-width: 920px;
    margin: 0 auto;
    padding: 40px 20px 80px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .survey-hero h1 {
    font-size: 30px;
    font-weight: 700;
    margin: 0 0 12px;
  }
  /* Inherit the site theme's text colour so the intro reads in light and dark mode. */
  .survey-hero p {
    font-size: 15px;
    line-height: 1.6;
    opacity: 0.8;
    margin: 0 0 8px;
  }
  .survey-hero .survey-sub {
    font-size: 14px;
  }

  .survey-map-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .survey-stylebar,
  .survey-farmbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .survey-stylebar-label {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .survey-stylebtns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .survey-stylebtn {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #334155;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .survey-stylebtn.seen {
    background: #f1f5f9;
    color: #64748b;
  }
  .survey-farmbtn {
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #334155;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .survey-farmbtn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .survey-stylebtn:hover,
  .survey-farmbtn:hover:not(:disabled) {
    border-color: #60a5fa;
    color: #2563eb;
  }
  .survey-stylebtn.active,
  .survey-farmbtn.active {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }

  .survey-map {
    position: relative;
    width: 100%;
    height: 560px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  }
  .survey-map :global(.mapboxgl-canvas) {
    display: block;
  }
  .survey-map-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.85);
    color: #334155;
    font-size: 14px;
    z-index: 5;
  }
  .survey-map-overlay.error {
    color: #b91c1c;
  }
  .survey-map-chip {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 4;
    background: rgba(15, 23, 42, 0.82);
    color: #f1f5f9;
    font-size: 14px;
    font-weight: 700;
    padding: 7px 14px;
    border-radius: 999px;
    pointer-events: none;
  }
  .survey-map-hint {
    font-size: 12px;
    opacity: 0.65;
    margin: 0;
  }

  .survey-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .survey-card,
  .survey-submit-card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 22px;
  }
  .survey-card h2 {
    font-size: 17px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 6px;
  }
  .survey-card-desc {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 14px;
  }
  .survey-pickers {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 28px;
  }
  .survey-current {
    margin-left: auto;
    padding: 9px 16px;
    border-radius: 999px;
    border: 1px dashed #94a3b8;
    background: #f8fafc;
    color: #334155;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .survey-current:hover {
    border-color: #60a5fa;
    color: #2563eb;
  }
  .survey-current.active {
    border-style: solid;
    border-color: #0f172a;
    background: #0f172a;
    color: #fff;
  }
  .survey-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .survey-choice {
    flex: 1;
    min-width: 110px;
    padding: 14px 10px;
    border-radius: 10px;
    border: 2px solid #cbd5e1;
    background: #fff;
    color: #334155;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .survey-choice:hover {
    border-color: #60a5fa;
  }
  .survey-choice.chosen {
    border-color: #16a34a;
    background: #f0fdf4;
    color: #166534;
  }
  .survey-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: #334155;
    flex: 1;
    min-width: 150px;
  }
  .survey-field input,
  .survey-textarea {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    padding: 10px 12px;
    font-size: 14px;
    color: #0f172a;
    background: #fff;
    font-family: inherit;
  }
  .survey-field input:focus,
  .survey-textarea:focus {
    outline: none;
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
  }
  .survey-textarea {
    resize: vertical;
  }
  .survey-name-field {
    max-width: 320px;
  }
  .survey-submit-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .survey-error {
    color: #b91c1c;
    font-size: 13px;
    margin: 0;
  }
  .survey-submit {
    align-self: flex-start;
    background: #16a34a;
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 12px 28px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .survey-submit:hover:not(:disabled) {
    background: #15803d;
  }
  .survey-submit:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .survey-thanks {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 14px;
  }
  .survey-thanks span {
    font-weight: 400;
  }

  @media (max-width: 640px) {
    .survey-wrap {
      padding: 24px 14px 56px;
      gap: 20px;
    }
    .survey-hero h1 {
      font-size: 22px;
    }
    .survey-hero p {
      font-size: 14px;
    }
    .survey-map {
      height: 62vh;
      min-height: 380px;
    }
    .survey-stylebtn {
      width: 36px;
      height: 36px;
    }
    .survey-card,
    .survey-submit-card {
      padding: 16px;
    }
    .survey-field {
      min-width: 100%;
    }
    .survey-submit {
      align-self: stretch;
    }
  }
</style>
