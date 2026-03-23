<!-- src/lib/components/map/overlays/CollectionRoutePlanner.svelte
     Phase flow:  idle → drawing → selected → navigating → idle
     - drawing:    lasso polygon on map, long-press suppressed
     - selected:   preview dots shown, "Start" / "Cancel" overlay
     - navigating: TSP route line, direction arrows, vehicle tether,
                   completed portion fades as vehicle progresses
-->
<script>
  import { onMount, onDestroy } from "svelte"
  import * as turf from "@turf/turf"
  import {
    collectionModeStore,
    collectionRouteStore,
    confirmedMarkersStore,
  } from "$lib/stores/markerStore"
  import { userVehicleStore } from "$lib/stores/vehicleStore"
  import { calculateBearing } from "$lib/utils/trailGeometry"

  export let map

  // ── Source / layer IDs ──
  const LASSO_SRC = "collection-lasso-source"
  const LASSO_FILL = "collection-lasso-fill"
  const LASSO_LINE = "collection-lasso-line"
  const DOTS_SRC = "collection-dots-source"
  const DOTS_LAYER = "collection-dots-layer"
  const DONE_SRC = "collection-done-source"
  const DONE_LINE = "collection-done-line"
  const REMAIN_SRC = "collection-remain-source"
  const REMAIN_LINE = "collection-remain-line"
  const ARROWS_SRC = "collection-arrows-source"
  const ARROWS_LAYER = "collection-arrows-layer"
  const TETHER_SRC = "collection-tether-source"
  const TETHER_LINE = "collection-tether-line"

  const ALL_LAYERS = [
    LASSO_FILL,
    LASSO_LINE,
    DOTS_LAYER,
    DONE_LINE,
    REMAIN_LINE,
    ARROWS_LAYER,
    TETHER_LINE,
  ]
  const ALL_SOURCES = [
    LASSO_SRC,
    DOTS_SRC,
    DONE_SRC,
    REMAIN_SRC,
    ARROWS_SRC,
    TETHER_SRC,
  ]

  // ── Local drawing state ──
  let drawing = false
  let touchPoints = []
  let mapListenersAttached = false

  // ── Navigation state ──
  let vehicleUnsub = null
  let fullRouteCoords = [] // ordered [lng,lat][] for the full route (set once)
  let orderedMarkers = []
  let breadcrumbs = [] // actual GPS positions recorded while navigating
  let nextWaypointIdx = 0 // index into orderedMarkers
  $: waypointReachM = $collectionModeStore.radius || 25 // match the collection radius
  const BREADCRUMB_MIN_M = 2 // min distance between breadcrumb samples

  // ── Store subscription ──
  let storeUnsub
  let prevPhase = "idle"

  // ── Reactive phase from store ──
  $: phase = $collectionRouteStore.phase

  // ── Cursor management ──
  $: if (map) {
    const canvas = map.getCanvas?.()
    if (canvas) {
      canvas.style.cursor = phase === "drawing" ? "crosshair" : ""
    }
  }

  // ── Track collected count to detect changes ──
  let prevCollectedCount = 0

  onMount(() => {
    storeUnsub = collectionRouteStore.subscribe(($s) => {
      if ($s.phase !== prevPhase) {
        handlePhaseChange(prevPhase, $s.phase, $s)
        prevPhase = $s.phase
      }
      // Update dot colors when a marker is collected
      // AND re-run vehicle progress to advance the route line past collected waypoints
      if (
        $s.phase === "navigating" &&
        $s.collectedIds.size !== prevCollectedCount
      ) {
        prevCollectedCount = $s.collectedIds.size
        refreshDotColors($s.collectedIds)

        // Trigger a route-line update so collected waypoints are skipped immediately
        let v
        const vUnsub = userVehicleStore.subscribe((val) => (v = val))
        vUnsub()
        if (v?.coordinates?.latitude && v?.coordinates?.longitude) {
          const vCoord = [v.coordinates.longitude, v.coordinates.latitude]
          updateVehicleProgress(vCoord)
        }
      }
    })
  })

  onDestroy(() => {
    storeUnsub?.()
    vehicleUnsub?.()
    cleanupAll()
    if (map?.getCanvas?.()) map.getCanvas().style.cursor = ""
  })

  // ─────────────────────────────────────────────
  //  PHASE TRANSITIONS
  // ─────────────────────────────────────────────
  function handlePhaseChange(from, to, state) {
    // Leaving any phase — generic cleanup
    if (from === "drawing") {
      drawing = false
      if (map) {
        map.dragPan?.enable()
        map.dragRotate?.enable()
      }
      detachMapListeners()
    }
    if (from === "navigating") {
      stopVehicleTracking()
    }

    // Entering new phase
    if (to === "drawing") {
      beginLassoDraw()
    } else if (to === "selected") {
      showPreviewDots(state.selectedMarkers)
    } else if (to === "navigating") {
      // Layers rendered by handleStartNavigation — nothing extra needed
    } else if (to === "idle") {
      cleanupAll()
    }
  }

  // ─────────────────────────────────────────────
  //  LASSO DRAWING
  // ─────────────────────────────────────────────
  function beginLassoDraw() {
    if (!map) return
    drawing = true
    touchPoints = []
    ensureSources()
    clearAllSourceData()
    attachMapListeners()
  }

  function attachMapListeners() {
    if (!map || mapListenersAttached) return
    map.on("mousedown", onPointerDown)
    map.on("touchstart", onPointerDown)
    mapListenersAttached = true
  }

  function detachMapListeners() {
    if (!map) return
    map.off("mousedown", onPointerDown)
    map.off("mousemove", onPointerMove)
    map.off("mouseup", onPointerUp)
    map.off("touchstart", onPointerDown)
    map.off("touchmove", onPointerMove)
    map.off("touchend", onPointerUp)
    mapListenersAttached = false
  }

  function onPointerDown(e) {
    if (!drawing) return
    e.preventDefault()
    map.dragPan.disable()
    map.dragRotate.disable()

    const lngLat =
      e.lngLat ||
      (e.touches?.[0] &&
        map.unproject([e.touches[0].clientX, e.touches[0].clientY]))
    if (!lngLat) return

    touchPoints = [[lngLat.lng, lngLat.lat]]
    updateLassoDisplay()

    map.on("mousemove", onPointerMove)
    map.on("touchmove", onPointerMove)
    map.on("mouseup", onPointerUp)
    map.on("touchend", onPointerUp)
  }

  function onPointerMove(e) {
    if (!drawing) return
    const lngLat =
      e.lngLat ||
      (e.touches?.[0] &&
        map.unproject([e.touches[0].clientX, e.touches[0].clientY]))
    if (!lngLat) return
    touchPoints = [...touchPoints, [lngLat.lng, lngLat.lat]]
    updateLassoDisplay()
  }

  function onPointerUp() {
    if (!drawing) return
    drawing = false
    map.dragPan.enable()
    map.dragRotate.enable()
    detachMapListeners()

    if (touchPoints.length >= 3) {
      const closed = [...touchPoints, touchPoints[0]]
      updateLassoFill(closed)
      processLasso(closed)
    } else {
      collectionRouteStore.cancelDrawing()
    }
  }

  function updateLassoDisplay() {
    if (!map?.getSource(LASSO_SRC)) return
    map.getSource(LASSO_SRC).setData({
      type: "FeatureCollection",
      features:
        touchPoints.length >= 2
          ? [
              {
                type: "Feature",
                geometry: { type: "LineString", coordinates: touchPoints },
                properties: {},
              },
            ]
          : [],
    })
  }

  function updateLassoFill(closedRing) {
    if (!map?.getSource(LASSO_SRC)) return
    map.getSource(LASSO_SRC).setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [closedRing] },
          properties: {},
        },
      ],
    })
  }

  // ─────────────────────────────────────────────
  //  PROCESS LASSO → "selected" phase
  // ─────────────────────────────────────────────
  function processLasso(closedRing) {
    let polygon
    try {
      polygon = turf.polygon([closedRing])
    } catch {
      collectionRouteStore.cancelDrawing()
      return
    }

    let targetClasses
    const cmUnsub = collectionModeStore.subscribe(
      (s) => (targetClasses = s.targetIconClasses),
    )
    cmUnsub()

    let allMarkers
    const mUnsub = confirmedMarkersStore.subscribe((m) => (allMarkers = m))
    mUnsub()

    const matching = (allMarkers || []).filter((m) => {
      if (!targetClasses.has(m.iconClass)) return false
      return turf.booleanPointInPolygon(turf.point(m.coordinates), polygon)
    })

    if (matching.length === 0) {
      collectionRouteStore.cancelDrawing()
      return
    }

    // Transition to "selected"
    collectionRouteStore.finishSelection(closedRing, matching)
  }

  // ─────────────────────────────────────────────
  //  PREVIEW DOTS (selected phase)
  // ─────────────────────────────────────────────
  function showPreviewDots(markers) {
    ensureSources()
    const features = markers.map((m, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: m.coordinates },
      properties: { order: i + 1 },
    }))
    setSourceData(DOTS_SRC, features)
  }

  // ─────────────────────────────────────────────
  //  REFRESH DOT COLORS  (collected → green)
  // ─────────────────────────────────────────────
  function refreshDotColors(collectedIds) {
    if (!map || orderedMarkers.length === 0) return
    const features = orderedMarkers.map((m, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: m.coordinates },
      properties: {
        order: i + 1,
        markerId: m.id,
        collected: collectedIds.has(m.id),
      },
    }))
    setSourceData(DOTS_SRC, features)
  }

  // ─────────────────────────────────────────────
  //  START NAVIGATION  (called from overlay button)
  // ─────────────────────────────────────────────
  function handleStartNavigation() {
    let state
    const u = collectionRouteStore.subscribe((s) => (state = s))
    u()

    if (
      !state ||
      state.phase !== "selected" ||
      state.selectedMarkers.length === 0
    )
      return

    // Get vehicle position
    const userCoords = getUserCoords()

    // TSP solve
    orderedMarkers = solveTSP(state.selectedMarkers, userCoords)

    // Build route coords:  vehicle → m1 → m2 → ... → mN
    const route = []
    if (userCoords) route.push(userCoords)
    for (const m of orderedMarkers) route.push(m.coordinates)
    fullRouteCoords = route

    // Distance
    let totalDist = 0
    for (let i = 1; i < route.length; i++) {
      totalDist += turf.distance(
        turf.point(route[i - 1]),
        turf.point(route[i]),
        { units: "meters" },
      )
    }

    // Reset breadcrumb state
    breadcrumbs = []
    nextWaypointIdx = 0

    // Update store → triggers phase change to navigating
    collectionRouteStore.startNavigation(route, Math.round(totalDist))

    // Auto-enable collection mode when navigation starts
    collectionModeStore.update((s) => ({ ...s, enabled: true }))

    // Render everything
    renderNavigation(route, orderedMarkers, userCoords)
    startVehicleTracking()
  }

  // ─────────────────────────────────────────────
  //  TSP — nearest-neighbour
  // ─────────────────────────────────────────────
  function solveTSP(markers, startCoord) {
    if (markers.length <= 1) return [...markers]
    const remaining = [...markers]
    const ordered = []
    let current = startCoord || markers[0].coordinates
    while (remaining.length > 0) {
      let bestIdx = 0,
        bestDist = Infinity
      for (let i = 0; i < remaining.length; i++) {
        const d = turf.distance(
          turf.point(current),
          turf.point(remaining[i].coordinates),
          { units: "meters" },
        )
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      const next = remaining.splice(bestIdx, 1)[0]
      ordered.push(next)
      current = next.coordinates
    }
    return ordered
  }

  // ─────────────────────────────────────────────
  //  NAVIGATION RENDERING  (A + C + E)
  // ─────────────────────────────────────────────
  function renderNavigation(routeCoords, markers, userCoords) {
    ensureSources()

    // Clear lasso (no longer needed)
    setSourceData(LASSO_SRC, [])

    // Dots at each stop (keep from selected phase)
    const dotFeatures = markers.map((m, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: m.coordinates },
      properties: { order: i + 1, markerId: m.id, collected: false },
    }))
    setSourceData(DOTS_SRC, dotFeatures)

    // Full route as "remaining" line (solid purple)
    setSourceData(
      REMAIN_SRC,
      routeCoords.length >= 2
        ? [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: routeCoords },
              properties: {},
            },
          ]
        : [],
    )

    // Done line starts empty
    setSourceData(DONE_SRC, [])

    // Direction arrows along the route
    const arrowFeatures = generateArrows(routeCoords, 70)
    setSourceData(ARROWS_SRC, arrowFeatures)

    // Tether line from vehicle to nearest route point
    if (userCoords) {
      setSourceData(TETHER_SRC, [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [userCoords, routeCoords[0] || userCoords],
          },
          properties: {},
        },
      ])
    }
  }

  // ─────────────────────────────────────────────
  //  DIRECTION ARROWS  (Approach A)
  // ─────────────────────────────────────────────
  function generateArrows(coords, intervalMeters) {
    if (coords.length < 2) return []
    const features = []
    let distSinceLast = 0
    for (let i = 0; i < coords.length - 1; i++) {
      const [lon1, lat1] = coords[i]
      const [lon2, lat2] = coords[i + 1]
      const segDist = turf.distance(
        turf.point(coords[i]),
        turf.point(coords[i + 1]),
        { units: "meters" },
      )
      distSinceLast += segDist
      while (distSinceLast >= intervalMeters) {
        const along = segDist - (distSinceLast - intervalMeters)
        const ratio = along / segDist
        const mLon = lon1 + (lon2 - lon1) * ratio
        const mLat = lat1 + (lat2 - lat1) * ratio
        const bearing = calculateBearing(lon1, lat1, lon2, lat2)
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [mLon, mLat] },
          properties: { bearing, color: "#ffffff" },
        })
        distSinceLast -= intervalMeters
      }
    }
    return features
  }

  // ─────────────────────────────────────────────
  //  VEHICLE TRACKING  (Approach C + E)
  // ─────────────────────────────────────────────
  function startVehicleTracking() {
    stopVehicleTracking()
    vehicleUnsub = userVehicleStore.subscribe((v) => {
      if (!v?.coordinates?.latitude || !v?.coordinates?.longitude) return
      const vCoord = [v.coordinates.longitude, v.coordinates.latitude]
      updateVehicleProgress(vCoord)
    })
  }

  function stopVehicleTracking() {
    vehicleUnsub?.()
    vehicleUnsub = null
  }

  function updateVehicleProgress(vehicleCoord) {
    if (!map || orderedMarkers.length === 0) return

    try {
      // ── Record breadcrumb (only if moved enough) ──
      if (breadcrumbs.length === 0) {
        breadcrumbs = [vehicleCoord]
      } else {
        const last = breadcrumbs[breadcrumbs.length - 1]
        const moved = turf.distance(
          turf.point(last),
          turf.point(vehicleCoord),
          { units: "meters" },
        )
        if (moved >= BREADCRUMB_MIN_M) {
          breadcrumbs = [...breadcrumbs, vehicleCoord]
        }
      }

      // ── Check if we've reached the current target waypoint ──
      // Also skip any waypoints whose markers have already been collected
      // (the collection system in MarkerManager may collect them before
      //  the route planner's own proximity check fires)
      let collectedIds
      const cUnsub = collectionRouteStore.subscribe(
        (s) => (collectedIds = s.collectedIds),
      )
      cUnsub()

      while (nextWaypointIdx < orderedMarkers.length) {
        const marker = orderedMarkers[nextWaypointIdx]
        const wp = marker.coordinates

        // Skip if this marker was already collected by the collection system
        if (collectedIds.has(marker.id)) {
          nextWaypointIdx++
          continue
        }

        const distToWp = turf.distance(
          turf.point(vehicleCoord),
          turf.point(wp),
          { units: "meters" },
        )
        if (distToWp <= waypointReachM) {
          nextWaypointIdx++
        } else {
          break
        }
      }

      // ── Done line: actual breadcrumb trail (curvy grey path) ──
      if (breadcrumbs.length >= 2) {
        setSourceData(DONE_SRC, [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: breadcrumbs },
            properties: {},
          },
        ])
      }

      // ── Remaining line: straight from vehicle → next wp → wp+1 → … → last wp ──
      const remainWaypoints = orderedMarkers
        .slice(nextWaypointIdx)
        .map((m) => m.coordinates)
      const remainCoords = [vehicleCoord, ...remainWaypoints]

      if (remainCoords.length >= 2) {
        setSourceData(REMAIN_SRC, [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: remainCoords },
            properties: {},
          },
        ])

        // Arrows on remaining portion
        const arrowFeatures = generateArrows(remainCoords, 70)
        setSourceData(ARROWS_SRC, arrowFeatures)

        // Distance remaining
        const remainLine = turf.lineString(remainCoords)
        const remainDist = Math.round(
          turf.length(remainLine, { units: "meters" }),
        )
        collectionRouteStore.update((s) => ({
          ...s,
          routeDistanceM: remainDist,
        }))
      } else {
        // All waypoints reached
        setSourceData(REMAIN_SRC, [])
        setSourceData(ARROWS_SRC, [])
        collectionRouteStore.update((s) => ({ ...s, routeDistanceM: 0 }))
      }

      // Clear old tether (no longer used)
      setSourceData(TETHER_SRC, [])
    } catch {
      /* noop */
    }
  }

  // ─────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────
  function getUserCoords() {
    let coords = null
    const u = userVehicleStore.subscribe((v) => {
      if (v?.coordinates?.latitude && v?.coordinates?.longitude)
        coords = [v.coordinates.longitude, v.coordinates.latitude]
    })
    u()
    return coords
  }

  function setSourceData(srcId, features) {
    try {
      if (map?.getSource(srcId)) {
        map.getSource(srcId).setData({
          type: "FeatureCollection",
          features: Array.isArray(features) ? features : [],
        })
      }
    } catch {
      /* noop */
    }
  }

  // ─────────────────────────────────────────────
  //  MAP SOURCES & LAYERS
  // ─────────────────────────────────────────────
  function ensureSources() {
    if (!map || !map.isStyleLoaded()) return

    function addSrc(id) {
      if (!map.getSource(id))
        map.addSource(id, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        })
    }
    ALL_SOURCES.forEach(addSrc)

    // Lasso polygon
    if (!map.getLayer(LASSO_FILL)) {
      map.addLayer({
        id: LASSO_FILL,
        type: "fill",
        source: LASSO_SRC,
        filter: ["==", "$type", "Polygon"],
        paint: { "fill-color": "#a855f7", "fill-opacity": 0.15 },
      })
    }
    if (!map.getLayer(LASSO_LINE)) {
      map.addLayer({
        id: LASSO_LINE,
        type: "line",
        source: LASSO_SRC,
        paint: {
          "line-color": "#a855f7",
          "line-width": 2.5,
          "line-dasharray": [4, 3],
        },
      })
    }

    // Preview / stop dots — color changes from purple to green when collected
    if (!map.getLayer(DOTS_LAYER)) {
      map.addLayer({
        id: DOTS_LAYER,
        type: "circle",
        source: DOTS_SRC,
        paint: {
          "circle-radius": 8,
          "circle-color": ["case", ["get", "collected"], "#22c55e", "#7c3aed"],
          "circle-opacity": 0.55,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.45,
        },
      })
    }

    // Done (completed) line — faded
    if (!map.getLayer(DONE_LINE)) {
      map.addLayer({
        id: DONE_LINE,
        type: "line",
        source: DONE_SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#6b21a8",
          "line-width": 4,
          "line-opacity": 0.3,
        },
      })
    }

    // Remaining line — solid purple
    if (!map.getLayer(REMAIN_LINE)) {
      map.addLayer({
        id: REMAIN_LINE,
        type: "line",
        source: REMAIN_SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#c084fc",
          "line-width": 4,
          "line-opacity": 0.85,
        },
      })
    }

    // Direction arrows
    if (!map.getLayer(ARROWS_LAYER)) {
      map.addLayer({
        id: ARROWS_LAYER,
        type: "symbol",
        source: ARROWS_SRC,
        layout: {
          "text-field": "›",
          "text-size": 22,
          "text-rotate": ["+", ["get", "bearing"], 90],
          "text-rotation-alignment": "map",
          "text-pitch-alignment": "map",
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-anchor": "center",
        },
        paint: {
          "text-color": ["get", "color"],
          "text-opacity": 0.85,
          "text-halo-color": ["get", "color"],
          "text-halo-width": 1,
        },
      })
    }

    // Vehicle tether line — dashed
    if (!map.getLayer(TETHER_LINE)) {
      map.addLayer({
        id: TETHER_LINE,
        type: "line",
        source: TETHER_SRC,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#e9d5ff",
          "line-width": 2,
          "line-dasharray": [3, 3],
          "line-opacity": 0.6,
        },
      })
    }
  }

  // ─────────────────────────────────────────────
  //  CLEANUP
  // ─────────────────────────────────────────────
  function clearAllSourceData() {
    ALL_SOURCES.forEach((id) => setSourceData(id, []))
  }

  function cleanupAll() {
    drawing = false
    if (map) {
      map.dragPan?.enable()
      map.dragRotate?.enable()
    }
    detachMapListeners()
    stopVehicleTracking()
    clearAllSourceData()
    fullRouteCoords = []
    orderedMarkers = []
    breadcrumbs = []
    nextWaypointIdx = 0
  }
