<!--
  src/routes/(marketing)/markersurvey/+page.svelte
  Public "Marker Survey" page: an interactive Mapbox map over an Australian
  farm showing a grid of every marker icon in one of 6 styles, plus a form
  for users to rank their top 3 styles, suggest new icons, and leave comments.

  Style grids reuse the exact same tint pipeline as the in-app Marker Test
  (markerTint.js) so the survey shows the real on-map look. Responses are
  inserted into the `marker_survey_responses` table (anon INSERT only).
-->
<script>
  import { onMount, onDestroy } from "svelte"
  import { Shuffle } from "lucide-svelte"
  // mapbox-gl ships no types; the rest of the app imports it untyped too.
  // @ts-ignore
  import * as mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import { supabase } from "$lib/supabaseClient"
  import {
    MARKER_COLORS,
    MARKER_COLOR_DEFAULT,
    TINT_MODES,
    TINT_MODE_DEFAULT,
    markerColor,
    isCustomSvgIcon,
  } from "$lib/components/map/markers/markerPalette"
  import {
    loadIconPaths,
    getIconBaseCanvas,
    tintMarkerCanvas,
  } from "$lib/components/map/markers/markerTint"
  import { getActiveMarkers, getAllMarkers } from "$lib/data/markerDefinitions"

  // Survey farm location — [lng, lat] over the Australian farm.
  const CENTER = [118.257866, -32.238795]
  const INITIAL_ZOOM = 15.5
  const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"

  // All atlas-styled markers — the family being phased out.
  const atlasMarkers = getAllMarkers().filter(
    (m) => m.class && m.class.startsWith("at-"),
  )

  // Random grid colours draw from the 7 normal colours only — black/white
  // would make low-contrast samples on the satellite map.
  const SURVEY_COLORS = MARKER_COLORS.filter(
    (c) =>
      c.key !== MARKER_COLOR_DEFAULT &&
      c.key !== "black" &&
      c.key !== "white" &&
      c.key !== "rainbow",
  )

  // ── Map + grid state ──
  /** @type {HTMLDivElement | undefined} */
  let mapContainer
  /** @type {any} */
  let map = null
  let mapReady = false
  let activeStyle = TINT_MODE_DEFAULT
  /** @type {string | null} */
  let gridError = null
  let gridCount = 0

  // Renderable icons (those with an image in icon-paths.json).
  /** @type {Array<{key: string, colorKey: string}>} */
  let renderableIcons = [] // [{key, colorKey}]
  /** @type {Map<string, Map<string, string>>} */
  const styleImages = new Map() // styleKey -> Map(iconKey -> registered image name)
  /** @type {Array<any>} */
  let gridFeatures = []

  // ── Form state ──
  let name = ""
  let top1 = ""
  let top2 = ""
  let top3 = ""
  let suggestions = ""
  let comments = ""
  let submitting = false
  /** @type {string | null} */
  let submitError = null
  let submitted = false

  // Resolve the iconClass string for a marker definition.
  /**
   * @param {{id: string, class?: string}} def
   * @returns {string}
   */
  function iconClassFor(def) {
    if (def.id === "default") return "default"
    if (def.class === "custom-svg") return `custom-svg-${def.id}`
    return def.class || "default"
  }

  /**
   * @param {HTMLCanvasElement} src
   * @returns {HTMLCanvasElement}
   */
  function cloneCanvas(src) {
    const c = document.createElement("canvas")
    c.width = src.width
    c.height = src.height
    const ctx = c.getContext("2d")
    if (ctx) ctx.drawImage(src, 0, 0)
    return c
  }

  /**
   * @param {string} name
   * @param {HTMLCanvasElement} canvas
   */
  function registerCanvas(name, canvas) {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    map.addImage(name, {
      width: canvas.width,
      height: canvas.height,
      data: imageData.data,
    })
  }

  // Build the list of icons the grid will show, each with a fixed random
  // rainbow colour (never default) so style switches are a fair comparison.
  async function collectRenderableIcons() {
    /** @type {Record<string, string>} */
    let iconPaths = {}
    try {
      iconPaths = await loadIconPaths()
    } catch (e) {
      console.warn("markersurvey: could not load icon-paths.json", e)
    }
    renderableIcons = getActiveMarkers()
      .filter((def) => {
        const cls = iconClassFor(def)
        return cls === "default" || !!iconPaths[cls]
      })
      .map((def) => {
        const cls = iconClassFor(def)
        const colorDef =
          SURVEY_COLORS[Math.floor(Math.random() * SURVEY_COLORS.length)]
        return {
          key: cls,
          colorKey: colorDef?.key || MARKER_COLOR_DEFAULT,
        }
      })
  }

  // Register (and cache) the map images for one style — every grid icon
  // tinted in that style. The default pin is registered untinted once.
  /**
   * @param {string} styleKey
   * @returns {Promise<Map<string, string>>}
   */
  async function prepareStyleImages(styleKey) {
    if (styleImages.has(styleKey)) {
      return /** @type {Map<string, string>} */ (styleImages.get(styleKey))
    }
    /** @type {Map<string, string>} */
    const images = new Map()
    for (const item of renderableIcons) {
      const { key, colorKey } = item
      // Custom SVG icons keep their glyph's baked-in colours but their
      // circle/disc still follows the style (name gets a "-g" suffix).
      const keepGlyph = isCustomSvgIcon(key)
      // The default Mapbox pin uses the dedicated "default-pin" tint (body
      // recolours, white circle stays white) instead of the style modes.
      const tintMode = key === "default" ? "default-pin" : styleKey
      const name = `survey-${key}-${tintMode}${keepGlyph ? "-g" : ""}`
      try {
        if (!map.hasImage(name)) {
          const base = await getIconBaseCanvas(key)
          if (!base) continue
          const copy = cloneCanvas(base)
          tintMarkerCanvas(copy, markerColor(colorKey), tintMode, {
            keepGlyphOriginal: keepGlyph,
          })
          registerCanvas(name, copy)
        }
        images.set(key, name)
      } catch (e) {
        console.warn(`markersurvey: could not prepare icon ${key}:`, e)
      }
    }
    styleImages.set(styleKey, images)
    return images
  }

  // Build the grid of point features anchored around the farm centre.
  function buildGridFeatures() {
    const perRow = 8
    const spacing = 70
    const centerPx = map.project(CENTER)
    return renderableIcons.map((item, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const px = {
        x: centerPx.x + (col - (perRow - 1) / 2) * spacing,
        y:
          centerPx.y +
          (row - Math.ceil(renderableIcons.length / perRow) / 2 + 0.5) *
            spacing,
      }
      const ll = map.unproject(px)
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [ll.lng, ll.lat] },
        properties: { iconKey: item.key, "icon-image": "" },
      }
    })
  }

  /**
   * @param {string} styleKey
   */
  async function applyStyle(styleKey) {
    activeStyle = styleKey
    if (!mapReady || !map || !map.getSource("survey-markers")) return
    try {
      const images = await prepareStyleImages(styleKey)
      const features = gridFeatures.map((f) => {
        const iconName = images.get(f.properties.iconKey) || "survey-default"
        return {
          type: "Feature",
          geometry: f.geometry,
          properties: { iconKey: f.properties.iconKey, "icon-image": iconName },
        }
      })
      map.getSource("survey-markers").setData({
        type: "FeatureCollection",
        features,
      })
    } catch (e) {
      console.warn("markersurvey: applyStyle failed:", e)
    }
  }

  let setupStarted = false
  /** @type {any} */
  let setupPoll = null

  let randomizedFlash = false
  /** @type {any} */
  let randomizeFlashTimer = null

  // Re-shuffle every grid icon's colour (keeping the current style) and
  // rebuild the tinted images so the grid uses the new colours.
  async function randomizeColors() {
    if (!mapReady || !map || !map.getSource("survey-markers")) return
    // 1) New random rainbow colour for every icon (never default).
    for (const item of renderableIcons) {
      const colorDef =
        SURVEY_COLORS[Math.floor(Math.random() * SURVEY_COLORS.length)]
      item.colorKey = colorDef?.key || MARKER_COLOR_DEFAULT
    }
    // 2) Drop all cached tinted images (they were tinted with the old
    //    colours). Clear the source data first so no layer references them
    //    — mapbox-gl's removeImage rejects images still in use.
    map.getSource("survey-markers").setData({
      type: "FeatureCollection",
      features: [],
    })
    for (const styleKey of styleImages.keys()) {
      const images = styleImages.get(styleKey)
      if (!images) continue
      for (const name of images.values()) {
        if (name && name !== "survey-default" && map.hasImage(name)) {
          try {
            map.removeImage(name)
          } catch (e) {
            /* already removed */
          }
        }
      }
    }
    styleImages.clear()
    // 3) Rebuild the current style with the new colours.
    await applyStyle(activeStyle)
    // 4) Brief visual feedback on the button.
    randomizedFlash = true
    if (randomizeFlashTimer) clearTimeout(randomizeFlashTimer)
    randomizeFlashTimer = setTimeout(() => {
      randomizedFlash = false
    }, 1500)
  }

  // Register the source + layer, build the grid, and show the first style.
  async function runMapSetup() {
    if (setupStarted) return
    setupStarted = true
    if (setupPoll) {
      clearInterval(setupPoll)
      setupPoll = null
    }
    try {
      mapReady = true
      await collectRenderableIcons()
      if (renderableIcons.length === 0) {
        gridError = "No marker icons could be loaded."
        return
      }

      map.addSource("survey-markers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      map.addLayer({
        id: "survey-markers-layer",
        type: "symbol",
        source: "survey-markers",
        layout: {
          "icon-image": ["get", "icon-image"],
          "icon-size": 0.35,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      })

      gridFeatures = buildGridFeatures()
      gridCount = gridFeatures.length
      await applyStyle(activeStyle)
    } catch (e) {
      console.error("markersurvey: map setup failed", e)
      gridError = "The map failed to load. Please refresh and try again."
    }
  }

  // Run setup when the style is usable. Prefer the `load` event, but fall
  // back to polling `isStyleLoaded()` — some mapbox-gl builds leave the
  // internal dirty flags set and never fire `load` even though the style
  // (and tiles) are fully usable.
  function setupMapWhenReady() {
    if (map.isStyleLoaded()) {
      runMapSetup()
      return
    }
    map.once("load", runMapSetup)
    setupPoll = setInterval(() => {
      if (map.isStyleLoaded()) runMapSetup()
    }, 300)
  }

  async function initMap() {
    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
    map = new mapboxgl.Map({
      container: mapContainer,
      style: SATELLITE_STYLE,
      center: CENTER,
      zoom: INITIAL_ZOOM,
      // Pass the token explicitly — with `import * as mapboxgl` on the CJS
      // bundle the namespace assignment above doesn't reach the internal
      // exports that the Map constructor reads.
      accessToken: PUBLIC_MAPBOX_ACCESS_TOKEN,
      attributionControl: true,
      doubleClickZoom: true,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }))

    // Cap how far users can zoom out so the survey stays farm-focused.
    map.setMinZoom(3)

    setupMapWhenReady()
  }

  onMount(() => {
    initMap()
  })

  onDestroy(() => {
    if (setupPoll) {
      clearInterval(setupPoll)
      setupPoll = null
    }
    if (randomizeFlashTimer) {
      clearTimeout(randomizeFlashTimer)
      randomizeFlashTimer = null
    }
    if (map) {
      try {
        map.remove()
      } catch (e) {
        /* noop */
      }
      map = null
    }
  })

  // ── Form ──
  /**
   * @param {string} key
   * @returns {string}
   */
  function styleLabel(key) {
    return TINT_MODES.find((m) => m.key === key)?.label || key
  }

  async function submitSurvey() {
    submitError = null
    if (!name.trim()) {
      submitError = "Please enter your name."
      return
    }
    const picks = [top1, top2, top3].filter(Boolean)
    if (picks.length < 3) {
      submitError = "Please choose your top 3 styles (1st, 2nd and 3rd)."
      return
    }
    if (new Set(picks).size !== picks.length) {
      submitError = "Your top 3 picks must all be different."
      return
    }

    submitting = true
    try {
      const { error } = await supabase.from("marker_survey_responses").insert({
        name: name.trim(),
        top1_style: top1,
        top2_style: top2,
        top3_style: top3,
        active_style: activeStyle,
        icon_suggestions: suggestions.trim() || null,
        comments: comments.trim() || null,
      })
      if (error) throw error
      submitted = true
    } catch (e) {
      console.error("markersurvey: submit failed", e)
      submitError =
        "Something went wrong submitting your response. Please try again."
    } finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>Marker Survey — AgSKAN</title>
  <meta
    name="description"
    content="Help us pick the marker styles for the next harvest — explore the styles on the map and tell us your top 3."
  />
</svelte:head>

<div class="survey-wrap">
  <div class="survey-hero">
    <h1>Help us pick the harvest markers</h1>
    <p>
      We're redesigning the on-farm markers — and adding
      <strong>colour</strong>, which our markers have never had before. We'd
      love your opinion on the new look. Below is a live map of a real farm with
      every marker icon on display. Use the buttons to switch between the 6
      styles, and zoom or pan around to see how each style looks up close and
      from a distance.
    </p>
    <p class="survey-sub">
      Then tell us your <strong>top 3 styles</strong>, suggest any icons you'd
      love to see, and leave any comments for the harvest.
    </p>
  </div>

  <div class="survey-map-card">
    <div class="survey-stylebar">
      <span class="survey-stylebar-label">Icon style</span>
      <div class="survey-stylebtns">
        {#each TINT_MODES as m}
          <button
            class="survey-stylebtn"
            class:active={activeStyle === m.key}
            on:click={() => applyStyle(m.key)}
          >
            {m.label}
          </button>
        {/each}
      </div>
      <button
        class="survey-randomize"
        on:click={randomizeColors}
        disabled={!mapReady}
        title="Shuffle the marker colours"
      >
        <Shuffle size={14} />
        <span>{randomizedFlash ? "Randomized!" : "Randomize colours"}</span>
      </button>
    </div>

    <div class="survey-map" bind:this={mapContainer}>
      {#if gridError}
        <div class="survey-map-overlay error">{gridError}</div>
      {:else if !mapReady}
        <div class="survey-map-overlay">Loading map…</div>
      {:else}
        <div class="survey-map-chip">
          Showing {gridCount} markers · {styleLabel(activeStyle)}
        </div>
      {/if}
    </div>
    <p class="survey-map-hint">
      Scroll to zoom, drag to pan. Each marker is a real icon you can place on
      your own map.
    </p>
  </div>

  <div class="survey-card survey-phasing">
    <h2>Markers we're phasing out</h2>
    <p class="survey-card-desc">
      We're phasing these out because of their <strong>thin line style</strong>
      — not because the concepts aren't useful. A lot of concepts here will get a
      replacement in a bold, full-fill style that matches our new coloured markers.
      They'll still be available on your farm for a while, but soon new ones won't
      be able to be selected.
    </p>
    <div class="survey-atlas-grid">
      {#each atlasMarkers as m}
        <div class="survey-atlas-item">
          <i class={m.class}></i>
          <span>{m.name}</span>
        </div>
      {/each}
    </div>
  </div>

  <form class="survey-form" on:submit|preventDefault={submitSurvey}>
    <div class="survey-card">
      <h2>Your top 3 styles</h2>
      <p class="survey-card-desc">
        Order your three favourites — 1st is your most preferred.
      </p>
      <div class="survey-picks">
        <label class="survey-field">
          <span>1st choice</span>
          <select bind:value={top1}>
            <option value="">Choose…</option>
            {#each TINT_MODES as m}
              <option value={m.key}>{m.label}</option>
            {/each}
          </select>
        </label>
        <label class="survey-field">
          <span>2nd choice</span>
          <select bind:value={top2}>
            <option value="">Choose…</option>
            {#each TINT_MODES as m}
              <option value={m.key}>{m.label}</option>
            {/each}
          </select>
        </label>
        <label class="survey-field">
          <span>3rd choice</span>
          <select bind:value={top3}>
            <option value="">Choose…</option>
            {#each TINT_MODES as m}
              <option value={m.key}>{m.label}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>

    <div class="survey-card">
      <h2>New icon suggestions</h2>
      <p class="survey-card-desc">
        Any markers or icons you'd love to see added? (e.g. a windmill, a dam, a
        specific crop…)
      </p>
      <textarea
        class="survey-textarea"
        bind:value={suggestions}
        rows="3"
        placeholder="I'd like to see…"
      ></textarea>
    </div>

    <div class="survey-card">
      <h2>Comments for the harvest</h2>
      <p class="survey-card-desc">
        Anything else — new features, tweaks, or things you'd like to see for
        this harvest.
      </p>
      <textarea
        class="survey-textarea"
        bind:value={comments}
        rows="3"
        placeholder="Your comments…"
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

      <button class="survey-submit" type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit"}
      </button>

      {#if submitted}
        <div class="survey-thanks">
          <strong>Thanks, {name.trim()}! 🙌</strong>
          <span>
            Your feedback has been recorded — it'll help shape the harvest
            markers.
          </span>
        </div>
      {/if}
    </div>
  </form>
</div>

<style>
  .survey-wrap {
    max-width: 860px;
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
  .survey-hero p {
    font-size: 15px;
    line-height: 1.6;
    color: #475569;
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
  .survey-stylebar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .survey-stylebar-label {
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .survey-stylebtns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .survey-stylebtn {
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #334155;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .survey-stylebtn:hover {
    border-color: #60a5fa;
    color: #2563eb;
  }
  .survey-stylebtn.active {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }

  .survey-randomize {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px dashed #94a3b8;
    background: #f8fafc;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .survey-randomize:hover:not(:disabled) {
    border-color: #16a34a;
    color: #15803d;
    background: #f0fdf4;
  }
  .survey-randomize:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .survey-map {
    position: relative;
    width: 100%;
    height: 520px;
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
    background: rgba(15, 23, 42, 0.78);
    color: #e2e8f0;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 999px;
    pointer-events: none;
    backdrop-filter: blur(4px);
  }
  .survey-map-hint {
    font-size: 12px;
    color: #94a3b8;
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
    margin: 0 0 6px;
  }
  .survey-card-desc {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 14px;
  }

  .survey-atlas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 10px;
  }
  .survey-atlas-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 6px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
  }
  .survey-atlas-item i {
    font-size: 28px;
    color: #334155;
    line-height: 1;
  }
  .survey-atlas-item span {
    font-size: 11px;
    color: #64748b;
    text-align: center;
    line-height: 1.2;
  }

  .survey-picks {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
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
  .survey-field select,
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
  .survey-field select:focus,
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
</style>
