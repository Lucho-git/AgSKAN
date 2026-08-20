<!-- src/lib/components/map/markers/MarkerManager.svelte -->
<script>
  import {
    selectedMarkerStore,
    confirmedMarkersStore,
    locationMarkerStore,
    extraLocationMarkerStore,
    remoteMarkerRippleStore,
    remoteMarkerEditStore,
    remoteMarkerDeleteStore,
    collectionModeStore,
    collectionRouteStore,
  } from "$lib/stores/markerStore"

  import { userSettingsStore } from "$lib/stores/userSettingsStore"
  import { controlStore } from "$lib/stores/controlStore"
  import { markerVisibilityStore } from "$lib/stores/markerVisibilityStore"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { userVehicleStore } from "$lib/stores/vehicleStore"

  import { onMount, onDestroy, getContext } from "svelte"
  import { get } from "svelte/store"
  import { v4 as uuidv4 } from "uuid"
  import * as mapboxgl from "mapbox-gl"
  import { mapAttentionStore } from "$lib/stores/mapAttentionStore"
  import MarkerEditPanel from "./MarkerEditPanel.svelte"
  import MarkerPlacementPanel from "./MarkerPlacementPanel.svelte"
  import SiloMarkerPanel from "./SiloMarkerPanel.svelte"
  import MarkerOverlayPanel from "./MarkerOverlayPanel.svelte"
  import {
    MARKER_COLORS,
    MARKER_COLOR_DEFAULT,
    markerColor,
    markerDefaultColorKey,
    effectiveColorKey,
    styleDefaultColor,
    isCustomSvgIcon,
    RANDOM_COLOR_KEY,
    randomColorForId,
    TINT_MODE_DEFAULT,
    tintMode,
    PICKABLE_MARKER_COLORS,
    SILO_COLOR_DEFAULT,
    siloColorKey,
    paletteVariantSuffix,
  } from "./markerPalette"
  import {
    isSvgRenderedIcon,
    renderSvgMarkerCanvas,
    renderSvgMarkerImageData,
  } from "./markerSvgRenderer"
  import {
    loadPngToCanvas,
    tintMarkerCanvas,
    hexToRgb,
    getIconBaseCanvas,
  } from "./markerTint"
  import {
    getIconImageName as getIconImageNameUtil,
    findMarkerByIconClass,
  } from "$lib/data/markerDefinitions"
  import {
    DEFAULT_MARKER_PREFERENCE,
    resolveDefaultMarkerPreference,
  } from "$lib/utils/defaultMarkerPreference"

  export let map
  export let mapLoaded = false
  export let coordinatedEvents = false

  /**
   * Show a temporary ripple animation at the given [lng, lat] coordinates.
   * Uses a short-lived DOM marker that self-removes after the animation.
   */
  function appendFloatingLabel(container, text) {
    if (!text) return
    const label = document.createElement("div")
    label.className = "marker-floating-label"
    label.textContent = text
    container.appendChild(label)
  }

  // "Circle click" confirmation animation: a thin ring contracts inward, a
  // dot snaps in the middle, then a ring pulses outward. `color` is an rgba
  // prefix WITHOUT its closing paren (e.g. "rgba(34, 197, 94"), so per-part
  // opacities can be appended.
  function showGatherAnimation(lngLat, color, label = "") {
    if (!map) return
    const el = document.createElement("div")
    el.className = "marker-ripple-container"

    const ring = document.createElement("div")
    ring.className = "marker-confirm-gather"
    ring.style.borderColor = `${color}, 0.5)`
    ring.style.boxShadow = `0 0 12px ${color}, 0.2)`
    const dot = document.createElement("div")
    dot.className = "marker-confirm-gather-dot"
    dot.style.background = `${color}, 0.95)`
    dot.style.boxShadow = `0 0 14px ${color}, 0.9), 0 0 35px ${color}, 0.5)`
    const pulse = document.createElement("div")
    pulse.className = "marker-confirm-gather-pulse"
    pulse.style.borderColor = `${color}, 0.6)`
    el.appendChild(ring)
    el.appendChild(dot)
    el.appendChild(pulse)

    if (label) appendFloatingLabel(el, label)

    const ripple = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map)
    pulse.addEventListener("animationend", () => ripple.remove())
  }

  function showPlacementRipple(
    lngLat,
    color = "rgba(247, 219, 92",
    markerName = "",
  ) {
    if (!map) return
    console.log("🫧 Ripple at", lngLat, "color:", color)
    const el = document.createElement("div")
    el.className = "marker-ripple-container"

    const isConfirm = color.includes("34, 197, 94")

    if (isConfirm) {
      // Soft gather — thin ring contracts inward, sharp dot snap + outward
      // pulse. This is the "circle click" confirmation animation.
      showGatherAnimation(lngLat, color, markerName ? `${markerName} Placed` : "")
    } else {
      // Gold placement: two expanding rings
      const ring1 = document.createElement("div")
      ring1.className = "marker-ripple-ring"
      ring1.style.borderColor = `${color}, 0.9)`
      ring1.style.background = `${color}, 0.18)`
      const ring2 = document.createElement("div")
      ring2.className = "marker-ripple-ring marker-ripple-ring--delayed"
      ring2.style.borderColor = `${color}, 0.6)`
      ring2.style.background = `${color}, 0.08)`
      el.appendChild(ring1)
      el.appendChild(ring2)

      if (markerName) appendFloatingLabel(el, `${markerName} Placed`)

      const ripple = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map)

      ring2.addEventListener("animationend", () => ripple.remove())
    }
  }

  function showRemovalAnimation(lngLat, markerName = "") {
    if (!map) return
    const el = document.createElement("div")
    el.className = "marker-ripple-container"

    const puff = document.createElement("div")
    puff.className = "marker-removal-puff"
    el.appendChild(puff)

    if (markerName) appendFloatingLabel(el, `${markerName} Deleted`)

    const ripple = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map)
    puff.addEventListener("animationend", () => ripple.remove())
  }

  function showCollectAnimation(lngLat, markerName = "") {
    if (!map) return
    const el = document.createElement("div")
    el.className = "marker-ripple-container"

    const gather = document.createElement("div")
    gather.className = "marker-collect-gather"
    el.appendChild(gather)

    const dot = document.createElement("div")
    dot.className = "marker-collect-dot"
    el.appendChild(dot)

    if (markerName) appendFloatingLabel(el, `${markerName} Collected`)

    const ripple = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map)
    dot.addEventListener("animationend", () => ripple.remove())
  }

  function showEditRipple(lngLat, markerName = "") {
    if (!map) return
    const el = document.createElement("div")
    el.className = "marker-ripple-container"
    const ring = document.createElement("div")
    ring.className = "marker-edit-pulse"
    el.appendChild(ring)

    if (markerName) appendFloatingLabel(el, markerName)

    const m = new mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat(lngLat)
      .addTo(map)
    ring.addEventListener("animationend", () => m.remove())
  }

  function showMoveRipple(lngLat, markerName = "") {
    if (!map) return
    // Same "circle click" soft-gather as the placement confirmation, in
    // amber to match the silo move theme.
    showGatherAnimation(
      lngLat,
      "rgba(245, 158, 11",
      markerName ? `${markerName} Moved` : "",
    )
  }

  const mapContext = getContext("map")

  // Get global selection context for unified event system
  let globalSelectionContext = null
  let globalSelectionState = null

  // Configuration for note labels
  const NOTE_LABEL_MAX_LENGTH = 25

  // Helper function to get default marker from store
  function getDefaultMarker() {
    return resolveDefaultMarkerPreference($userSettingsStore?.defaultMarker)
  }

  function getMarkerIconClasses(marker = DEFAULT_MARKER_PREFERENCE) {
    if (marker.class === "default") {
      return { iconClass: "default", iconImageName: "default" }
    }

    if (marker.class === "custom-svg") {
      const iconClass = `custom-svg-${marker.id}`
      return { iconClass, iconImageName: iconClass }
    }

    return { iconClass: marker.class, iconImageName: marker.class }
  }

  function shouldShowNoteLabel(marker) {
    return marker?.noteLabelVisible !== false
  }

  // Helper function to get secondary marker from store
  // (kept for compatibility but now unused — extras come via store payload)

  // Truncate note text for display on map
  function truncateNote(note, maxLength = NOTE_LABEL_MAX_LENGTH) {
    if (!note) return null
    const trimmed = note.trim()
    if (!trimmed) return null
    const displayText =
      trimmed.length <= maxLength
        ? trimmed
        : trimmed.substring(0, maxLength) + "..."
    return "• " + displayText // ← current active option
  }

  // Truncate the silo contents label for display on the map (20 chars max).
  function truncateContents(text, maxLength = 20) {
    if (!text) return null
    const trimmed = text.trim()
    if (!trimmed) return null
    return trimmed.length <= maxLength
      ? trimmed
      : trimmed.substring(0, maxLength) + "..."
  }
  // Try to get global selection context
  function checkGlobalSelectionContext() {
    try {
      globalSelectionContext = getContext("globalSelection")
      if (globalSelectionContext) {
        globalSelectionState = globalSelectionContext.getState()
        console.log("🎯 MarkerManager: Connected to global selection context")
      }
    } catch (error) {
      // Context not available yet, that's ok
    }
  }

  let locationMarkerUnsubscribe
  let extraLocationMarkerUnsubscribe
  let confirmedMarkersUnsubscribe
  let globalStyleUnsubscribe
  let lastGlobalStyle = null
  let lastGlassOpacity = null
  /** @type {{ mode: string, color: string, perType: Record<string, string> } | null} */
  let lastDefaultColors = null
  let remoteRippleUnsubscribe
  let remoteEditUnsubscribe
  let remoteDeleteUnsubscribe
  let markersInitialized = false
  let iconsLoaded = false
  let iconPaths = null

  // Periodically check for global selection context and sync
  let contextCheckInterval = null

  function syncWithGlobalSelection() {
    checkGlobalSelectionContext()

    if (globalSelectionContext) {
      const currentState = globalSelectionContext.getState()

      if (currentState.selectedType === "marker") {
        // Marker is selected via unified system
        if (
          !$selectedMarkerStore ||
          $selectedMarkerStore.id !== currentState.selectedId
        ) {
          // Find the marker data
          const marker = $confirmedMarkersStore.find(
            (m) => m.id === currentState.selectedId,
          )
          if (marker) {
            selectedMarkerStore.set({
              id: marker.id,
              coordinates: marker.coordinates,
            })
            updateMarkerSelection(marker.id, true)
            console.log(
              "🎯 MarkerManager: Synced with global selection:",
              marker.id,
            )
          }
        }
      } else if (
        currentState.selectedType !== "marker" &&
        $selectedMarkerStore
      ) {
        // Something else is selected, clear marker selection
        if ($selectedMarkerStore) {
          updateMarkerSelection($selectedMarkerStore.id, false)
        }
        selectedMarkerStore.set(null)
        controlStore.update((controls) => ({
          ...controls,
          showMarkerMenu: false,
        }))
        console.log(
          "🎯 MarkerManager: Cleared selection due to other selection",
        )
      }
    }
  }

  $: if (mapLoaded && map && !markersInitialized) {
    initializeMarkerLayers()
  }

  // Reactive statement to update marker layer visibility
  $: if (markersInitialized && map && $layerVisibilityStore) {
    updateMarkerLayerVisibility()
  }

  $: if (markersInitialized && map && $markerVisibilityStore) {
    if (!hasUnconfirmedSelectedMarker()) {
      refreshMapMarkers()
    }
  }

  function updateMarkerLayerVisibility() {
    if (!map || !map.getLayer) return

    try {
      const markersVisible = $layerVisibilityStore.markers
      const markerLabelsVisible = $layerVisibilityStore.markerLabels !== false // Default to true if not set

      // Toggle all marker-related layers
      if (map.getLayer("markers-layer")) {
        map.setLayoutProperty(
          "markers-layer",
          "visibility",
          markersVisible ? "visible" : "none",
        )
      }
      if (map.getLayer("markers-selected-layer")) {
        map.setLayoutProperty(
          "markers-selected-layer",
          "visibility",
          markersVisible ? "visible" : "none",
        )
      }

      // Toggle marker note labels - only visible if both markers AND labels are enabled
      if (map.getLayer("markers-note-labels")) {
        map.setLayoutProperty(
          "markers-note-labels",
          "visibility",
          markersVisible && markerLabelsVisible ? "visible" : "none",
        )
      }

      console.log("✅ Updated marker layer visibility")
    } catch (error) {
      console.error("Error updating marker layer visibility:", error)
    }
  }

  // Fixed: Center camera without zooming
  function centerCameraOnMarker(coordinates) {
    if (!map || !coordinates || coordinates.length !== 2) return

    map.flyTo({
      center: coordinates,
      duration: 1000,
    })
  }

  // Quick camera center for new marker placement — respects user setting
  function quickCenterOnMarker(coordinates) {
    if (!map || !coordinates || coordinates.length !== 2) return
    if (!$userSettingsStore?.zoomToPlacedMarkers) return

    map.flyTo({
      center: coordinates,
      duration: 800,
    })
  }

  // Load high-DPI PNG icons
  async function loadHighDpiIcons() {
    if (!map || iconsLoaded || iconPaths) return

    console.log("🚀 Loading high-DPI PNG icons...")

    try {
      const response = await fetch("/icon-paths.json")
      if (!response.ok)
        throw new Error(`Failed to load icon paths: ${response.status}`)

      iconPaths = await response.json()
      console.log(`📋 Loaded ${Object.keys(iconPaths).length} icon paths`)

      const loadPromises = Object.entries(iconPaths).map(
        async ([iconKey, iconPath]) => {
          return new Promise((resolve, reject) => {
            map.loadImage(`/${iconPath}`, (error, image) => {
              if (error) {
                console.error(`❌ Failed to load ${iconKey}:`, error)
                reject(error)
                return
              }
              if (!map.hasImage(iconKey)) {
                map.addImage(iconKey, image)
              }
              resolve()
            })
          })
        },
      )

      await Promise.allSettled(loadPromises)
      iconsLoaded = true
      console.log("🎯 All high-DPI PNG icons loaded!")
    } catch (error) {
      console.error("❌ Error loading high-DPI icons:", error)
      await loadFallbackIcons()
    }
  }

  // ── Runtime marker tinting (modern option A) ──
  // Builds tinted icon variants on the fly from the original PNGs. The
  // baked-in light-grey circle and the glyph inside can be recoloured
  // independently, giving five tint modes (see markerPalette TINT_MODES).
  // The pixel-tinting logic itself lives in the shared `./markerTint`
  // module (loadPngToCanvas / tintMarkerCanvas / hexToRgb) so the new-marker
  // preview grid uses the exact same code as the live map.
  let tintedIconCache = new Set()

  // Lazily register a tinted variant for one icon × colour × mode.
  /**
   * @param {string} iconKey
   * @param {string} colorKey
   * @param {string} mode
   * @param {boolean} [keepGlyphOriginal] Custom SVG icons keep their glyph's
   *   baked-in colours; only the circle/disc follows the mode.
   * @param {number} [glassAlpha] 0-1 opacity for the icon-only glass disc
   *   (baked into the registered image key so the slider re-tints).
   */
  async function ensureTintedMarkerIcon(
    iconKey,
    colorKey,
    mode,
    keepGlyphOriginal = false,
    glassAlpha = 0.3,
    skipRefresh = false,
  ) {
    if (!map || !iconPaths) return
    const alphaSuffix =
      mode === "icon-dark-glass" || mode === "icon-light-glass"
        ? "-a" + Math.round(glassAlpha * 100)
        : ""
    const tintedKey = `${iconKey}-${colorKey}-${mode}${
      keepGlyphOriginal ? "-g" : ""
    }${alphaSuffix}${paletteVariantSuffix(mode)}`
    if (map.hasImage(tintedKey) || tintedIconCache.has(tintedKey)) return
    tintedIconCache.add(tintedKey)
    const colorDef = markerColor(colorKey, mode)
    if (!colorDef) return
    try {
      if (isSvgRenderedIcon(iconKey)) {
        // Proof of concept: compose the marker from SVG (explicit disc/ring +
        // raw glyph) and rasterize — no pixel heuristics, so grey glyphs (the
        // rock boulder) keep their own colours while still getting the style.
        const image = await renderSvgMarkerImageData(
          iconKey,
          colorKey,
          mode,
          glassAlpha,
        )
        if (!map.hasImage(tintedKey)) map.addImage(tintedKey, image)
        console.log(`🖼️ SVG icon registered: ${tintedKey}`)
      } else {
        const path = iconPaths[iconKey]
        if (!path) return
        const canvas = await loadPngToCanvas(`/${path}`)
        tintMarkerCanvas(canvas, colorDef, mode, {
          keepGlyphOriginal,
          glassAlpha,
        })
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        if (!map.hasImage(tintedKey)) {
          map.addImage(tintedKey, {
            width: canvas.width,
            height: canvas.height,
            data: imageData.data,
          })
        }
        console.log(`🎨 Tinted icon registered: ${tintedKey}`)
      }
      // The icon wasn't available when the marker first rendered — re-render
      // now that it exists so the marker shows with its tint. Preview tints
      // skip this: refreshMapMarkers rebuilds from confirmedMarkersStore and
      // would drop a still-unconfirmed (brand-new) marker.
      if (!skipRefresh) refreshMapMarkers()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`⚠️ Could not tint ${iconKey} (${colorKey}):`, msg)
    } finally {
      tintedIconCache.delete(tintedKey)
    }
  }

  async function loadFallbackIcons() {
    if (!map || iconsLoaded) return

    console.log("Loading fallback icons...")

    if (!map.hasImage("default")) {
      const canvas = document.createElement("canvas")
      canvas.width = 35
      canvas.height = 35
      const ctx = canvas.getContext("2d", { willReadFrequently: true })

      ctx.fillStyle = "#3b82f6"
      ctx.beginPath()
      ctx.arc(17.5, 17.5, 14, 0, 2 * Math.PI)
      ctx.fill()
      ctx.strokeStyle = "white"
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = "white"
      ctx.beginPath()
      ctx.arc(17.5, 17.5, 4, 0, 2 * Math.PI)
      ctx.fill()

      const imageData = ctx.getImageData(0, 0, 35, 35)
      map.addImage("default", { width: 35, height: 35, data: imageData.data })
    }

    iconsLoaded = true
    console.log("Fallback icon loading completed")
  }

  // Round a fill % to the nearest 10% gauge level.
  function siloBarLevel(fill) {
    return Math.max(0, Math.min(100, Math.round((fill ?? 0) / 10) * 10))
  }

  // Generate the silo fullness gauge images (rounded track + fill) tinted by
  // the silo's grain colour.
  function createSiloBarImage(levelPct, colorKey = SILO_COLOR_DEFAULT) {
    const w = 84
    const h = 16
    const color = markerColor(siloColorKey(colorKey), "original")
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    const r = h / 2
    const round = (x, y, ww, hh, rr) => {
      ctx.beginPath()
      ctx.moveTo(x + rr, y)
      ctx.arcTo(x + ww, y, x + ww, y + hh, rr)
      ctx.arcTo(x + ww, y + hh, x, y + hh, rr)
      ctx.arcTo(x, y + hh, x, y, rr)
      ctx.arcTo(x, y, x + ww, y, rr)
      ctx.closePath()
    }
    // track
    round(0, 0, w, h, r)
    ctx.fillStyle = "rgba(2, 6, 23, 0.8)"
    ctx.fill()
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)"
    ctx.lineWidth = 1
    ctx.stroke()
    // fill (left → right by level)
    const level = Math.max(0, Math.min(100, levelPct))
    const pad = 2.5
    const fw = (w - pad * 2) * (level / 100)
    const fh = h - pad * 2
    if (fw > 0.5) {
      round(pad, pad, fw, fh, fh / 2)
      const grad = ctx.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, color.light)
      grad.addColorStop(1, color.dark)
      ctx.fillStyle = grad
      ctx.fill()
    }
    return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data }
  }

  // Compact silo glyph shown inside the offscreen bin-tracking badge
  // (tinted by currentColor = the bin's grain colour).
  const SILO_TRACK_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2c-4 0-7 2-7 5v10a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V7c0-3-3-5-7-5zM7 7c0-1.7 2.2-3 5-3s5 1.3 5 3v2H7V7z"/></svg>`

  // When "Show bins always" is on, register every silo in the attention
  // store so the EdgeIndicator pins an offscreen circle at the map edge with
  // the bin's fill bar + colour. When off, all bin badges are removed.
  // NOTE: dependencies must be passed as explicit arguments — Svelte 4 only
  // tracks variables referenced directly in the reactive statement, so a
  // bare `$: syncBinTracking()` would run once at init and never again.
  $: syncBinTracking(
    $userSettingsStore?.showBinsAlways ?? false,
    $confirmedMarkersStore,
    markersInitialized,
    map,
  )

  function syncBinTracking(enabled, markers, ready, mapReady) {
    if (!ready || !mapReady) {
      console.log(
        `[bin-tracking] skipped (markersInitialized=${ready}, map=${!!mapReady})`,
      )
      return
    }
    const silos = (markers || []).filter(
      (m) => (m.iconClass || "") === "custom-svg-silo2",
    )
    const wanted = new Set(
      enabled ? silos.map((s) => `silo-track-${s.id}`) : [],
    )
    console.log(
      `[bin-tracking] enabled=${enabled}, silos=${silos.length}, wanted=${wanted.size}`,
    )

    // Remove bin badges that are no longer wanted (setting off, or marker
    // deleted / no longer a silo).
    const current = get(mapAttentionStore)
    for (const item of current) {
      if (
        item.id &&
        item.id.startsWith("silo-track-") &&
        !wanted.has(item.id)
      ) {
        mapAttentionStore.remove(item.id)
      }
    }
    if (!enabled) return

    for (const s of silos) {
      const colorDef = markerColor(siloColorKey(s.grainColor), "original")
      mapAttentionStore.add({
        id: `silo-track-${s.id}`,
        coordinates: s.coordinates,
        color: colorDef.dark,
        label: s.notes?.trim() || "Silo",
        barLevel: s.siloFill ?? 0,
        barColor: colorDef.dark,
        iconSvg: SILO_TRACK_ICON_SVG,
      })
      console.log(
        `[bin-tracking] registered ${s.id} (${colorDef.label}, fill=${s.siloFill})`,
      )
    }
  }

  // Register gauge images for every palette colour × 0..100 in 10% steps.
  function registerSiloBarImages() {
    if (!map) return
    for (const color of PICKABLE_MARKER_COLORS) {
      for (let level = 0; level <= 100; level += 10) {
        const key = `silo-bar-${color.key}-${level}`
        if (!map.hasImage(key)) {
          map.addImage(key, createSiloBarImage(level, color.key))
        }
      }
    }
  }

  // Use the unified getIconImageName function
  function getIconImageName(iconClass) {
    return getIconImageNameUtil(iconClass)
  }

  async function initializeMarkerLayers() {
    if (!map || markersInitialized) return

    console.log("🏁 Initializing marker layers...")
    await loadHighDpiIcons()
    registerSiloBarImages()

    if (!map.getSource("markers")) {
      map.addSource("markers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
    }

    // Main marker layer - exclude selected markers
    if (!map.getLayer("markers-layer")) {
      const layerConfig = {
        id: "markers-layer",
        type: "symbol",
        source: "markers",
        filter: ["!=", ["get", "selected"], true],
        layout: {
          // Silos carry their level bar as a second "isBar" feature in THIS
          // layer (see refreshMapMarkers) so the bar follows the icon's
          // data-order layering among markers instead of a separate layer
          // stacked on top of every marker.
          "icon-image": [
            "case",
            ["==", ["get", "isBar"], true],
            ["get", "barImage"],
            ["get", "icon"],
          ],
          "icon-size": 0.35,
          "icon-allow-overlap": true,
          "text-allow-overlap": true,
          "icon-anchor": [
            "case",
            ["==", ["get", "isBar"], true],
            "top",
            ["case", ["==", ["get", "icon"], "default"], "center", "center"],
          ],
          "icon-offset": [
            "case",
            ["==", ["get", "isBar"], true],
            ["get", "barOffset"],
            ["literal", [0, 0]],
          ],
        },
      }

      if (mapContext?.addLayerOrdered) {
        mapContext.addLayerOrdered(layerConfig)
      } else {
        map.addLayer(layerConfig)
      }
    }

    // Selected marker layer - shows ONLY the selected marker on top (bar
    // features are never rendered here — the overlay carries the selected
    // silo's bar).
    if (!map.getLayer("markers-selected-layer")) {
      const selectedLayerConfig = {
        id: "markers-selected-layer",
        type: "symbol",
        source: "markers",
        filter: [
          "all",
          ["==", ["get", "selected"], true],
          ["!=", ["get", "isBar"], true],
        ],
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": 0.35,
          "icon-allow-overlap": true,
          "text-allow-overlap": true,
          "icon-anchor": [
            "case",
            ["==", ["get", "icon"], "default"],
            "center",
            "center",
          ],
        },
      }

      if (mapContext?.addLayerOrdered) {
        mapContext.addLayerOrdered(selectedLayerConfig)
      } else {
        map.addLayer(selectedLayerConfig)
      }
    }

    // Note labels layer - displays truncated notes above markers
    if (!map.getLayer("markers-note-labels")) {
      const noteLabelsConfig = {
        id: "markers-note-labels",
        type: "symbol",
        source: "markers",
        minzoom: 12,
        filter: [
          "all",
          ["has", "noteLabel"],
          ["!=", ["get", "noteLabel"], ""],
          ["==", ["get", "confirmed"], true],
        ],
        layout: {
          "text-field": ["get", "noteLabel"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
          ],
          "text-anchor": "bottom",
          "text-offset": [0, -1.8],
          "text-max-width": 14,
          "text-allow-overlap": false,
          "text-optional": true,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-letter-spacing": 0.02,
        },
        paint: {
          "text-color": "#ffee8c",
          "text-halo-color": "#000000",
          "text-halo-width": 2,
          "text-halo-blur": 0,
        },
      }

      if (mapContext?.addLayerOrdered) {
        mapContext.addLayerOrdered(noteLabelsConfig)
      } else {
        map.addLayer(noteLabelsConfig)
      }
    }

    // NOTE: the silo fill gauge no longer has its own layer. Silos render a
    // second "isBar" feature directly in markers-layer (see refreshMapMarkers)
    // so the bar follows the icon's data-order layering among markers. The
    // selected silo's bar is hidden by marking its bar feature selected too
    // (same id → excluded by markers-layer's filter) and by barImage:null
    // during a deselect shrink — see updateMarkerSelection/restoreSiloBar.

    // Silo "what's stored" labels — shown on the map like the note labels so
    // the contents of each silo are visible without having to click it.
    if (!map.getLayer("markers-silo-labels")) {
      const siloLabelsLayer = {
        id: "markers-silo-labels",
        type: "symbol",
        source: "markers",
        minzoom: 11,
        filter: [
          "all",
          ["==", ["get", "iconClass"], "custom-svg-silo2"],
          ["==", ["get", "confirmed"], true],
          // The SELECTED silo's label lives in the DOM selection overlay
          // (it pops with the icon instead of being covered by it).
          ["!=", ["get", "selected"], true],
        ],
        layout: {
          "text-field": ["get", "grainLabel"],
          "text-size": 11,
          "text-anchor": "bottom",
          "text-offset": ["get", "grainOffset"],
          "text-max-width": 10,
          "text-allow-overlap": false,
          "text-optional": true,
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-letter-spacing": 0.02,
        },
        paint: {
          "text-color": "#fbbf24",
          "text-halo-color": "#000000",
          "text-halo-width": 2,
          "text-halo-blur": 0,
        },
      }

      if (mapContext?.addLayerOrdered) {
        mapContext.addLayerOrdered(siloLabelsLayer)
      } else {
        map.addLayer(siloLabelsLayer)
      }
    }

    markersInitialized = true
    console.log("✅ Marker layers ready")

    // Apply initial visibility state after layers are created
    updateMarkerLayerVisibility()

    refreshMapMarkers()
  }

  function refreshMapMarkers() {
    if (!map || !map.getSource("markers")) return

    if (
      $selectedMarkerStore?.id &&
      $markerVisibilityStore[$selectedMarkerStore.id] === "hidden"
    ) {
      selectedMarkerStore.set(null)
      controlStore.update((controls) => ({
        ...controls,
        showMarkerMenu: false,
      }))
    }

    const visibleMarkers = $confirmedMarkersStore.filter(
      (marker) => ($markerVisibilityStore[marker.id] || "always") !== "hidden",
    )

    const features = visibleMarkers.map((marker) => {
      const baseIcon = getIconImageName(marker.iconClass)
      // The global marker style (chosen in Profile → Marker Settings) is
      // applied to every tintable marker — even ones without their own
      // colour (they resolve to the style's default colour, e.g. circle-fill
      // → blue, icon-only → black, so they still reflect the style).
      const globalStyle = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT
      // The default Mapbox pin recolours its body (white circle stays white)
      // only when it has an explicit colour; otherwise keep the original pin
      // (it doesn't follow the style modes).
      const isDefaultPin = baseIcon === "default"
      // Custom SVG icons keep their glyph's baked-in colours (they look
      // best) but the outer treatment — circle / disc / ring — still
      // follows the selected style so they match the rest of the map.
      // Atlas + Ionic icons tint fully with the chosen colour.
      const isCustomIcon = isCustomSvgIcon(marker.iconClass)
      // Silos are NOT part of the standard marker colouring system — their
      // grain colour (from the same standard palette, legacy keys mapped) is
      // their only colour, and they render in "original" mode so the global
      // marker style / default-colour mode can never affect them.
      const isSilo = marker.iconClass === "custom-svg-silo2"
      // A marker without its own colour (or set to Default) uses the
      // selected style's default colour. The pin keeps its original look
      // unless given an explicit colour.
      const colorKey = isSilo
        ? siloColorKey(marker.grainColor)
        : isDefaultPin
          ? marker.markerColor || MARKER_COLOR_DEFAULT
          : effectiveColorKey(
              marker.markerColor,
              globalStyle,
              { [globalStyle]: defaultColorKeyForMarker(marker) },
            )
      // "random" (the profile's Random fill default) resolves to a random
      // colour per marker — stable via its id so it doesn't change on every
      // re-render. If the resolved key is ever invalid, fall back to a
      // random palette colour so a marker can never silently turn black.
      let colorKeyResolved =
        colorKey === RANDOM_COLOR_KEY ? randomColorForId(marker.id) : colorKey
      if (!MARKER_COLORS.some((c) => c.key === colorKeyResolved)) {
        colorKeyResolved = randomColorForId(marker.id)
      }
      // The marker's own ring follows its fill.
      const useTint =
        isCustomIcon ||
        (isDefaultPin ? colorKey !== MARKER_COLOR_DEFAULT : true)
      const mode = isSilo
        ? "original"
        : isDefaultPin
          ? "default-pin"
          : globalStyle
      // Mode-aware: Original uses the classic palette, every other style the
      // vivid one (both sets share the same colour keys).
      const colorDef = markerColor(colorKeyResolved, mode)
      // Custom icons get a "-g" (glyph-original) suffix so variants cache
      // separately; glass "Icon only" styles add the opacity so moving the
      // slider re-tints; the palette variant suffix so switching palettes
      // re-tints instead of reusing the previous variant's icons.
      const icon = useTint
        ? `${baseIcon}-${colorKeyResolved}-${mode}${isCustomIcon ? "-g" : ""}${glassAlphaSuffix(mode)}${paletteVariantSuffix(mode)}`
        : baseIcon
      if (useTint)
        ensureTintedMarkerIcon(
          baseIcon,
          colorKeyResolved,
          mode,
          isCustomIcon,
          $userSettingsStore?.iconGlassOpacity ?? 0.3,
        )

      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: marker.coordinates,
        },
        properties: {
          id: marker.id,
          icon,
          iconClass: marker.iconClass || "default",
          selected: $selectedMarkerStore?.id === marker.id,
          confirmed: true,
          // Option B: selection ring colour derived from the marker colour.
          selectionColor: colorDef?.dark || "#60a5fa",
          // Add truncated note label for display
          noteLabel: shouldShowNoteLabel(marker)
            ? truncateNote(marker.notes)
            : "",
          noteLabelVisible: shouldShowNoteLabel(marker),
          // Store full notes for reference (not displayed directly)
          hasNotes: !!marker.notes,
          // Silo fill gauge — level + grain colour derived from the marker.
          barImage:
            marker.iconClass === "custom-svg-silo2"
              ? `silo-bar-${siloColorKey(marker.grainColor)}-${siloBarLevel(
                  marker.siloFill,
                )}`
              : null,
          barOffset:
            marker.iconClass === "custom-svg-silo2" ? [0, 56] : null,
          // Silo contents label shown on the map (like the note labels),
          // truncated to 20 chars so long contents don't sprawl.
          grainLabel:
            marker.iconClass === "custom-svg-silo2"
              ? truncateContents(marker.grainType)
              : null,
          // Push the grain label higher when the silo also has a note label.
          grainOffset:
            marker.iconClass === "custom-svg-silo2"
              ? marker.notes
                ? [0, -3.2]
                : [0, -1.6]
              : null,
        },
      }
    })

    // Diagnostic — how the default-colour settings resolved (debugging the
    // "custom default colour isn't working" reports): settings state + a
    // sample of what a few icon classes resolved to.
    const dc = $userSettingsStore || {}
    const dcOverrides = Object.entries(dc.markerTypeDefaultColors || {})
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")
    console.log(
      `🎨 Default colours: mode=${dc.markerDefaultColorMode || "single"}, single=${dc.markerDefaultColor || "blue"}, overrides={${dcOverrides || "none"}}`,
    )
    const seenClasses = new Set()
    const sampleTints = []
    for (const f of features) {
      const cls = f.properties.iconClass || "default"
      if (seenClasses.has(cls)) continue
      seenClasses.add(cls)
      sampleTints.push(`${cls} → ${f.properties.icon}`)
      if (sampleTints.length >= 6) break
    }
    console.log(`🎨 Sample tints: ${sampleTints.join(" | ")}`)

    // Silos render TWO features in the SAME markers layer — the icon feature
    // plus a level-bar feature emitted right after it. Symbol layers draw
    // features in data order (later = on top), so the bar sits just above its
    // own icon but BELOW any marker that comes after it in the array: the bar
    // now follows its parent's layering instead of living in its own layer
    // stacked above every marker.
    const expanded = []
    for (const f of features) {
      expanded.push(f)
      const p = f.properties
      if (p.iconClass === "custom-svg-silo2") {
        expanded.push({
          type: "Feature",
          geometry: f.geometry,
          properties: {
            id: p.id,
            isBar: true,
            iconClass: "custom-svg-silo2",
            // Emit the bar for SELECTED silos too (selected=true → hidden by
            // the layer filter). Otherwise a refresh while selected (e.g.
            // commitSiloMove during a move) DROPS the bar feature and
            // restoreSiloBar has nothing to restore — the bar vanished until
            // the next refresh.
            selected: p.selected,
            confirmed: true,
            barImage: p.barImage,
            barOffset: p.barOffset,
          },
        })
      }
    }

    map.getSource("markers").setData({
      type: "FeatureCollection",
      features: expanded,
    })

    console.log(
      `📍 Refreshed ${expanded.length} markers, ${features.filter((f) => f.properties.noteLabel).length} with notes`,
    )

    updateSelectionOverlay(map)
  }

  function addMarkerToLayer(feature) {
    if (!map || !map.getSource("markers")) return

    const source = map.getSource("markers")
    const data = source._data

    const existingIndex = data.features.findIndex(
      (f) => f.properties.id === feature.properties.id,
    )

    if (existingIndex >= 0) {
      data.features[existingIndex] = feature
    } else {
      data.features.push(feature)
    }

    source.setData(data)
  }

  // Live-move a silo's map feature while dragging (no store write per tick).
  export function moveSiloLive(markerId, coordinates) {
    if (!map || !map.getSource("markers")) return
    // While the DOM selection overlay is live it IS the visible icon — move
    // it directly. The source data is deliberately NOT updated per-tick:
    // setData re-places every symbol on this source (incl. the silo's level
    // bar + grain/note labels) via mapbox's async render loop, which trails
    // the instantly-moving DOM icon by a frame — that's the "bar slowly
    // dragging after the icon" effect. The source catches up on Place
    // (commitSiloMove → store → refreshMapMarkers), so the bar snaps to the
    // silo's new position in one go instead of chasing the drag.
    if (currentOverlay && currentOverlay.id === markerId) {
      currentOverlay.marker.setLngLat(coordinates)
      return
    }
    // No DOM overlay to move (e.g. its icon is still building) — fall back
    // to the source so the drag still visibly tracks (symbol + bar move
    // together in sync, so there is nothing to trail).
    const source = map.getSource("markers")
    const data = source._data
    data.features = data.features.map((f) =>
      f.properties.id === markerId
        ? { ...f, geometry: { ...f.geometry, coordinates } }
        : f,
    )
    source.setData(data)
  }

  // Commit a moved silo's coordinates to the store + selection so the
  // sync/realtime pipeline persists it for everyone.
  export function commitSiloMove(markerId, coordinates) {
    confirmedMarkersStore.update((markers) =>
      markers.map((m) => (m.id === markerId ? { ...m, coordinates } : m)),
    )
    selectedMarkerStore.update((m) =>
      m?.id === markerId ? { ...m, coordinates } : m,
    )
  }

  // Live-update a silo's gauge while the slider is being dragged (no store
  // write yet — the store/sync happens on release). Tinted by grain colour.
  export function updateSiloBarLive(
    markerId,
    fill,
    colorKey = SILO_COLOR_DEFAULT,
  ) {
    // While the silo is selected its symbol-layer bar is hidden (the bar
    // layer excludes selected silos) and the fill bar lives INSIDE the
    // selection overlay — update that DOM bar live so the slider feels
    // instant and synchronized with the popped icon.
    if (currentOverlay && currentOverlay.id === markerId) {
      const barEl = /** @type {HTMLElement | null} */ (
        currentOverlay.el.querySelector(".msv-silo-bar")
      )
      if (barEl) {
        const def = markerColor(siloColorKey(colorKey), "original")
        barEl.style.setProperty(
          "--bar-pct",
          Math.max(0, Math.min(100, fill)) + "%",
        )
        barEl.style.setProperty("--bar-color", def.dark)
        barEl.style.setProperty("--bar-light", def.light)
      }
    }
    // Keep the symbol-layer bar in sync for when the silo is deselected.
    if (!map || !map.getSource("markers")) return
    const source = map.getSource("markers")
    const data = source._data
    data.features = data.features.map((f) =>
      f.properties.id === markerId
        ? {
            ...f,
            properties: {
              ...f.properties,
              barImage: `silo-bar-${siloColorKey(colorKey)}-${siloBarLevel(fill)}`,
            },
          }
        : f,
    )
    source.setData(data)
  }

  function removeMarkerFromLayer(markerId) {
    if (!map || !map.getSource("markers")) return

    const source = map.getSource("markers")
    const data = source._data
    data.features = data.features.filter((f) => f.properties.id !== markerId)
    source.setData(data)
  }

  function updateMarkerSelection(markerId, selected) {
    if (!map || !map.getSource("markers")) return

    // A selected silo's level bar is hidden automatically: its "isBar"
    // feature shares the silo's id, so it gets selected:true here too and is
    // excluded by markers-layer's filter; barImage:null below then keeps it
    // hidden through the deselect shrink. (No separate bar layer to filter.)

    const source = map.getSource("markers")
    const data = source._data

    data.features = data.features.map((f) => {
      const isTarget = f.properties.id === markerId
      const isSilo = f.properties.iconClass === "custom-svg-silo2"
      return {
        ...f,
        properties: {
          ...f.properties,
          selected: isTarget ? selected : false,
          // While the deselected silo's overlay is still shrinking, keep its
          // symbol-layer bar hidden (barImage null) — it's restored when the
          // shrink completes (restoreSiloBar). Otherwise the small bar pops
          // back in mid-shrink, overlapping the shrinking overlay's bar.
          ...(isSilo &&
          isTarget &&
          !selected &&
          currentOverlay &&
          currentOverlay.id === markerId
            ? { barImage: null }
            : {}),
        },
      }
    })

    source.setData(data)
  }

  // Restore a silo's symbol-layer level bar after its selection overlay has
  // finished shrinking. Reads the current fill + grain colour from the store
  // (the bar was set to null in updateMarkerSelection on deselect so it
  // wouldn't pop back in mid-shrink).
  /** @param {string} markerId */
  function restoreSiloBar(markerId) {
    if (!map || !map.getSource("markers")) return
    const marker = ($confirmedMarkersStore || []).find(
      (/** @type {any} */ m) => m.id === markerId,
    )
    if (!marker || marker.iconClass !== "custom-svg-silo2") return
    const source = map.getSource("markers")
    const data = source._data
    data.features = data.features.map(
      (/** @type {any} */ f) =>
        f.properties.id === markerId
          ? {
              ...f,
              properties: {
                ...f.properties,
                barImage: `silo-bar-${siloColorKey(marker.grainColor)}-${siloBarLevel(
                  marker.siloFill,
                )}`,
              },
            }
          : f,
    )
    source.setData(data)
  }

  // ── Per-style marker selection treatment ──
  // FIXED: every style uses the "size pop" selection animation (tight ring
  // hugging the icon, growing to 1.3x + hold). The ring is always WHITE
  // except for the icon-fill style, where it uses the marker's own colour so
  // it doesn't blend into the white disc. (See updateSelectionOverlay.)

  /**
   * The LIVE selection overlay — the currently selected marker's visual.
   * Fully separate from any overlay that is mid-shrink: a handoff hands the
   * old overlay to `shrinkingOverlays` (keyed by marker id) and THIS slot is
   * free for the new marker immediately, so the new and old markers never
   * share a variable (the old shared selectionOverlayMarker/El +
   * lastOverlayKey + shrinkRaf trio let the deselect tween and the new build
   * fight over one piece of state).
   * @type {{ id: string, marker: any, el: HTMLElement, key: string } | null}
   */
  let currentOverlay = null

  /**
   * Overlays that were replaced/deselected and are tweening back to base
   * size before being removed. Each entry keeps its OWN rAF handle and is
   * keyed by marker id, so multiple shrinks can run at once and re-selecting
   * the same marker can cancel its own ghost.
   * @type {Map<string, { marker: any, inner: HTMLElement, raf: number | null }>}
   */
  const shrinkingOverlays = new Map()

  /**
   * Monotonic token for async overlay builds — only the LATEST build may
   * attach its overlay. Prevents two builds for the same key from stacking
   * two overlays on top of each other (the old `lastOverlayKey !== key`
   * check only compared the KEY, so a second updateSelectionOverlay call
   * while a build was in flight started a second build that also passed).
   * @type {number}
   */
  let overlayBuildToken = 0

  /** @type {Map<string, { url: string, px: number }>} */
  const iconDataUrlCache = new Map()

  function destroySelectionOverlay() {
    // Cancel any in-flight async build AND tear down every overlay — the
    // live one plus anything still shrinking.
    overlayBuildToken++
    if (currentOverlay) {
      try {
        currentOverlay.marker.remove()
      } catch (e) {
        /* already removed */
      }
      currentOverlay = null
    }
    for (const entry of shrinkingOverlays.values()) {
      if (entry.raf != null) cancelAnimationFrame(entry.raf)
      try {
        entry.marker.remove()
      } catch (e) {
        /* already removed */
      }
    }
    shrinkingOverlays.clear()
  }

  // Resolve the marker's effective (visual) colour — mirrors refreshMapMarkers.
  /** @param {any} marker */
  function effectiveColorForMarker(marker) {
    const globalStyle = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT
    const isDefaultPin = !marker.iconClass || marker.iconClass === "default"
    const isSilo = marker.iconClass === "custom-svg-silo2"
    let colorKey = isSilo
      ? siloColorKey(marker.grainColor)
      : isDefaultPin
        ? marker.markerColor || MARKER_COLOR_DEFAULT
        : effectiveColorKey(
            marker.markerColor,
            globalStyle,
            { [globalStyle]: defaultColorKeyForMarker(marker) },
          )
    let resolved =
      colorKey === RANDOM_COLOR_KEY ? randomColorForId(marker.id) : colorKey
    if (!MARKER_COLORS.some((c) => c.key === resolved)) {
      resolved = randomColorForId(marker.id)
    }
    const mode = isSilo
      ? "original"
      : isDefaultPin
        ? "default-pin"
        : globalStyle
    return markerColor(resolved, mode)
  }

  // The selection highlight colour. For icon-fill the ring uses the marker's
  // own (effective) colour so it stands out from the white disc; all other
  // styles use a fixed white ring (handled in updateSelectionOverlay).
  /** @param {any} marker */
  function selectionColorForMarker(marker) {
    return effectiveColorForMarker(marker)
  }

  // The default colour a marker with no explicit colour gets, based on the
  // "Marker default colours" mode: a single colour for all, or CUSTOM (a
  // colour per marker type, preselecting a sensible colour for each type and
  // falling back to the single colour). Returns a colour KEY — "random" is
  // resolved to a per-marker colour later.
  /** @param {any} marker @returns {string} */
  function defaultColorKeyForMarker(marker) {
    return markerDefaultColorKey(marker.iconClass, $userSettingsStore || {})
  }

  // The "Icon only" glass disc renders at the user's opacity — the suffix
  // bakes the alpha (0-100) into the tinted-image key so moving the opacity
  // slider re-tints (and re-registers) the icons. Non-glass modes ignore it.
  /** @param {string} mode @returns {string} */
  function glassAlphaSuffix(mode) {
    if (mode !== "icon-dark-glass" && mode !== "icon-light-glass") return ""
    const a = Math.round(($userSettingsStore?.iconGlassOpacity ?? 0.3) * 100)
    return "-a" + a
  }

  // The exact icon image name the symbol layer renders for a marker (same
  // resolution as refreshMapMarkers) — used to cache + key DOM data URLs.
  /** @param {any} marker @returns {string} */
  function markerIconImageName(marker) {
    const baseIcon = getIconImageName(marker.iconClass)
    const globalStyle = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT
    const isDefaultPin = baseIcon === "default"
    const isCustomIcon = isCustomSvgIcon(marker.iconClass)
    const isSilo = marker.iconClass === "custom-svg-silo2"
    const colorKey = isSilo
      ? siloColorKey(marker.grainColor)
      : isDefaultPin
        ? marker.markerColor || MARKER_COLOR_DEFAULT
        : effectiveColorKey(
            marker.markerColor,
            globalStyle,
            { [globalStyle]: defaultColorKeyForMarker(marker) },
          )
    let colorKeyResolved =
      colorKey === RANDOM_COLOR_KEY ? randomColorForId(marker.id) : colorKey
    if (!MARKER_COLORS.some((c) => c.key === colorKeyResolved)) {
      colorKeyResolved = randomColorForId(marker.id)
    }
    const useTint =
      isCustomIcon ||
      (isDefaultPin ? colorKey !== MARKER_COLOR_DEFAULT : true)
    const mode = isSilo
      ? "original"
      : isDefaultPin
        ? "default-pin"
        : globalStyle
    return useTint
      ? `${baseIcon}-${colorKeyResolved}-${mode}${isCustomIcon ? "-g" : ""}${glassAlphaSuffix(mode)}${paletteVariantSuffix(mode)}`
      : baseIcon
  }

  // Build + register the tinted icon name for a marker being previewed before
  // it's confirmed (e.g. a brand-new marker in the placement menu) so the map
  // shows the colour/style live. Mirrors markerIconImageName and registers
  // the tint so the symbol layer can render it immediately.
  /**
   * @param {string} iconClass
   * @param {string} colorKey
   * @param {string} markerId
   * @returns {string}
   */
  function resolvePreviewTintName(iconClass, colorKey, markerId) {
    const baseIcon = getIconImageName(iconClass)
    const globalStyle = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT
    const isCustomIcon = isCustomSvgIcon(iconClass)
    const isDefaultPin = baseIcon === "default"
    const mode = isDefaultPin ? "default-pin" : globalStyle
    let resolved = colorKey
    if (!resolved || resolved === MARKER_COLOR_DEFAULT) {
      resolved = markerDefaultColorKey(iconClass, $userSettingsStore || {})
    }
    if (resolved === RANDOM_COLOR_KEY) resolved = randomColorForId(markerId)
    // No user-set default → the style's neutral default (STYLE_DEFAULT_COLORS).
    if (!resolved || !MARKER_COLORS.some((c) => c.key === resolved)) {
      resolved = styleDefaultColor(globalStyle)
    }
    const useTint =
      isCustomIcon ||
      (isDefaultPin ? resolved !== MARKER_COLOR_DEFAULT : true)
    const name = useTint
      ? `${baseIcon}-${resolved}-${mode}${isCustomIcon ? "-g" : ""}${glassAlphaSuffix(mode)}${paletteVariantSuffix(mode)}`
      : baseIcon
    if (useTint) {
      ensureTintedMarkerIcon(
        baseIcon,
        resolved,
        mode,
        isCustomIcon,
        $userSettingsStore?.iconGlassOpacity ?? 0.3,
        true,
      )
    }
    return name
  }

  // The marker's rendered (tinted) icon as a data URL, so DOM-based
  // treatments can embed the exact image the symbol layer shows.
  /** @param {any} marker @returns {Promise<{ url: string, px: number } | null>} */
  function tintedIconDataUrl(marker) {
    const imageName = markerIconImageName(marker)
    const cached = iconDataUrlCache.get(imageName)
    if (cached) return Promise.resolve(cached)
    const baseIcon = getIconImageName(marker.iconClass)
    const globalStyle = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT
    const isDefaultPin = baseIcon === "default"
    const isCustomIcon = isCustomSvgIcon(marker.iconClass)
    const isSilo = marker.iconClass === "custom-svg-silo2"
    const colorKey = isSilo
      ? siloColorKey(marker.grainColor)
      : isDefaultPin
        ? marker.markerColor || MARKER_COLOR_DEFAULT
        : effectiveColorKey(
            marker.markerColor,
            globalStyle,
            { [globalStyle]: defaultColorKeyForMarker(marker) },
          )
    let colorKeyResolved =
      colorKey === RANDOM_COLOR_KEY ? randomColorForId(marker.id) : colorKey
    if (!MARKER_COLORS.some((c) => c.key === colorKeyResolved)) {
      colorKeyResolved = randomColorForId(marker.id)
    }
    const useTint =
      isCustomIcon ||
      (isDefaultPin ? colorKey !== MARKER_COLOR_DEFAULT : true)
    const mode = isSilo
      ? "original"
      : isDefaultPin
        ? "default-pin"
        : globalStyle
    // Proof of concept: SVG-rendered icons compose the same image the symbol
    // layer shows (no pixel tinting), so the selection overlay matches.
    if (isSvgRenderedIcon(marker.iconClass)) {
      return renderSvgMarkerCanvas(
        marker.iconClass,
        colorKeyResolved,
        mode,
        $userSettingsStore?.iconGlassOpacity ?? 0.3,
      ).then((canvas) => {
        const info = {
          url: canvas.toDataURL(),
          px: Math.max(20, Math.round(canvas.height * 0.35)),
        }
        iconDataUrlCache.set(imageName, info)
        return info
      })
    }
    const colorDef = markerColor(colorKeyResolved, mode)
    const p = getIconBaseCanvas(baseIcon).then((src) => {
      if (!src) return null
      const canvas = document.createElement("canvas")
      canvas.width = src.width
      canvas.height = src.height
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(src, 0, 0)
      if (useTint) {
        tintMarkerCanvas(canvas, colorDef, mode, {
          keepGlyphOriginal: isCustomIcon,
          glassAlpha: $userSettingsStore?.iconGlassOpacity ?? 0.3,
        })
      }
      const info = {
        url: canvas.toDataURL(),
        px: Math.max(20, Math.round(src.height * 0.35)),
      }
      iconDataUrlCache.set(imageName, info)
      return info
    })
    return p
  }

  /**
   * Build the DOM selection overlay for the "size pop" treatment. The
   * marker's icon is embedded inside the overlay so the icon + tight ring
   * animate together as ONE CSS element (msv-pop-big → grow to 1.3x + hold)
   * — no per-frame icon-size animation, so it stays smooth and in sync. If
   * the icon can't be built, falls back to a ring-only overlay (the symbol
   * marker stays visible underneath). For SILOS a fill bar is appended as a
   * child of .msv-inner (below the icon) so it pops WITH the icon and is
   * never covered — the symbol-layer bar is hidden for the selected silo.
   * @param {any} colorDef
   * @param {{ url: string, px: number } | null} [iconInfo]
   * @param {{ fill: number, color: string, light: string } | null} [siloInfo]
   */
  function buildSelectionElement(colorDef, iconInfo = null, siloInfo = null) {
    const el = document.createElement("div")
    el.className = "marker-selection-overlay"
    el.style.setProperty("--sel", colorDef?.dark || "#60a5fa")
    el.style.setProperty("--selc", colorDef?.light || "#bfdbfe")

    if (iconInfo) {
      const inner = document.createElement("div")
      inner.className = "msv-inner"
      inner.style.width = iconInfo.px + "px"
      inner.style.height = iconInfo.px + "px"
      inner.style.marginLeft = -(iconInfo.px / 2) + "px"
      inner.style.marginTop = -(iconInfo.px / 2) + "px"
      const icon = document.createElement("div")
      icon.className = "msv-icon"
      icon.style.backgroundImage = "url('" + iconInfo.url + "')"
      inner.appendChild(icon)
      // Stash which entrance animation to play — it's started by the caller
      // in the SAME frame the overlay is placed on the map (see
      // updateSelectionOverlay), so the new icon's very first paint is
      // already the correct popped state.
      el.dataset.msvAnim = "msv-pop-big"
      // Tight no-gap ring hugging the icon, pops with it to 1.3x + hold.
      const ring = document.createElement("div")
      ring.className = "msv-ring-tight"
      inner.appendChild(ring)
      // Silo fill bar — a child of .msv-inner so it pops WITH the icon and
      // stays just below it (never covered, no laggy re-place).
      if (siloInfo) {
        const bar = document.createElement("div")
        bar.className = "msv-silo-bar"
        bar.style.setProperty(
          "--bar-pct",
          Math.max(0, Math.min(100, siloInfo.fill)) + "%",
        )
        bar.style.setProperty("--bar-color", siloInfo.color)
        bar.style.setProperty("--bar-light", siloInfo.light)
        inner.appendChild(bar)
        // "Storing" label — a child of .msv-inner so it POPS with the icon
        // (grows + moves above it) instead of being covered by the enlarged
        // icon. The symbol-layer label is hidden for the selected silo.
        if (siloInfo.label) {
          const lbl = document.createElement("div")
          lbl.className = "msv-silo-label"
          lbl.textContent = siloInfo.label
          inner.appendChild(lbl)
        }
      }
      el.appendChild(inner)
      return el
    }

    // Icon unresolvable → ring-only fallback; the marker stays in the
    // symbol layer and just the tight ring overlay is shown.
    el.innerHTML = '<div class="msv-ring-tight"></div>'
    return el
  }

  /** @param {any} [m] */
  function stopSelectedSize(m) {
    // DOM-based treatments don't animate icon-size; keep the layer at base.
    if (m && m.getLayer && m.getLayer("markers-selected-layer")) {
      try {
        m.setLayoutProperty("markers-selected-layer", "icon-size", 0.35)
      } catch (e) {
        /* noop */
      }
    }
  }

  // Hide/show the symbol-layer selected marker. The size-pop treatment
  // embeds the marker's icon in the DOM overlay, so the symbol marker
  // underneath must be hidden — otherwise translucent styles (icon only /
  // glass discs) show the original marker ghosting through. icon-opacity is
  // a PAINT property (setLayoutProperty throws for it in mapbox 1.x).
  // Opacity-0 symbols are still returned by queryRenderedFeatures, so
  // click-to-select/deselect keeps working.
  /** @param {any} m @param {boolean} hidden */
  function setSelectedLayerHidden(m, hidden) {
    if (m && m.getLayer && m.getLayer("markers-selected-layer")) {
      try {
        m.setPaintProperty(
          "markers-selected-layer",
          "icon-opacity",
          hidden ? 0 : 1,
        )
      } catch (e) {
        /* noop */
      }
    }
  }

  // Tween an overlay's .msv-inner back to scale 1 (base size), then remove
  // its marker from the map. The entry keeps its OWN rAF handle and onDone
  // runs after removal, so several shrinks can run concurrently with zero
  // shared state. Used both for a true deselect (reveal the symbol marker
  // after) and for a marker→marker handoff (the new overlay builds meanwhile).
  /** @param {{ marker: any, inner: HTMLElement, raf: number | null }} entry @param {() => void} onDone */
  function tweenShrinkOut(entry, onDone) {
    const inner = entry.inner
    // Measure the current scale, stop the CSS animation and take over with a
    // JS tween back to scale 1 so it never jumps.
    const t = getComputedStyle(inner).transform
    let from = 1
    if (t && t !== "none") {
      const parts = t.match(
        /matrix\(([^,]+),\s*[^,]+,\s*[^,]+,\s*([^,]+)/,
      )
      if (parts) {
        from = Math.max(parseFloat(parts[1]), parseFloat(parts[2]))
      }
    }
    inner.classList.remove("msv-pop-big")
    inner.style.transform = "scale(" + from + ")"
    const start = performance.now()
    const DUR = 200
    /** @param {number} now */
    const step = (now) => {
      const p = Math.min(1, (now - start) / DUR)
      const s = from + (1 - from) * (1 - Math.pow(1 - p, 3))
      inner.style.transform = "scale(" + s + ")"
      if (p < 1) {
        entry.raf = requestAnimationFrame(step)
      } else {
        entry.raf = null
        try {
          entry.marker.remove()
        } catch (e) {
          /* noop */
        }
        onDone()
      }
    }
    entry.raf = requestAnimationFrame(step)
  }

  // Move an overlay out of the "current" slot and into its own self-contained
  // shrink tween, keyed by marker id. A marker can only have ONE shrinking
  // overlay — re-selecting it mid-shrink removes the ghost so the fresh pop
  // never doubles up on it. Ring-only overlays (no .msv-inner) remove
  // instantly. onDone runs after the overlay is off the map.
  /** @param {any} overlayMarker @param {HTMLElement} overlayEl @param {string} markerId @param {() => void} onDone */
  function startOverlayShrink(overlayMarker, overlayEl, markerId, onDone) {
    const inner = overlayEl
      ? /** @type {HTMLElement | null} */ (overlayEl.querySelector(".msv-inner"))
      : null
    if (!inner) {
      try {
        overlayMarker.remove()
      } catch (e) {
        /* noop */
      }
      onDone()
      return
    }
    const existing = shrinkingOverlays.get(markerId)
    if (existing) {
      if (existing.raf != null) cancelAnimationFrame(existing.raf)
      try {
        existing.marker.remove()
      } catch (e) {
        /* noop */
      }
      shrinkingOverlays.delete(markerId)
    }
    const entry = { marker: overlayMarker, inner, raf: null }
    shrinkingOverlays.set(markerId, entry)
    tweenShrinkOut(entry, () => {
      if (shrinkingOverlays.get(markerId) === entry) {
        shrinkingOverlays.delete(markerId)
      }
      onDone()
    })
  }

  // Smoothly shrink the CURRENT selection overlay back to base size, then
  // reveal the underlying symbol-layer marker — so deselecting an enlarged
  // marker eases back down instead of popping away abruptly.
  /** @param {any} m */
  function shrinkSelectionOverlay(m) {
    const old = currentOverlay
    currentOverlay = null
    overlayBuildToken++ // no in-flight build may attach for the deselected marker
    if (!old) {
      setSelectedLayerHidden(m, false)
      return
    }
    startOverlayShrink(old.marker, old.el, old.id, () => {
      // Only reveal the symbol marker if nothing is selected anymore — if
      // the user re-selected during the shrink, the new overlay handles
      // symbol visibility.
      if (!/** @type {any} */ ($selectedMarkerStore)) {
        setSelectedLayerHidden(m, false)
      }
      // The shrink is over — bring the silo's level bar back (it was hidden
      // for the duration of the shrink so it didn't pop in mid-animation).
      restoreSiloBar(old.id)
    })
  }

  // Create/update/destroy the per-style selection visual for the selected
  // marker. Called from refreshMapMarkers so it tracks style/colour/moves,
  // and from the reactive block so it tracks selection changes.
  //
  // The selection treatment is now FIXED: every style uses the "size pop"
  // animation (tight ring hugging the icon that pops to 1.3x and holds), and
  // the ring is always WHITE except for the icon-fill style, where it uses
  // the marker's own colour (so the white ring doesn't blend into the white
  // disc behind the icon).
  /** @param {any} m */
  function updateSelectionOverlay(m) {
    const selId = /** @type {any} */ ($selectedMarkerStore)?.id
    const marker = selId
      ? /** @type {any[]} */ ($confirmedMarkersStore).find(
          (x) => x.id === selId,
        ) || null
      : null
    if (!m || !marker || $layerVisibilityStore?.markers === false) {
      stopSelectedSize(m)
      shrinkSelectionOverlay(m)
      return
    }
    // The selection overlay shows the LIVE preview while the marker menu's
    // icon picker is open: selectedMarkerStore carries the previewed icon
    // class (written by previewIcon on every grid click), confirmedMarkersStore
    // the committed state. Merging the two means previewing an icon (e.g. the
    // silo, which is deliberately NOT committed until Save) still renders the
    // previewed icon + silo bar on the map, WITHOUT flipping selectedIsSilo
    // (that reads confirmedMarkersStore) — so the marker menu stays open until
    // Save converts it.
    const previewIconClass = /** @type {any} */ ($selectedMarkerStore)
      ?.iconClass
    const effectiveMarker =
      previewIconClass && previewIconClass !== marker.iconClass
        ? { ...marker, iconClass: previewIconClass }
        : marker
    const globalStyle = $userSettingsStore?.markerStyle || TINT_MODE_DEFAULT
    // Animation is always size-pop; the ring is always white except for
    // icon-fill, where it uses the marker's own colour.
    const visual = "size-pop"
    const ringChoice = globalStyle === "icon-fill" ? "marker" : "white"
    const colorDef =
      ringChoice === "marker"
        ? selectionColorForMarker(effectiveMarker)
        : { dark: "#ffffff", light: "#f8fafc" }

    // Selected silos carry their own fill bar INSIDE the pop overlay (the
    // symbol-layer bar is hidden for the selected silo), so compute its
    // fill + grain colour here — it pops with the icon, never covered. The
    // bar mirrors the symbol-layer gauge (light→dark gradient).
    const isSilo = effectiveMarker.iconClass === "custom-svg-silo2"
    const siloInfo = isSilo
      ? (() => {
          const def = markerColor(
            siloColorKey(effectiveMarker.grainColor),
            "original",
          )
          return {
            fill: effectiveMarker.siloFill ?? 0,
            color: def.dark,
            light: def.light,
            label: (effectiveMarker.grainType || "").trim(),
          }
        })()
      : null

    // Key: rebuild (restarting the entrance animation) whenever the marker,
    // style or icon image changes; otherwise reuse + move.
    const baseIcon = getIconImageName(effectiveMarker.iconClass)
    const iconKey = `tint-${markerIconImageName(effectiveMarker)}`
    const overlayKey = `${selId}|${visual}|${ringChoice}|${iconKey}`
    if (currentOverlay && currentOverlay.key === overlayKey) {
      currentOverlay.marker.setLngLat(effectiveMarker.coordinates)
      return
    }

    // Handoff: the current overlay becomes a self-contained shrinking overlay
    // (it stays on the map until ITS OWN tween ends) while the new overlay
    // builds — smooth marker→marker transition instead of an abrupt flicker.
    // The new marker gets completely separate state; nothing about it can
    // cancel or overwrite the old one's shrink.
    const old = currentOverlay
    currentOverlay = null
    if (old) {
      startOverlayShrink(old.marker, old.el, old.id, () => {
        /* the new overlay manages its own symbol visibility */
        // Bring the replaced silo's level bar back after its shrink ends.
        restoreSiloBar(old.id)
      })
    }
    // If the SAME marker is being re-selected while its ghost is still
    // shrinking, drop the ghost so the fresh pop doesn't stack on it.
    const ghost = shrinkingOverlays.get(selId)
    if (ghost) {
      if (ghost.raf != null) cancelAnimationFrame(ghost.raf)
      try {
        ghost.marker.remove()
      } catch (e) {
        /* noop */
      }
      shrinkingOverlays.delete(selId)
    }
    // Only the LATEST build may attach — re-running this for the same key
    // while a build is in flight no longer stacks a duplicate overlay.
    const myToken = ++overlayBuildToken

    // For SILOS the underlying symbol is hidden IMMEDIATELY — keeping it
    // visible while the icon builds made the "initial silo" linger for
    // ~200ms and (with its symbol bar) read as two overlapping bars. The
    // selection overlay pops in once the icon is ready. Other markers keep
    // the symbol visible during the build (avoids the marker→marker blink),
    // hidden in the SAME frame the overlay is inserted so the swap is atomic.
    setSelectedLayerHidden(m, isSilo)
    tintedIconDataUrl(effectiveMarker).then((info) => {
      if (myToken !== overlayBuildToken) return
      const el = buildSelectionElement(colorDef, info, siloInfo)
      // Place the new overlay on the NEXT frame and start its pop in that
      // SAME frame — so the new icon's very first paint is already the
      // correct popped icon at its final position.
      requestAnimationFrame(() => {
        if (myToken !== overlayBuildToken) return
        if (info) {
          // Icon overlay: hide the symbol in the same frame the overlay
          // appears, so the swap is atomic (no gap, no ghost).
          setSelectedLayerHidden(m, true)
          const anim = el.dataset.msvAnim
          if (anim) {
            const inner = el.querySelector(".msv-inner")
            if (inner) inner.classList.add(anim)
          }
        } else {
          // Icon couldn't be built → ring-only fallback; symbol stays visible.
          setSelectedLayerHidden(m, false)
        }
        currentOverlay = {
          id: selId,
          marker: new mapboxgl.Marker({
            element: el,
            anchor: "center",
          })
            .setLngLat(effectiveMarker.coordinates)
            .addTo(m),
          el,
          key: overlayKey,
        }
      })
    })
  }

  // Keep the per-style selection overlay in sync when the selected marker
  // changes. Marker selection/deselection does NOT go through
  // refreshMapMarkers, so react to the stores directly here — they're passed
  // as explicit arguments so Svelte tracks them as reactive dependencies.
  $: if (map && markersInitialized) {
    updateSelectionOverlayForSelection(
      map,
      $selectedMarkerStore,
      $layerVisibilityStore,
      $userSettingsStore,
    )
  }

  /**
   * @param {any} m
   * @param {any} sel
   * @param {any} layerVis
   * @param {any} settings
   */
  function updateSelectionOverlayForSelection(m, sel, layerVis, settings) {
    updateSelectionOverlay(m)
  }

  // Update a marker's note label on the map
  function updateMarkerNoteLabel(
    markerId,
    notes,
    noteLabelVisible = undefined,
  ) {
    if (!map || !map.getSource("markers")) return

    const source = map.getSource("markers")
    const data = source._data
    const marker = ($confirmedMarkersStore || []).find((m) => m.id === markerId)
    const shouldShow = noteLabelVisible ?? shouldShowNoteLabel(marker)

    const featureIndex = data.features.findIndex(
      (f) => f.properties.id === markerId,
    )

    if (featureIndex >= 0) {
      data.features[featureIndex].properties.noteLabel = shouldShow
        ? truncateNote(notes)
        : ""
      data.features[featureIndex].properties.noteLabelVisible = shouldShow
      data.features[featureIndex].properties.hasNotes = !!notes
      source.setData(data)
      console.log(`📝 Updated note label for marker ${markerId}`)
    }
  }

  function getCurrentIconClass(markerId) {
    if (
      $selectedMarkerStore?.id === markerId &&
      $selectedMarkerStore.iconClass
    ) {
      return $selectedMarkerStore.iconClass
    }

    if (!map || !map.getSource("markers")) return "default"

    const source = map.getSource("markers")
    const data = source._data
    const feature = data.features.find((f) => f.properties.id === markerId)
    return feature?.properties.iconClass || "default"
  }

  function hasUnconfirmedSelectedMarker() {
    const selectedId = $selectedMarkerStore?.id
    if (!selectedId || !map?.getSource?.("markers")) return false
    if (
      ($confirmedMarkersStore || []).some((marker) => marker.id === selectedId)
    ) {
      return false
    }

    const source = map.getSource("markers")
    const data = source?._data
    const feature = data?.features?.find((f) => f.properties.id === selectedId)

    return feature?.properties?.confirmed === false
  }

  // Public method called by MapViewer's layer interaction system for marker placement (long press)
  export function handleMarkerPlacement(lngLat) {
    if (!map) return

    console.log("Placing marker at:", lngLat)

    if ($selectedMarkerStore) {
      removeMarkerFromLayer($selectedMarkerStore.id)
    }

    // Get default marker from userSettingsStore
    const defaultMarker = getDefaultMarker()
    console.log("🎯 Using default marker:", defaultMarker)

    // Convert the default marker to proper iconClass format for storage
    const { iconClass, iconImageName } = getMarkerIconClasses(defaultMarker)

    console.log(
      "🔧 Converted iconClass:",
      iconClass,
      "iconImageName:",
      iconImageName,
    )

    const id = uuidv4()
    const feature = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lngLat.lng, lngLat.lat],
      },
      properties: {
        id,
        icon: iconImageName,
        iconClass: iconClass,
        selected: true,
        confirmed: false,
        noteLabel: null,
        noteLabelVisible: true,
        hasNotes: false,
      },
    }

    console.log("📍 Feature being added:", feature)

    addMarkerToLayer(feature)
    selectedMarkerStore.set({
      id,
      coordinates: [lngLat.lng, lngLat.lat],
      iconClass,
    })

    // Gold ripple on initial placement
    showPlacementRipple([lngLat.lng, lngLat.lat])

    // Set default visibility to 'always' for new markers
    markerVisibilityStore.setMarkerVisibility(id, "always")

    quickCenterOnMarker([lngLat.lng, lngLat.lat])

    // Auto-confirm if setting is enabled — skip the edit panel
    if ($userSettingsStore?.autoConfirmMarkers) {
      const markerData = {
        id,
        coordinates: [lngLat.lng, lngLat.lat],
        iconClass,
        noteLabelVisible: true,
        created_at: new Date().toISOString(),
      }

      confirmedMarkersStore.update((markers) => {
        const existingIndex = markers.findIndex((m) => m.id === id)
        if (existingIndex >= 0) {
          markers[existingIndex] = markerData
          return markers
        }
        return [...markers, markerData]
      })

      // Green ripple — auto-confirmed
      const markerDef = findMarkerByIconClass(iconClass)
      showPlacementRipple(
        [lngLat.lng, lngLat.lat],
        "rgba(34, 197, 94",
        markerDef?.name || "Marker",
      )

      updateMarkerSelection(id, false)
      selectedMarkerStore.set(null)

      if ($userSettingsStore?.zoomToPlacedMarkers) {
        map.flyTo({
          center: [lngLat.lng, lngLat.lat],
          zoom: 15,
          duration: 1000,
        })
      }
    } else {
      controlStore.update((controls) => ({
        ...controls,
        showMarkerMenu: true,
      }))
    }
  }

  // Remove camera zoom on selection
  export function handleMarkerSelection(event) {
    if (!map) return

    console.log("🎯 MarkerManager: Marker selection called with event:", event)

    // Handle deselection (empty features array)
    if (!event.features || event.features.length === 0) {
      console.log("🎯 MarkerManager: Deselecting marker")
      if ($selectedMarkerStore) {
        updateMarkerSelection($selectedMarkerStore.id, false)
        selectedMarkerStore.set(null)
      }
      controlStore.update((controls) => ({
        ...controls,
        showMarkerMenu: false,
      }))
      return
    }

    // Extract marker ID from the event
    const feature = event.features[0]
    const markerId = feature.properties.id
    const coordinates = feature.geometry.coordinates

    console.log("🎯 MarkerManager: Selecting marker:", markerId)

    updateMarkerSelection(markerId, true)
    selectedMarkerStore.set({
      id: markerId,
      coordinates: coordinates,
    })

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: true,
    }))
  }

  // Confirm marker - mark as confirmed so circle will show on future selections
  function confirmMarker() {
    if ($selectedMarkerStore) {
      const { id, coordinates } = $selectedMarkerStore
      const iconClass = getCurrentIconClass(id)

      const markerData = {
        id,
        coordinates,
        iconClass,
        noteLabelVisible: true,
        created_at: new Date().toISOString(),
      }

      console.log("Confirming marker:", markerData)

      confirmedMarkersStore.update((markers) => {
        const existingIndex = markers.findIndex((m) => m.id === id)
        if (existingIndex >= 0) {
          markers[existingIndex] = markerData
          return markers
        }
        return [...markers, markerData]
      })

      // Green ripple on confirmation
      const markerDef = findMarkerByIconClass(iconClass)
      showPlacementRipple(
        coordinates,
        "rgba(34, 197, 94",
        markerDef?.name || "Marker",
      )

      updateMarkerSelection(id, false)
      selectedMarkerStore.set(null)
    }

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: false,
    }))
  }

  // Remove marker
  function removeMarker() {
    if ($selectedMarkerStore) {
      const { id, coordinates } = $selectedMarkerStore
      const iconClass = getCurrentIconClass(id)
      const markerDef = findMarkerByIconClass(iconClass)
      const markerName = markerDef?.name || "Marker"

      // Play removal animation before removing
      if (coordinates) {
        showRemovalAnimation(coordinates, markerName)
      }

      confirmedMarkersStore.update((markers) =>
        markers.filter((m) => m.id !== id),
      )

      // Remove from visibility store
      markerVisibilityStore.update((settings) => {
        const { [id]: removed, ...rest } = settings
        return rest
      })

      removeMarkerFromLayer(id)
      selectedMarkerStore.set(null)
    }

    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: false,
    }))
  }

  // ═══════════════════════════════════════════════════════
  //  Collection Mode — auto-delete markers by proximity
  // ═══════════════════════════════════════════════════════

  /** Delete a marker by ID without requiring it to be selected first */
  export function collectMarkerById(markerId, animStyle = "red") {
    const markers = /** @type {any[]} */ ([])
    const unsub = confirmedMarkersStore.subscribe((m) => markers.push(...m))
    unsub()

    const marker = markers.find((m) => m.id === markerId)
    if (!marker) return

    // Play animation
    const markerDef = findMarkerByIconClass(marker.iconClass)
    const markerName = markerDef?.name || "Marker"
    if (marker.coordinates) {
      if (animStyle === "green") {
        showCollectAnimation(marker.coordinates, markerName)
      } else {
        showRemovalAnimation(marker.coordinates, markerName)
      }
    }

    confirmedMarkersStore.update((ms) => ms.filter((m) => m.id !== markerId))
    markerVisibilityStore.update((settings) => {
      const { [markerId]: removed, ...rest } = settings
      return rest
    })
    removeMarkerFromLayer(markerId)

    // Deselect if this was the selected marker
    if ($selectedMarkerStore?.id === markerId) {
      selectedMarkerStore.set(null)
      controlStore.update((c) => ({ ...c, showMarkerMenu: false }))
    }
  }

  // Haversine distance (meters) between two [lng, lat] and {latitude, longitude}
  function haversineDistanceLngLat(lngLat, coords) {
    const toRad = (deg) => (deg * Math.PI) / 180
    const R = 6371000
    const dLat = toRad(coords.latitude - lngLat[1])
    const dLon = toRad(coords.longitude - lngLat[0])
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lngLat[1])) *
        Math.cos(toRad(coords.latitude)) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  // Track recently-collected IDs to avoid double-triggers
  const recentlyCollected = new Set()

  let collectionModeUnsubscribe = null
  let vehicleUnsubscribe = null

  function startCollectionWatcher() {
    if (vehicleUnsubscribe) return // already watching

    vehicleUnsubscribe = userVehicleStore.subscribe((vehicle) => {
      if (!vehicle?.coordinates?.latitude) return

      let collectionState
      const unsub = collectionModeStore.subscribe((s) => (collectionState = s))
      unsub()

      if (!collectionState?.enabled) return

      const { radius, targetIconClasses, animationStyle } = collectionState
      const userCoords = vehicle.coordinates

      let currentMarkers = []
      const munsub = confirmedMarkersStore.subscribe(
        (m) => (currentMarkers = m),
      )
      munsub()

      for (const m of currentMarkers) {
        if (recentlyCollected.has(m.id)) continue
        if (!m.coordinates) continue

        // Check if marker type matches targets
        const iconClass = m.iconClass || "default"
        if (!targetIconClasses.has(iconClass)) continue

        const dist = haversineDistanceLngLat(m.coordinates, userCoords)
        if (dist <= radius) {
          recentlyCollected.add(m.id)
          collectMarkerById(m.id, animationStyle)
          // Mark dot green on the route planner
          collectionRouteStore.markCollected(m.id)

          // Clean up the set after a delay
          setTimeout(() => recentlyCollected.delete(m.id), 5000)
        }
      }
    })
  }

  function stopCollectionWatcher() {
    if (vehicleUnsubscribe) {
      vehicleUnsubscribe()
      vehicleUnsubscribe = null
    }
    recentlyCollected.clear()
  }

  async function placeMarkerAtCurrentLocation() {
    if (!map) return

    const coordinates = $locationMarkerStore
    if (!coordinates) return

    const defaultMarker = getDefaultMarker()
    console.log(
      "🎯 Using default marker for location placement:",
      defaultMarker,
    )

    const { iconClass } = getMarkerIconClasses(defaultMarker)

    const id = uuidv4()
    const markerData = {
      id,
      coordinates: [coordinates.longitude, coordinates.latitude],
      iconClass: iconClass,
      noteLabelVisible: true,
      created_at: new Date().toISOString(),
    }

    confirmedMarkersStore.update((markers) => [...markers, markerData])

    // Set default visibility to 'always' for new markers
    markerVisibilityStore.setMarkerVisibility(id, "always")

    // Green ripple - quick-drop is auto-confirmed
    showPlacementRipple(
      [coordinates.longitude, coordinates.latitude],
      "rgba(34, 197, 94",
      defaultMarker?.name || "Marker",
    )

    if ($userSettingsStore?.zoomToLocationMarkers) {
      map.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 15,
        duration: 1000,
      })
    }
  }

  async function placeExtraMarkerAtCurrentLocation() {
    if (!map) return

    const payload = $extraLocationMarkerStore
    if (!payload || !payload.coordinates || !payload.marker) return

    const { coordinates, marker: extraMarker } = payload

    console.log("🎯 Using extra marker for location placement:", extraMarker)

    let iconClass

    if (extraMarker.class === "default") {
      iconClass = "default"
    } else if (extraMarker.class === "custom-svg") {
      iconClass = `custom-svg-${extraMarker.id}`
    } else {
      iconClass = extraMarker.class
    }

    const id = uuidv4()
    const markerData = {
      id,
      coordinates: [coordinates.longitude, coordinates.latitude],
      iconClass: iconClass,
      noteLabelVisible: true,
      created_at: new Date().toISOString(),
    }

    confirmedMarkersStore.update((markers) => [...markers, markerData])

    // Set default visibility to 'always' for new markers
    markerVisibilityStore.setMarkerVisibility(id, "always")

    // Green ripple - quick-drop is auto-confirmed
    showPlacementRipple(
      [coordinates.longitude, coordinates.latitude],
      "rgba(34, 197, 94",
      extraMarker?.name || "Marker",
    )

    if ($userSettingsStore?.zoomToLocationMarkers) {
      map.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 15,
        duration: 1000,
      })
    }
  }

  // Cleanup function
  function cleanup() {
    if (contextCheckInterval) {
      clearInterval(contextCheckInterval)
      contextCheckInterval = null
    }

    console.log("🎯 MarkerManager cleanup completed")
  }

  onMount(() => {
    console.log(
      "MarkerManager mounted with coordinatedEvents:",
      coordinatedEvents,
    )

    contextCheckInterval = setInterval(syncWithGlobalSelection, 500)

    locationMarkerUnsubscribe = locationMarkerStore.subscribe((timestamp) => {
      if (timestamp) placeMarkerAtCurrentLocation()
    })

    extraLocationMarkerUnsubscribe = extraLocationMarkerStore.subscribe(
      (payload) => {
        if (payload && payload.timestamp) placeExtraMarkerAtCurrentLocation()
      },
    )

    confirmedMarkersUnsubscribe = confirmedMarkersStore.subscribe((markers) => {
      if (markersInitialized && map) refreshMapMarkers()
    })

    // Re-render all markers when the global marker style, the per-style
    // default colours, or the icon-only glass opacity changes.
    globalStyleUnsubscribe = userSettingsStore.subscribe((settings) => {
      const style = settings?.markerStyle || TINT_MODE_DEFAULT
      const glassOpacity = settings?.iconGlassOpacity ?? 0.3
      const defaultColors = {
        mode: settings?.markerDefaultColorMode || "single",
        color: settings?.markerDefaultColor || "blue",
        perType: settings?.markerTypeDefaultColors || {},
      }
      if (
        style !== lastGlobalStyle ||
        glassOpacity !== lastGlassOpacity ||
        JSON.stringify(defaultColors) !== JSON.stringify(lastDefaultColors)
      ) {
        lastGlobalStyle = style
        lastGlassOpacity = glassOpacity
        lastDefaultColors = defaultColors
        if (markersInitialized && map) refreshMapMarkers()
      }
    })

    remoteRippleUnsubscribe = remoteMarkerRippleStore.subscribe((event) => {
      if (event && event.coordinates) {
        showPlacementRipple(event.coordinates, "rgba(34, 197, 94")
      }
    })

    remoteEditUnsubscribe = remoteMarkerEditStore.subscribe((event) => {
      if (event && event.coordinates) {
        showEditRipple(event.coordinates)
      }
    })

    remoteDeleteUnsubscribe = remoteMarkerDeleteStore.subscribe((event) => {
      if (event && event.coordinates) {
        showRemovalAnimation(event.coordinates)
      }
    })

    // Watch collection mode toggle to start/stop watcher
    collectionModeUnsubscribe = collectionModeStore.subscribe((state) => {
      if (state.enabled) {
        startCollectionWatcher()
      } else {
        stopCollectionWatcher()
      }
    })
  })

  onDestroy(() => {
    if (locationMarkerUnsubscribe) locationMarkerUnsubscribe()
    if (extraLocationMarkerUnsubscribe) extraLocationMarkerUnsubscribe()
    if (confirmedMarkersUnsubscribe) confirmedMarkersUnsubscribe()
    if (globalStyleUnsubscribe) globalStyleUnsubscribe()
    if (remoteRippleUnsubscribe) remoteRippleUnsubscribe()
    if (remoteEditUnsubscribe) remoteEditUnsubscribe()
    if (remoteDeleteUnsubscribe) remoteDeleteUnsubscribe()
    if (collectionModeUnsubscribe) collectionModeUnsubscribe()
    stopCollectionWatcher()
    destroySelectionOverlay()
    stopSelectedSize()

    if (map && map.getStyle && typeof map.getLayer === "function") {
      try {
        if (map.getLayer("markers-layer")) map.removeLayer("markers-layer")
        if (map.getLayer("markers-selected-layer"))
          map.removeLayer("markers-selected-layer")
        if (map.getLayer("markers-note-labels"))
          map.removeLayer("markers-note-labels")
        if (map.getSource("markers")) map.removeSource("markers")
      } catch (error) {
        console.warn("Error cleaning up map layers:", error)
      }
    }

    cleanup()
  })

  // Selected confirmed marker + silo detection for the custom silo panel.
  $: selectedMarker = $selectedMarkerStore
    ? ($confirmedMarkersStore.find((m) => m.id === $selectedMarkerStore.id) ||
        null)
    : null
  $: selectedIsSilo =
    (selectedMarker?.iconClass || "") === "custom-svg-silo2"
  // The new on-map overlay marker menu (MarkerOverlayPanel) applies to all
  // non-silo markers when the user setting is enabled; otherwise markers use
  // the classic MarkerEditPanel. Silos always use SiloMarkerPanel.
  $: useOverlayMarkerMenu =
    $userSettingsStore?.overlayMarkerMenuEnabled ?? false
  // New-marker placement uses the overlay-style floating panel when enabled;
  // otherwise the classic bottom MarkerEditPanel placement menu.
  $: useOverlayPlacementMenu =
    $userSettingsStore?.overlayPlacementMenuEnabled ?? false
  // Newly placed (unconfirmed) markers always open the classic bottom edit
  // panel so the icon selection menu works, regardless of the menu style.
  $: isNewMarker = $selectedMarkerStore && !selectedMarker

  // Deselect the current marker (closes the silo panel / marker menu).
  export function deselectMarker() {
    if ($selectedMarkerStore) {
      updateMarkerSelection($selectedMarkerStore.id, false)
      selectedMarkerStore.set(null)
    }
    controlStore.update((controls) => ({
      ...controls,
      showMarkerMenu: false,
    }))
  }