</script>

<!-- ═══════════════════════════════════════════════════════ -->
<!--  OVERLAY UI  (only visible during drawing / selected)  -->
<!-- ═══════════════════════════════════════════════════════ -->

{#if phase === "drawing"}
  <div class="route-overlay">
    <div class="overlay-card">
      <div class="overlay-icon pulse">✏️</div>
      <p class="overlay-text">Draw around the markers you want to collect</p>
      <p class="overlay-hint">
        Drag your finger across the map to lasso an area
      </p>
      <button
        class="overlay-btn cancel-btn"
        on:click={() => collectionRouteStore.cancelDrawing()}
      >
        Cancel
      </button>
    </div>
  </div>
{/if}

{#if phase === "selected"}
  <div class="route-overlay">
    <div class="overlay-card">
      <div class="overlay-icon">📍</div>
      <p class="overlay-text">
        <strong>{$collectionRouteStore.selectedMarkers.length}</strong>
        marker{$collectionRouteStore.selectedMarkers.length !== 1 ? "s" : ""} selected
      </p>
      <p class="overlay-hint">Tap Start to calculate the optimal route</p>
      <div class="overlay-actions">
        <button
          class="overlay-btn cancel-btn"
          on:click={() => collectionRouteStore.cancelDrawing()}
        >
          Cancel
        </button>
        <button class="overlay-btn start-btn" on:click={handleStartNavigation}>
          Start
        </button>
      </div>
    </div>
  </div>
{/if}

{#if phase === "navigating"}
  <div class="nav-hud">
    <div class="hud-stat">
      <span class="hud-value"
        >{$collectionRouteStore.selectedMarkers.length}</span
      >
      <span class="hud-label">stops</span>
    </div>
    <div class="hud-divider"></div>
    <div class="hud-stat">
      <span class="hud-value">
        {#if $collectionRouteStore.routeDistanceM >= 1000}
          {($collectionRouteStore.routeDistanceM / 1000).toFixed(1)} km
        {:else}
          {$collectionRouteStore.routeDistanceM} m
        {/if}
      </span>
      <span class="hud-label">remaining</span>
    </div>
    <button class="hud-close" on:click={() => collectionRouteStore.clearRoute()}
      >✕</button
    >
  </div>
{/if}

<style>
  /* ── Overlay card (drawing + selected) ── */
  .route-overlay {
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    pointer-events: auto;
  }

  .overlay-card {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(168, 85, 247, 0.3);
    border-radius: 16px;
    padding: 16px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 240px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .overlay-icon {
    font-size: 28px;
    line-height: 1;
  }
  .overlay-icon.pulse {
    animation: icon-pulse 1.2s ease-in-out infinite;
  }
  @keyframes icon-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.15);
    }
  }

  .overlay-text {
    margin: 0;
    font-size: 14px;
    color: #fff;
    text-align: center;
    font-weight: 500;
  }
  .overlay-hint {
    margin: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
  }

  .overlay-actions {
    display: flex;
    gap: 10px;
    margin-top: 6px;
    width: 100%;
  }

  .overlay-btn {
    flex: 1;
    padding: 10px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
  }
  .cancel-btn {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .cancel-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
  .start-btn {
    background: rgba(168, 85, 247, 0.4);
    color: #e9d5ff;
    border: 1px solid #a855f7;
  }
  .start-btn:hover {
    background: rgba(168, 85, 247, 0.6);
    color: #fff;
  }

  /* ── Navigation HUD ── */
  .nav-hud {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(0, 0, 0, 0.82);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(168, 85, 247, 0.3);
    border-radius: 14px;
    padding: 8px 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }

  .hud-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .hud-value {
    font-size: 16px;
    font-weight: 700;
    color: #c084fc;
    line-height: 1.1;
  }
  .hud-label {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .hud-divider {
    width: 1px;
    height: 28px;
    background: rgba(255, 255, 255, 0.12);
  }

  .hud-close {
    margin-left: 6px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .hud-close:hover {
    background: rgba(239, 68, 68, 0.35);
  }
</style>
