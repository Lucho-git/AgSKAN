<!-- src/lib/components/map/overlays/PowerLinesOverlay.svelte -->
<!-- Electricity network overlay built from THREE sources:

  1. NATIONAL lines — local bundled GeoJSON (static/powerLines/powerlines.geojson,
     Geoscience Australia). Rendered for every state EXCEPT WA, which is covered
     far more completely by the WA dataset below (so lines don't double-draw).
  2. WA distribution LINES — Mapbox tileset luchodore.pit699 (© Western Power
     WP-031), source-layer `powerlines`.
  3. WA distribution POLES — Mapbox tileset luchodore.rzpget (© Western Power
     WP-029), source-layer `poles`. Street-lighting poles (METAL_LIGHTING) are
     excluded — they aren't network support poles.

  Styling: every line is flat yellow (#facc15) on a dark casing; poles are small
  black lightning-bolt symbols (runtime-generated sprite).

  FIELD-BOUNDARY FILTER — by default ("Show Outside Fields" OFF in the Layers
  menu) the overlay only shows lines/poles that touch the operator's mapped
  fields (buffered ~150 m). That subset is computed in powerNearFields.js by
  decoding the handful of Mapbox vector tiles overlapping the fields. Toggling
  "Show Outside Fields" ON restores the full network everywhere.

  National & WA layers sit behind fields/markers. Visibility is driven from the
  Layers menu: "Power Lines", "Power Poles" and "Show Outside Fields".

  Data: © Commonwealth of Australia (Geoscience Australia) CC-BY 4.0;
        © Western Power (WP-031 lines, WP-029 poles, WA). -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import { computePowerNearData, buildPowerMask, filterNationalNear } from "$lib/utils/powerNearFields.js"

  export let map

  const NATIONAL_GEOJSON_URL = "/powerLines/powerlines.geojson"
  // NOTE: mapbox-gl v1.13 does NOT understand `mapbox://tilesets/…` source
  // URLs (it mangles them into /v4/tilesets.json → 404). These hosted tilesets
  // are therefore wired with their explicit .vector.pbf tile URLs instead
  // (minzoom/maxzoom/attribution mirror each tileset's TileJSON).
  const WA_LINES_TILESET_ID = "luchodore.pit699" // minzoom 4, maxzoom 14, source-layer `powerlines`
  const WA_POLES_TILESET_ID = "luchodore.rzpget" // minzoom 4, maxzoom 15, source-layer `poles`

  const NATIONAL_SOURCE = "powerlines-national"
  const WA_LINES_SOURCE = "wa-powerlines"
  const WA_POLES_SOURCE = "wa-power-poles"
  const NEAR_LINES_SOURCE = "powerlines-near"
  const NEAR_POLES_SOURCE = "power-poles-near"

  // Greyscale-outside-fields mask (same trick as FieldTrailOverlay) — a dim
  // grey polygon covering everything except the paddocks, drawn above the full
  // power layers but below the near-fields layers so the clip area is obvious.
  const MASK_SOURCE = "power-mask"
  const MASK_LAYER = "power-mask-layer"
  const MASK_COLOR = "#1a1a1a"
  const MASK_OPACITY = 0.1

  // Lines and poles both appear from z12 so they show up at the same zoom.
  const LINES_MIN_ZOOM = 12
  const POLES_MIN_ZOOM = 12

  // Module-level cache so multiple map instances never re-download the file.
  let geojsonPromise = null

  let added = false
  let destroyed = false
  let pendingStyleLoad = false

  // Near-fields ("within paddocks") state.
  let nearData = null
  let nearKey = null
  let nearReady = false
  let nearError = false
  let nearComputing = false

  // Live flags mirrored from the stores. Updated by readStores() on every
  // store change (explicit subscriptions — see onMount).
  let linesOn = true
  let polesOn = true
  let outsideOn = false
  // Fields currently on the map (raw records with a `boundary` GeoJSON
  // geometry) — both powerNearFields utils expect this shape (not features).
  let fieldFeatures = []

  function readStores() {
    const s = get(layerVisibilityStore)
    linesOn = s.powerLines !== false
    polesOn = s.powerPoles !== false
    outsideOn = s.powerOutsideFields === true
    fieldFeatures = get(mapFieldsStore).filter(
      (f) => f && f.boundary && f.boundary.coordinates,
    )
  }

  // Single driver: add layers when first needed, otherwise re-apply visibility
  // and (re)build the mask / near-fields data. Called on any store change and
  // when the map instance appears.
  function refresh() {
    if (!map || destroyed) return
    readStores()
    if ((linesOn || polesOn) && !added) {
      addLayers()
    } else if (added) {
      applyVisibility()
      syncNear()
      ensureMask()
    }
  }

  function styleReady() {
    // Only require the STYLE to be loaded (isStyleLoaded). map.loaded() also
    // waits for every tile/transition to settle, which on a busy live map
    // (vehicles/trails/markers updating constantly) can stay false for ages —
    // and used to stall the whole overlay until a manual toggle.
    try {
      return !!map?.isStyleLoaded?.()
    } catch {
      return false
    }
  }

  function getLayer(layerId) {
    try {
      return map?.getLayer?.(layerId)
    } catch {
      return null
    }
  }

  function loadGeoJson() {
    if (!geojsonPromise) {
      geojsonPromise = fetch(NATIONAL_GEOJSON_URL)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .catch((e) => {
          geojsonPromise = null
          throw e
        })
    }
    return geojsonPromise
  }

  const widthZoom = (base) => [
    "interpolate", ["linear"], ["zoom"],
    8, base,
    12, base * 3,
    14, base * 4.5,
  ]

  // Single flat yellow used for every power line.
  const LINE_COLOR = "#facc15"

  // Build a small black lightning-bolt sprite (white rim so it reads on both
  // dark satellite and bright paddocks). Returned as raw RGBA so it works with
  // mapbox-gl 1.13 addImage (no URL/fetch needed).
  function createBoltImage() {
    const logicalW = 24
    const logicalH = 30
    const s = 2 // supersample for crisp edges
    const canvas = document.createElement("canvas")
    canvas.width = logicalW * s
    canvas.height = logicalH * s
    const ctx = canvas.getContext("2d")
    ctx.scale(s, s)
    const path = new Path2D(
      "M13.5 2 L5.2 16.5 H10.8 L9.2 28 L19.4 13.5 H12.9 Z",
    )
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.strokeStyle = "rgba(255,255,255,0.95)"
    ctx.lineWidth = 2
    ctx.stroke(path)
    ctx.fillStyle = "#000000"
    ctx.fill(path)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return { width: img.width, height: img.height, data: img.data }
  }

  function ensureBoltImage() {
    if (!map || map.hasImage("power-bolt")) return
    try {
      map.addImage("power-bolt", createBoltImage(), { pixelRatio: 2 })
    } catch (e) {
      console.warn("[powerlines] could not add bolt icon:", e)
    }
  }

  // ── Layer specs ──────────────────────────────────────────────────────
  // Full network layers (hidden while the field-boundary filter is active).
  // `key` = layerVisibilityStore key controlling the group.
  const LAYER_SPECS = [
    // National lines (local GeoJSON) — every state except WA
    {
      key: "powerLines",
      id: "powerlines-national-casing",
      type: "line",
      source: NATIONAL_SOURCE,
      minzoom: LINES_MIN_ZOOM,
      filter: ["!=", ["get", "STATE"], "WA"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0f172a",
        "line-opacity": 0.5,
        "line-width": widthZoom(0.8),
      },
    },
    {
      key: "powerLines",
      id: "powerlines-national",
      type: "line",
      source: NATIONAL_SOURCE,
      minzoom: LINES_MIN_ZOOM,
      filter: ["!=", ["get", "STATE"], "WA"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": LINE_COLOR, "line-width": widthZoom(0.45) },
    },
    // WA distribution lines (Mapbox tileset)
    {
      key: "powerLines",
      id: "powerlines-wa-casing",
      type: "line",
      source: WA_LINES_SOURCE,
      sourceLayer: "powerlines",
      minzoom: LINES_MIN_ZOOM,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0f172a",
        "line-opacity": 0.45,
        "line-width": widthZoom(0.9),
      },
    },
    {
      key: "powerLines",
      id: "powerlines-wa",
      type: "line",
      source: WA_LINES_SOURCE,
      sourceLayer: "powerlines",
      minzoom: LINES_MIN_ZOOM,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": LINE_COLOR, "line-width": widthZoom(0.55) },
    },
    // WA distribution poles (Mapbox tileset) — black bolt symbols
    {
      key: "powerPoles",
      id: "power-poles",
      type: "symbol",
      source: WA_POLES_SOURCE,
      sourceLayer: "poles",
      minzoom: POLES_MIN_ZOOM,
      filter: ["!=", ["get", "pole_type"], "METAL_LIGHTING"],
      layout: {
        "icon-image": "power-bolt",
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          12, 0.35,
          13, 0.45,
          14, 0.6,
          15, 0.85,
          16, 1,
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
  ]

  // Near-fields layers (GeoJSON computed in powerNearFields.js). Their sources
  // are only created when there is data, so each layer is only added when its
  // source exists (see ensureNearSourcesAndLayers).
  const NEAR_LAYER_SPECS = [
    {
      key: "powerLines",
      id: "powerlines-near-casing",
      type: "line",
      source: NEAR_LINES_SOURCE,
      minzoom: LINES_MIN_ZOOM,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0f172a",
        "line-opacity": 0.45,
        "line-width": widthZoom(0.9),
      },
    },
    {
      key: "powerLines",
      id: "powerlines-near",
      type: "line",
      source: NEAR_LINES_SOURCE,
      minzoom: LINES_MIN_ZOOM,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": LINE_COLOR, "line-width": widthZoom(0.55) },
    },
    {
      key: "powerPoles",
      id: "power-poles-near",
      type: "symbol",
      source: NEAR_POLES_SOURCE,
      minzoom: POLES_MIN_ZOOM,
      filter: ["!=", ["get", "pole_type"], "METAL_LIGHTING"],
      layout: {
        "icon-image": "power-bolt",
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          12, 0.35,
          13, 0.45,
          14, 0.6,
          15, 0.85,
          16, 1,
        ],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
  ]

  const ALL_LAYER_SPECS = [...LAYER_SPECS, ...NEAR_LAYER_SPECS]
  const ALL_SOURCES = [
    NATIONAL_SOURCE,
    WA_LINES_SOURCE,
    WA_POLES_SOURCE,
    NEAR_LINES_SOURCE,
    NEAR_POLES_SOURCE,
    MASK_SOURCE,
  ]

  // Layers these should sit UNDER so field boundaries/markers/pins stay on top.
  const UNDER_TARGETS = [
    "fields-fill",
    "fields-outline",
    "fields-outline-selected",
    "markers",
    "kmz-overlays",
  ]

  function onFor(spec) {
    return spec.key === "powerPoles" ? polesOn : linesOn
  }

  // True while the full network should be hidden (default "within fields" mode
  // with mapped fields). The mask + near layers take over. On near-fields
  // compute errors we fall back to the full network (nearError → false).
  function withinMode() {
    if (outsideOn || nearError) return false
    return fieldFeatures.length > 0
  }

  // Near-fields layers are only worth showing once their data is ready AND
  // non-empty (either group having features is enough to show the group).
  function nearVisible() {
    if (!withinMode()) return false
    if (!nearReady || !nearData) return false
    return nearData.lines.features.length > 0 || nearData.poles.features.length > 0
  }

  function setLayerVisibility(id, visibility) {
    if (!map || !getLayer(id)) return
    try {
      const current = map.getLayoutProperty(id, "visibility") || "visible"
      if (current !== visibility) map.setLayoutProperty(id, "visibility", visibility)
    } catch {
      /* layer may be mid-removal */
    }
  }

  function applyVisibility() {
    if (!map) return
    const within = withinMode()
    const near = nearVisible()
    for (const spec of LAYER_SPECS) {
      setLayerVisibility(spec.id, !within && onFor(spec) ? "visible" : "none")
    }
    for (const spec of NEAR_LAYER_SPECS) {
      setLayerVisibility(spec.id, near && onFor(spec) ? "visible" : "none")
    }
    setLayerVisibility(MASK_LAYER, within ? "visible" : "none")
  }

  // Safety net: whenever the map goes idle, make sure the near-fields layers
  // actually exist and have the right visibility for the current mode. This
  // heals any first-load race where the decode finished but the layers never
  // got applied (previously only fixed by toggling the setting).
  function reconcile() {
    if (!map || destroyed || !added || !styleReady()) return
    if (withinMode() && nearReady && nearData) {
      const hasLine = nearData.lines.features.length > 0
      const hasPole = nearData.poles.features.length > 0
      if (hasLine || hasPole) {
        let missing = false
        for (const spec of NEAR_LAYER_SPECS) {
          const has = spec.source === NEAR_LINES_SOURCE ? hasLine : hasPole
          if (has && !getLayer(spec.id)) missing = true
        }
        if (missing || !getLayer(MASK_LAYER)) {
          ensureMask()
          ensureNearSourcesAndLayers()
        }
      }
    }
    applyVisibility()
  }

  // WA tileset sources need no fetch — register them straight away (once the
  // style is loaded and the Mapbox access token is set). Explicit tile URLs
  // (not mapbox://tilesets/…) because mapbox-gl v1.13 can't resolve that scheme.
  function waSourceConfig(tilesetId, minzoom, maxzoom) {
    return {
      type: "vector",
      tiles: [
        `https://api.mapbox.com/v4/${tilesetId}/{z}/{x}/{y}.vector.pbf?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}`,
      ],
      minzoom,
      maxzoom,
      attribution: "© Western Power",
    }
  }

  function ensureWASources() {
    if (!map) return
    if (!map.getSource(WA_LINES_SOURCE)) {
      map.addSource(WA_LINES_SOURCE, waSourceConfig(WA_LINES_TILESET_ID, 4, 14))
    }
    if (!map.getSource(WA_POLES_SOURCE)) {
      map.addSource(WA_POLES_SOURCE, waSourceConfig(WA_POLES_TILESET_ID, 4, 15))
    }
  }

  function addLayerSpec(spec) {
    if (!map || getLayer(spec.id)) return
    const cfg = {
      id: spec.id,
      type: spec.type,
      source: spec.source,
      minzoom: spec.minzoom,
    }
    if (spec.layout) cfg.layout = spec.layout
    if (spec.paint && Object.keys(spec.paint).length) cfg.paint = spec.paint
    if (spec.sourceLayer) cfg["source-layer"] = spec.sourceLayer
    if (spec.filter) cfg.filter = spec.filter
    map.addLayer(cfg)

    // Tuck power layers under field outlines/markers so fields stay on top.
    for (const target of UNDER_TARGETS) {
      if (getLayer(target)) {
        try {
          map.moveLayer(spec.id, target)
        } catch {
          /* ignore */
        }
        break
      }
    }
  }

  // Add (or refresh) the greyscale-outside-fields mask source + layer.
  function ensureMask() {
    if (!map) return
    try {
      const geometry = buildPowerMask(fieldFeatures)
      const data = geometry
        ? { type: "Feature", properties: {}, geometry }
        : { type: "FeatureCollection", features: [] }
      if (map.getSource(MASK_SOURCE)) {
        try {
          map.getSource(MASK_SOURCE).setData(data)
        } catch {
          /* ignore */
        }
      } else {
        map.addSource(MASK_SOURCE, { type: "geojson", data })
      }
      if (!getLayer(MASK_LAYER)) {
        map.addLayer({
          id: MASK_LAYER,
          type: "fill",
          source: MASK_SOURCE,
          paint: { "fill-color": MASK_COLOR, "fill-opacity": MASK_OPACITY },
        })
      }
    } catch (e) {
      console.warn("[powerlines] mask layer failed:", e)
    }
    reorderPowerStack()
  }

  // Re-stack the power layers bottom→top as: full network → grey mask →
  // near-fields layers — all tucked under the fields/markers overlay targets.
  function reorderPowerStack() {
    if (!map) return
    const target = UNDER_TARGETS.find((t) => getLayer(t))
    if (!target) return
    const ids = []
    for (const spec of LAYER_SPECS) ids.push(spec.id)
    ids.push(MASK_LAYER)
    for (const spec of NEAR_LAYER_SPECS) ids.push(spec.id)
    for (const id of ids) {
      if (getLayer(id)) {
        try {
          map.moveLayer(id, target)
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Add (or refresh) the near-fields GeoJSON sources + their layers.
  function ensureNearSourcesAndLayers() {
    if (!map || !nearData) return
    ensureBoltImage()
    const upsert = (sourceId, data) => {
      if (data.features.length === 0) return
      if (map.getSource(sourceId)) {
        try {
          map.getSource(sourceId).setData(data)
        } catch {
          /* ignore */
        }
      } else {
        map.addSource(sourceId, { type: "geojson", data })
      }
    }
    upsert(NEAR_LINES_SOURCE, nearData.lines)
    upsert(NEAR_POLES_SOURCE, nearData.poles)
    for (const spec of NEAR_LAYER_SPECS) {
      if (map.getSource(spec.source)) addLayerSpec(spec)
    }
    reorderPowerStack()
  }

  // National lines load in the background — nothing else waits on them (a slow
  // or failed fetch used to block the mask + near-fields setup entirely).
  async function addNationalBackground() {
    if (!map || destroyed || map.getSource(NATIONAL_SOURCE)) return
    try {
      const data = await loadGeoJson()
      if (destroyed || !styleReady() || map.getSource(NATIONAL_SOURCE)) return
      map.addSource(NATIONAL_SOURCE, { type: "geojson", data })
      for (const spec of LAYER_SPECS) {
        if (spec.source === NATIONAL_SOURCE) addLayerSpec(spec)
      }
      applyVisibility()
      reorderPowerStack()
    } catch (e) {
      console.warn("[powerlines] national layer failed:", e)
    }
    // Now the national data is here: fold its lines near the fields into the
    // near-fields set (covers WA transmission that the distribution tileset
    // doesn't include).
    addNationalNearIfNeeded()
  }

  // Add every full layer whose source is ready, then set up mask + visibility +
  // near-fields data immediately. Layers are added even while hidden —
  // visibility is handled by applyVisibility — so a later toggle never races.
  async function addLayers() {
    if (added || !map || destroyed || !styleReady()) return
    try {
      ensureWASources()
      ensureBoltImage()
      for (const spec of LAYER_SPECS) {
        if (spec.source !== NATIONAL_SOURCE) addLayerSpec(spec)
      }

      // Ready as soon as the WA tileset layers exist. The national GeoJSON is
      // fetched in the background so the mask/full-hide/near-data never stall.
      added = true
      ensureMask()
      applyVisibility()
      syncNear()
      reorderPowerStack()
      addNationalBackground()
      console.info("[powerlines] overlay ready (WA lines/poles + mask)")
    } catch (e) {
      console.warn("[powerlines] failed to add overlay:", e)
    }
  }

  function removeLayers() {
    if (!map) return
    try {
      if (getLayer(MASK_LAYER)) map.removeLayer(MASK_LAYER)
      for (const spec of ALL_LAYER_SPECS) {
        if (getLayer(spec.id)) map.removeLayer(spec.id)
      }
      for (const src of ALL_SOURCES) {
        if (map.getSource(src)) map.removeSource(src)
      }
    } catch {
      /* ignore */
    }
    added = false
  }

  // ── Near-fields ("within paddocks") computation ──────────────────────
  function fieldsKey() {
    return JSON.stringify(fieldFeatures.map((f) => f.boundary))
  }

  // Try to grab the national data if it is already loaded — never block the WA
  // decode on it. National near lines are merged in later via
  // addNationalNearIfNeeded() once the file has actually loaded.
  function quickNational() {
    if (!geojsonPromise) return Promise.resolve(null)
    return Promise.race([
      geojsonPromise.catch(() => null),
      new Promise((r) => setTimeout(() => r(null), 400)),
    ])
  }

  // Once national data is available, add any of its lines that touch the fields
  // to the near-fields set (transmission lines crossing paddocks, not in the WA
  // distribution tileset). Safe to call repeatedly — merges only once.
  async function addNationalNearIfNeeded() {
    if (!map || destroyed) return
    if (outsideOn || !fieldFeatures.length) return
    if (!geojsonPromise) return
    if (!nearData || nearKey !== fieldsKey() || nearData.includedNational) return
    let nat = null
    try {
      nat = await loadGeoJson()
    } catch {
      return
    }
    if (destroyed || outsideOn || nearKey !== fieldsKey()) return
    nearData.includedNational = true
    const nf = await filterNationalNear(nat, fieldFeatures)
    if (!nf.features.length) return
    nearData = {
      ...nearData,
      lines: {
        type: "FeatureCollection",
        features: [...nearData.lines.features, ...nf.features],
      },
    }
    if (map.getSource(NEAR_LINES_SOURCE)) {
      try {
        map.getSource(NEAR_LINES_SOURCE).setData(nearData.lines)
      } catch {
        /* ignore */
      }
    } else {
      ensureNearSourcesAndLayers()
    }
    console.info(`[powerlines] merged ${nf.features.length} national lines near fields`)
  }

  async function syncNear() {
    if (!map || destroyed) return
    const within = !outsideOn && fieldFeatures.length > 0 && !nearError
    if (!within) {
      nearReady = false
      return
    }
    const key = fieldsKey()
    if (nearData && nearKey === key) {
      nearReady = true
      if (styleReady()) ensureNearSourcesAndLayers()
      applyVisibility()
      console.info(
        `[powerlines] near-fields ready (cached ${nearData.lines.features.length} lines, ${nearData.poles.features.length} poles)`,
      )
      return
    }
    if (nearComputing) return

    nearComputing = true
    nearReady = false
    nearError = false
    const t0 = Date.now()
    console.info(
      `[powerlines] computing near-fields for ${fieldFeatures.length} field(s)…`,
    )
    let discarded = false
    try {
      const nationalData = await quickNational()
      const data = await computePowerNearData({
        fields: fieldFeatures,
        accessToken: PUBLIC_MAPBOX_ACCESS_TOKEN,
        nationalData,
      })
      if (destroyed) return
      if (outsideOn || fieldFeatures.length === 0) return
      if (fieldsKey() !== key) {
        // Fields changed while we were decoding — don't adopt stale data;
        // syncNear() is re-scheduled in `finally` to compute the current set.
        discarded = true
        return
      }
      data.includedNational = !!nationalData
      nearData = data
      nearKey = key
      nearReady = true
      nearError = false
      // Hide the full network / show the mask now; near sources are added next.
      applyVisibility()
      console.info(
        `[powerlines] near-fields: ${data.lines.features.length} lines, ${data.poles.features.length} poles (${data.tiles} tiles, z${data.decodeZoom}, ${Date.now() - t0}ms)`,
      )
      // Fold in national (transmission) lines near the fields once the file is
      // loaded, in case it wasn't ready during the decode.
      addNationalNearIfNeeded()

      const ensureNear = () => {
        if (destroyed || !nearReady || fieldsKey() !== key) return false
        if (!styleReady()) return false
        ensureNearSourcesAndLayers()
        applyVisibility()
        return true
      }
      if (!ensureNear()) {
        // The style can still be settling when the decode finishes — keep
        // retrying until we can actually add the GeoJSON sources/layers.
        let tries = 0
        const timer = setInterval(() => {
          if (destroyed || !nearReady || fieldsKey() !== key) {
            clearInterval(timer)
            return
          }
          if (ensureNear()) clearInterval(timer)
          else if (++tries > 40) clearInterval(timer)
        }, 250)
      }
      // Final safety passes once the map settles (heals any first-load miss).
      setTimeout(() => reconcile(), 500)
      setTimeout(() => reconcile(), 2000)
      setTimeout(() => reconcile(), 5000)
    } catch (e) {
      if (!destroyed) {
        nearError = true
        nearReady = false
        console.warn("[powerlines] near-fields compute failed, showing full network:", e)
        applyVisibility()
      }
    } finally {
      nearComputing = false
      // If we had to drop a result because the fields changed mid-decode, run
      // again with the current fields so the first load still shows them
      // without needing a manual toggle.
      if (
        discarded &&
        !destroyed &&
        !outsideOn &&
        fieldFeatures.length > 0 &&
        !(nearData && nearKey === fieldsKey())
      ) {
        setTimeout(() => {
          if (!destroyed) syncNear()
        }, 0)
      }
    }
  }

  // Re-add after a style reload (mapbox swaps the style out and drops layers).
  function handleStyleLoad() {
    added = false
    if (destroyed) return
    if (styleReady()) addLayers()
    else if (!pendingStyleLoad) scheduleRetry()
  }

  function scheduleRetry() {
    pendingStyleLoad = true
    const check = () => {
      pendingStyleLoad = false
      if (destroyed) return
      if (styleReady()) addLayers()
    }
    map.once?.("idle", check)
    // Safety net in case idle never fires.
    setTimeout(() => {
      if (!destroyed && pendingStyleLoad) check()
    }, 4000)
  }

  // Re-run whenever the map instance appears (also drives the initial mount).
  let didInitMap = false
  $: if (map && !didInitMap) {
    didInitMap = true
    map.on("style.load", handleStyleLoad)
    map.on("idle", reconcile)
    readStores()
    ensureEventuallyAdded()
    if (!styleReady()) scheduleRetry()
  }

  let unsubVisibility = null
  let unsubFields = null
  let addRetryTimer = null

  // Guarantee the base layers get added even if every event is missed during a
  // busy first load (retries until the style is ready, then adds once).
  function ensureEventuallyAdded() {
    if (!map || destroyed || added) return
    if (styleReady()) {
      addLayers()
      return
    }
    if (addRetryTimer || destroyed) return
    addRetryTimer = setInterval(() => {
      if (destroyed || added) {
        clearInterval(addRetryTimer)
        addRetryTimer = null
        return
      }
      if (styleReady()) {
        clearInterval(addRetryTimer)
        addRetryTimer = null
        addLayers()
      }
    }, 400)
    // Hard stop after 20 s so the interval never runs forever.
    setTimeout(() => {
      if (addRetryTimer) {
        clearInterval(addRetryTimer)
        addRetryTimer = null
      }
    }, 20000)
  }

  onMount(() => {
    // Subscribe to the stores even before the map prop arrives — refresh()
    // guards on map being present.
    unsubVisibility = layerVisibilityStore.subscribe(() => refresh())
    unsubFields = mapFieldsStore.subscribe(() => refresh())
    if (map) ensureEventuallyAdded()
  })

  onDestroy(() => {
    destroyed = true
    if (addRetryTimer) {
      clearInterval(addRetryTimer)
      addRetryTimer = null
    }
    unsubVisibility?.()
    unsubFields?.()
    map?.off?.("style.load", handleStyleLoad)
    map?.off?.("idle", reconcile)
    removeLayers()
  })
</script>