</script>

{#if $controlStore.showMarkerMenu && $selectedMarkerStore}
  {#if selectedIsSilo}
    <SiloMarkerPanel
      {map}
      marker={selectedMarker}
      {confirmedMarkersStore}
      {updateSiloBarLive}
      {moveSiloLive}
      {commitSiloMove}
      {showMoveRipple}
      {removeMarker}
      {deselectMarker}
    />
  {:else if isNewMarker}
    {#if useOverlayPlacementMenu}
      <MarkerPlacementPanel
        {map}
        {confirmedMarkersStore}
        {selectedMarkerStore}
        {getCurrentIconClass}
        {getIconImageName}
        previewTintName={resolvePreviewTintName}
        {showPlacementRipple}
        {deselectMarker}
      />
    {:else}
      <MarkerEditPanel
        {map}
        {getCurrentIconClass}
        {removeMarker}
        {centerCameraOnMarker}
        {confirmedMarkersStore}
        {selectedMarkerStore}
        {getIconImageName}
        previewTintName={resolvePreviewTintName}
        {updateMarkerNoteLabel}
        {showPlacementRipple}
        {showEditRipple}
      />
    {/if}
  {:else if useOverlayMarkerMenu}
    <MarkerOverlayPanel
      {map}
      marker={selectedMarker}
      {confirmedMarkersStore}
      {selectedMarkerStore}
      {getCurrentIconClass}
      {getIconImageName}
      {updateMarkerNoteLabel}
      {removeMarker}
      {deselectMarker}
      {moveSiloLive}
      {commitSiloMove}
      {showMoveRipple}
      {showEditRipple}
      {showPlacementRipple}
    />
  {:else}
    <MarkerEditPanel
      {map}
      {getCurrentIconClass}
      {removeMarker}
      {centerCameraOnMarker}
      {confirmedMarkersStore}
      {selectedMarkerStore}
      {getIconImageName}
      previewTintName={resolvePreviewTintName}
      {updateMarkerNoteLabel}
      {showPlacementRipple}
      {showEditRipple}
    />
  {/if}
{/if}

<style>
  :global(.marker-floating-label) {
    position: absolute;
    left: 50%;
    bottom: 100%;
    transform: translateX(-50%) translateY(-8px);
    white-space: nowrap;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: #fff;
    background: rgba(0, 0, 0, 0.75);
    padding: 3px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
    pointer-events: none;
    z-index: 50;
    animation: marker-label-float 1.8s ease-out forwards;
  }

  /* Red variant for GPS rejection labels (created by VehicleTracker) */
  :global(.gps-rejected-label) {
    position: absolute;
    left: 50%;
    bottom: 100%;
    transform: translateX(-50%) translateY(-8px);
    white-space: nowrap;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: #ff4444;
    background: rgba(0, 0, 0, 0.85);
    padding: 3px 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 68, 68, 0.35);
    box-shadow: 0 2px 8px rgba(255, 68, 68, 0.3);
    pointer-events: none;
    z-index: 50;
    animation: marker-label-float 2s ease-out forwards;
  }

  @keyframes -global-marker-label-float {
    0% {
      opacity: 0;
      transform: translateX(-50%) translateY(-8px) scale(0.85);
    }
    10% {
      opacity: 1;
      transform: translateX(-50%) translateY(-14px) scale(1);
    }
    55% {
      opacity: 1;
      transform: translateX(-50%) translateY(-28px);
    }
    100% {
      opacity: 0;
      transform: translateX(-50%) translateY(-48px) scale(0.92);
    }
  }

  :global(.marker-ripple-container) {
    pointer-events: none;
    width: 0;
    height: 0;
    position: relative;
  }

  :global(.marker-ripple-ring) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2.5px solid rgba(247, 219, 92, 0.7);
    background: rgba(247, 219, 92, 0.1);
    animation: marker-ripple 1s ease-out forwards;
  }

  :global(.marker-ripple-ring--delayed) {
    animation: marker-ripple 1.2s ease-out 0.15s forwards;
    opacity: 0;
    border-width: 2px;
    border-color: rgba(247, 219, 92, 0.45);
    background: rgba(247, 219, 92, 0.05);
  }

  @keyframes -global-marker-ripple {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0.9;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.2);
      opacity: 0;
    }
  }

  /* ===== CONFIRM: Soft gather — ring contracts, dot snap + outward pulse ===== */
  :global(.marker-confirm-gather) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(1.2);
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 2px solid rgba(34, 197, 94, 0.5);
    background: transparent;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.2);
    animation: marker-gather-ring 1s ease-in forwards;
  }

  :global(.marker-confirm-gather-dot) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.95);
    box-shadow:
      0 0 14px rgba(34, 197, 94, 0.9),
      0 0 35px rgba(34, 197, 94, 0.5);
    animation: marker-gather-dot 1.1s ease-out forwards;
  }

  :global(.marker-confirm-gather-pulse) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2px solid rgba(34, 197, 94, 0.6);
    background: transparent;
    animation: marker-gather-pulse 0.6s ease-out 0.75s forwards;
  }

  @keyframes -global-marker-gather-ring {
    0% {
      transform: translate(-50%, -50%) scale(1.2);
      opacity: 0;
    }
    20% {
      transform: translate(-50%, -50%) scale(1.2);
      opacity: 0.5;
      border-width: 2px;
    }
    70% {
      transform: translate(-50%, -50%) scale(0.2);
      opacity: 0.7;
      border-width: 3px;
    }
    85% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
    }
    100% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
    }
  }

  @keyframes -global-marker-gather-dot {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
    }
    65% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
    }
    72% {
      transform: translate(-50%, -50%) scale(3);
      opacity: 1;
      box-shadow:
        0 0 20px rgba(34, 197, 94, 1),
        0 0 50px rgba(34, 197, 94, 0.6);
    }
    82% {
      transform: translate(-50%, -50%) scale(2);
      opacity: 0.9;
    }
    90% {
      transform: translate(-50%, -50%) scale(2.4);
      opacity: 0.7;
    }
    100% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
    }
  }

  @keyframes -global-marker-gather-pulse {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0.8;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.5);
      opacity: 0;
    }
  }

  /* ── Marker selection overlay ──
     The selected marker's icon + tight ring pop as ONE DOM element (see
     updateSelectionOverlay). Ring colour comes from --sel / --selc: white by
     default, or the marker's own colour for the icon-fill style. */
  :global(.marker-selection-overlay) {
    /* IMPORTANT: must be position:absolute (like .mapboxgl-marker) so every
       overlay is OUT of normal document flow and anchors to the map
       container's top-left. With position:relative (the default here is
       overridden by .mapboxgl-marker's absolute, but our rule wins in the
       bundle) the overlays stack in flow — the 2nd+ overlay gets pushed down
       one full 120px height and renders below the marker it belongs to. */
    width: 120px;
    height: 120px;
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 10;
  }

  /* ── Selection treatment (size pop) ──
     Every style uses the "size pop" treatment: the marker's icon is embedded
     in the overlay and the icon + tight ring animate as ONE element via CSS
     (like the approved demo) — no per-frame icon-size animation, so it stays
     smooth and perfectly in sync. Ring colour comes from --sel / --selc
     (white by default, the marker's own colour for icon-fill). */
  :global(.msv-inner) {
    position: absolute;
    left: 50%;
    top: 50%;
    transform-origin: 50% 50%;
    will-change: transform;
  }
  :global(.msv-icon) {
    position: absolute;
    inset: 0;
    background: center / contain no-repeat;
  }
  :global(.msv-inner.msv-pop-big) {
    animation: msv-pop-big 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) 1 forwards;
  }
  @keyframes -global-msv-pop-big {
    0% {
      transform: scale(1);
    }
    55% {
      transform: scale(1.4);
    }
    100% {
      transform: scale(1.3);
    }
  }

  /* Size Pop — tight no-gap ring hugging the icon; a child of .msv-inner,
     so it pops together with the icon */
  :global(.msv-ring-tight) {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 37px;
    height: 37px;
    margin: -18.5px 0 0 -18.5px;
    border: 2.5px solid var(--sel);
    border-radius: 50%;
    box-shadow: 0 0 5px var(--sel), 0 0 10px var(--selc);
    pointer-events: none;
  }

  /* Silo fill bar inside the selection overlay — a child of .msv-inner so
     it pops with the icon and sits just below it (never covered, perfectly
     synchronized). Matches the symbol-layer gauge: dark track + a
     light→dark gradient fill via --bar-light/--bar-color, sized --bar-pct. */
  :global(.msv-silo-bar) {
    position: absolute;
    left: 50%;
    top: calc(100% + 3px);
    width: 34px;
    height: 5px;
    transform: translateX(-50%);
    border-radius: 2.5px;
    background: rgba(2, 6, 23, 0.8);
    overflow: hidden;
    pointer-events: none;
  }
  :global(.msv-silo-bar::after) {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--bar-pct, 0%);
    background: linear-gradient(
      to right,
      var(--bar-light, #fef08a),
      var(--bar-color, #eab308)
    );
    border-radius: 2.5px;
  }

  /* "Storing" label inside the selection overlay — sits ABOVE the popped
     icon (child of .msv-inner so it grows + moves with the selection) and
     matches the symbol-layer label styling (amber on a dark halo). */
  :global(.msv-silo-label) {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 2px);
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #fbbf24;
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 3px rgba(0, 0, 0, 0.85);
    pointer-events: none;
    z-index: 1;
  }

  /* ===== EDIT: Blue gentle pulse ===== */

  :global(.marker-edit-pulse) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.4);
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2.5px solid rgba(59, 130, 246, 0.6);
    background: rgba(59, 130, 246, 0.06);
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.25);
    animation: marker-edit-pulse 0.9s ease-out forwards;
  }

  @keyframes -global-marker-edit-pulse {
    0% {
      transform: translate(-50%, -50%) scale(0.4);
      opacity: 0;
    }
    15% {
      transform: translate(-50%, -50%) scale(0.6);
      opacity: 0.8;
    }
    45% {
      transform: translate(-50%, -50%) scale(1.5);
      opacity: 0.6;
      box-shadow: 0 0 18px rgba(59, 130, 246, 0.35);
    }
    100% {
      transform: translate(-50%, -50%) scale(2.2);
      opacity: 0;
    }
  }

  /* Removal: Smoke puff — expands and dissipates */
  :global(.marker-removal-puff) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      rgba(239, 68, 68, 0.55) 0%,
      rgba(220, 60, 60, 0.35) 30%,
      rgba(180, 70, 70, 0.18) 60%,
      transparent 100%
    );
    box-shadow: 0 0 40px rgba(239, 68, 68, 0.5);
    animation: marker-puff 1.2s ease-out forwards;
  }

  @keyframes -global-marker-puff {
    0% {
      transform: translate(-50%, -50%) scale(0.2);
      opacity: 1;
    }
    15% {
      transform: translate(-50%, -50%) scale(1.2);
      opacity: 0.95;
      box-shadow: 0 0 50px rgba(239, 68, 68, 0.7);
    }
    40% {
      transform: translate(-50%, -50%) scale(2.2);
      opacity: 0.7;
    }
    70% {
      transform: translate(-50%, -50%) scale(3);
      opacity: 0.35;
      filter: blur(4px);
    }
    100% {
      transform: translate(-50%, -50%) scale(3.8);
      opacity: 0;
      filter: blur(10px);
    }
  }

  /* ═══════════════════════════════════════════════════════ */
  /*  Collection Mode — green gather animation              */
  /* ═══════════════════════════════════════════════════════ */
  :global(.marker-collect-gather) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(2);
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 2.5px solid rgba(34, 197, 94, 0.6);
    background: radial-gradient(
      circle,
      rgba(34, 197, 94, 0.15) 0%,
      transparent 70%
    );
    animation: marker-collect-ring 0.8s ease-in forwards;
  }

  :global(.marker-collect-dot) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0);
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.95);
    box-shadow:
      0 0 16px rgba(34, 197, 94, 0.9),
      0 0 40px rgba(34, 197, 94, 0.4);
    animation: marker-collect-snap 0.9s ease-out forwards;
  }

  @keyframes -global-marker-collect-ring {
    0% {
      transform: translate(-50%, -50%) scale(2);
      opacity: 0.8;
    }
    60% {
      transform: translate(-50%, -50%) scale(0.4);
      opacity: 1;
      border-color: rgba(34, 197, 94, 0.9);
    }
    80% {
      transform: translate(-50%, -50%) scale(0.1);
      opacity: 0.6;
    }
    100% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
    }
  }

  @keyframes -global-marker-collect-snap {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
    }
    55% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
    }
    65% {
      transform: translate(-50%, -50%) scale(1.3);
      opacity: 1;
    }
    75% {
      transform: translate(-50%, -50%) scale(0.9);
      opacity: 1;
    }
    85% {
      transform: translate(-50%, -50%) scale(1.1);
      opacity: 0.8;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.5);
      opacity: 0;
    }
  }
</style>
