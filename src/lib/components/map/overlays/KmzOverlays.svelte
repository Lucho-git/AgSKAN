<!-- src/lib/components/map/overlays/KmzOverlays.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { kmzOverlaysStore } from "$lib/stores/kmzOverlaysStore"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { kmzOverlayApi } from "$lib/api/kmzOverlayApi"

  export let map

  let isDestroyed = false
  let loadedOnce = false
  let clickHandlerAdded = false
  const handlerLayerIds = new Set()

  $: overlays = $kmzOverlaysStore.overlays || []
  $: hiddenIds = $kmzOverlaysStore.hiddenIds || new Set()
  $: globalVisible = $layerVisibilityStore.kmzOverlays !== false
  $: selectedOverlayId = $kmzOverlaysStore.selectedOverlayId
  $: selectedRoadIndex = $kmzOverlaysStore.selectedRoadIndex
  $: focusRequest = $kmzOverlaysStore.focusRequest

  // KMZ overlay layer ids are dynamic (kmz-overlay-<uuid>), so they can't
  // match the exact-id LAYER_ORDER registry in MapViewer. Instead, anchor below
  // the field outlines/labels so roads render above field fills but below
  // outlines, labels, and markers (same approach as EmOverlays).
  const ANCHOR_LAYER_IDS = [
    "fields-outline",
    "fields-outline-selected",
    "fields-labels-area",
    "fields-labels",
    "markers-layer",
    "markers-selection-circle",
    "markers-selected-layer",
  ]

  function getBeforeLayerId() {
    if (!map) return undefined
    for (const id of ANCHOR_LAYER_IDS) {
      if (map.getLayer(id)) return id
    }
    return undefined
  }

  function addLayerOrdered(layerConfig) {
    if (!map || map.getLayer(layerConfig.id)) return false
    try {
      const beforeId = getBeforeLayerId()
      if (beforeId) {
        map.addLayer(layerConfig, beforeId)
      } else {
        map.addLayer(layerConfig)
      }
      return true
    } catch (error) {
      console.error(`Error adding KMZ overlay layer ${layerConfig.id}:`, error)
      return false
    }
  }

  // ── Per-road styling ────────────────────────────────────────────────
  // Resolve cluster defaults into each feature so the paint properties are
  // purely data-driven. Each feature gets a stable numeric `id` (its index)
  // which is promoted to a GeoJSON feature id so we can use feature-state
  // for selection highlighting.
  function enrichFeatures(overlay) {
    const style = overlay.style || {}
    const defaultColor = style.color || "#fbbf24"
    const defaultDashed = style.dashed === true
    const defaultWidth = style.width || 2
    const features = overlay.geojson?.features || []

    return {
      type: "FeatureCollection",
      features: features.map((feature, index) => {
        const props = feature.properties || {}
        const hasOwnDashed = props.dashed === true || props.dashed === false
        return {
          ...feature,
          id: index,
          properties: {
            ...props,
            id: index,
            name: typeof props.name === "string" && props.name.trim() ? props.name : `Road ${index + 1}`,
            color: typeof props.color === "string" && props.color ? props.color : defaultColor,
            dashed: hasOwnDashed ? props.dashed : defaultDashed,
            width: typeof props.width === "number" ? props.width : defaultWidth,
          },
        }
      }),
    }
  }

  function sourceIdFor(overlay) {
    return `kmz-overlay-${overlay.id}`
  }

  function lineLayerIdsFor(overlay) {
    return [`kmz-overlay-solid-${overlay.id}`, `kmz-overlay-dashed-${overlay.id}`]
  }

  function labelLayerIdFor(overlay) {
    return `kmz-overlay-label-${overlay.id}`
  }

  // Shared paint for solid + dashed line layers. Selection is highlighted via
  // feature-state (white + wider).
  function linePaint() {
    return {
      "line-color": [
        "case",
        ["==", ["feature-state", "selected"], true],
        "#ffffff",
        ["get", "color"],
      ],
      "line-width": [
        "case",
        ["==", ["feature-state", "selected"], true],
        6,
        ["coalesce", ["get", "width"], 2],
      ],
      "line-opacity": 0.95,
    }
  }

  function addOrUpdateOverlay(overlay) {
    if (!map || isDestroyed) return
    const sourceId = sourceIdFor(overlay)
    const data = enrichFeatures(overlay)

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data,
        promoteId: "id",
      })
      addLayers(overlay)
    } else {
      map.getSource(sourceId).setData(data)
    }

    updateOverlayVisibility(overlay)
  }

  function addLayers(overlay) {
    const sourceId = sourceIdFor(overlay)

    // Solid roads (butt-free rounded caps look best for solid lines)
    addLayerOrdered({
      id: `kmz-overlay-solid-${overlay.id}`,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "dashed"], false],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: linePaint(),
    })

    // Dashed roads (butt caps so the dash pattern renders crisply)
    addLayerOrdered({
      id: `kmz-overlay-dashed-${overlay.id}`,
      type: "line",
      source: sourceId,
      filter: ["==", ["get", "dashed"], true],
      layout: { "line-join": "round", "line-cap": "butt" },
      paint: {
        ...linePaint(),
        "line-dasharray": [5, 3],
      },
    })

    // Road-name labels along the line (mapbox road-name style)
    addLayerOrdered({
      id: labelLayerIdFor(overlay),
      type: "symbol",
      source: sourceId,
      layout: {
        "text-field": ["coalesce", ["get", "name"], ""],
        "symbol-placement": "line",
        "text-size": 12,
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
        "text-rotation-alignment": "map",
        "symbol-spacing": 400,
        "text-allow-overlap": false,
        "text-pitch-alignment": "map",
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.2,
      },
    })

    addClickHandlers(overlay)
  }

  function addClickHandlers(overlay) {
    if (!map || isDestroyed) return

    for (const layerId of lineLayerIdsFor(overlay)) {
      if (handlerLayerIds.has(layerId) || !map.getLayer(layerId)) continue
      handlerLayerIds.add(layerId)

      map.on("click", layerId, (e) => {
        const feature = e.features && e.features[0]
        if (!feature) return
        // Prevent the map-level click handler below from deselecting
        if (e.preventDefault) e.preventDefault()
        const index = feature.properties?.id
        if (typeof index === "number") {
          kmzOverlaysStore.setSelection(overlay.id, index)
        }
      })

      map.on("mouseenter", layerId, () => {
        if (map) map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", layerId, () => {
        if (map) map.getCanvas().style.cursor = ""
      })
    }
  }

  // Deselect when clicking empty map — never when a road was clicked.
  // Bulletproof: even if preventDefault didn't stop propagation (old mapbox),
  // query the rendered features at the click point and keep the selection.
  function handleMapClick(e) {
    if (!map || isDestroyed) return
    if (e?.originalEvent?.defaultPrevented) return

    const layers = []
    for (const overlay of overlays) {
      layers.push(...lineLayerIdsFor(overlay))
    }
    if (layers.length > 0) {
      try {
        const hit = map.queryRenderedFeatures(e.point, { layers })
        if (hit && hit.length > 0) return // clicked a road — keep selection
      } catch (err) {
        // ignore
      }
    }

    kmzOverlaysStore.clearSelection()
  }

  function updateOverlayVisibility(overlay) {
    if (!map || isDestroyed) return
    const visible = globalVisible && !hiddenIds.has(overlay.id)
    const vis = visible ? "visible" : "none"

    for (const layerId of [...lineLayerIdsFor(overlay), labelLayerIdFor(overlay)]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", vis)
      }
    }
  }

  function updateFeatureStates() {
    if (!map || isDestroyed) return

    for (const overlay of overlays) {
      const sourceId = sourceIdFor(overlay)
      if (!map.getSource(sourceId)) continue
      const count = overlay.geojson?.features?.length || 0
      const selected =
        overlay.id === selectedOverlayId &&
        typeof selectedRoadIndex === "number"
          ? selectedRoadIndex
          : null

      for (let i = 0; i < count; i++) {
        const isSel = selected === i
        try {
          map.setFeatureState(
            { source: sourceId, id: i },
            { selected: isSel },
          )
        } catch (err) {
          // ignore — feature may not exist yet
        }
      }
    }
  }

  function renderAll() {
    if (!map || isDestroyed) return
    for (const overlay of overlays) {
      addOrUpdateOverlay(overlay)
    }
  }

  // Re-render when overlays change (added/edited/removed)
  $: if (map && !isDestroyed && overlays.length >= 0) {
    renderAll()
  }

  // React to visibility changes (global toggle + per-overlay eye)
  $: if (map && !isDestroyed) {
    for (const overlay of overlays) {
      updateOverlayVisibility(overlay)
    }
  }

  // React to selection changes
  $: if (map && !isDestroyed) {
    updateFeatureStates()
  }

  // ── Zoom to the selected road (when picked from the toolbox list) ─────
  function collectCoords(geometry, acc = []) {
    if (!geometry) return acc
    switch (geometry.type) {
      case "Point":
        acc.push(geometry.coordinates)
        break
      case "MultiPoint":
      case "LineString":
        acc.push(...geometry.coordinates)
        break
      case "MultiLineString":
      case "Polygon":
        acc.push(...geometry.coordinates.flat(1))
        break
      case "MultiPolygon":
        acc.push(...geometry.coordinates.flat(2))
        break
      case "GeometryCollection":
        for (const g of geometry.geometries || []) collectCoords(g, acc)
        break
    }
    return acc
  }

  function zoomToSelectedRoad() {
    if (!map || isDestroyed) return
    if (!selectedOverlayId || typeof selectedRoadIndex !== "number") return

    const overlay = overlays.find((o) => o.id === selectedOverlayId)
    const feature = overlay?.geojson?.features?.[selectedRoadIndex]
    const coords = collectCoords(feature?.geometry)
    if (coords.length === 0) return

    const bounds = coords.reduce(
      (b, c) => {
        b[0][0] = Math.min(b[0][0], c[0])
        b[0][1] = Math.min(b[0][1], c[1])
        b[1][0] = Math.max(b[1][0], c[0])
        b[1][1] = Math.max(b[1][1], c[1])
        return b
      },
      [
        [Infinity, Infinity],
        [-Infinity, -Infinity],
      ],
    )

    if (!isFinite(bounds[0][0]) || !isFinite(bounds[1][0])) return

    // Degenerate (single point) — fly to it instead of fitting an empty box
    if (bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]) {
      map.flyTo({ center: bounds[0], zoom: 16, duration: 800 })
      return
    }

    // Scale padding with container size so small screens don't zoom too far out
    const w = map.getContainer().clientWidth
    const h = map.getContainer().clientHeight
    const pad = Math.min(100, Math.floor(Math.min(w, h) * 0.15))

    map.fitBounds(bounds, { padding: pad, maxZoom: 17, duration: 800 })
  }

  // Zoom when the toolbox requests focus on the selected road
  $: if (map && !isDestroyed && focusRequest > 0) {
    zoomToSelectedRoad()
  }

  function cleanup() {
    isDestroyed = true
    if (!map) return

    map.off("click", handleMapClick)
    map.off("style.load", handleStyleReload)

    for (const overlay of overlays) {
      const sourceId = sourceIdFor(overlay)
      try {
        for (const layerId of [
          `kmz-overlay-solid-${overlay.id}`,
          `kmz-overlay-dashed-${overlay.id}`,
          labelLayerIdFor(overlay),
        ]) {
          if (map.getLayer(layerId)) map.removeLayer(layerId)
        }
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      } catch (e) {
        // ignore
      }
    }
  }

  // When the style reloads (e.g. satellite style switch), Mapbox removes all
  // sources/layers and event handlers must be re-registered on the new ones.
  function handleStyleReload() {
    if (isDestroyed || !map) return
    handlerLayerIds.clear()
    renderAll()
    updateFeatureStates()
  }

  onMount(async () => {
    if (!map) return

    map.on("style.load", handleStyleReload)

    // Load overlays for the user's map so they render without opening the toolbox
    if (!loadedOnce) {
      loadedOnce = true
      const result = await kmzOverlayApi.loadOverlays()
      if (result.success && !isDestroyed) {
        kmzOverlaysStore.setOverlays(result.overlays)
      }
    }

    const tryRender = () => {
      if (isDestroyed) return
      if (map.loaded() && map.isStyleLoaded()) {
        if (!clickHandlerAdded) {
          clickHandlerAdded = true
          map.on("click", handleMapClick)
        }
        renderAll()
        updateFeatureStates()
      } else {
        map.once("idle", tryRender)
      }
    }
    tryRender()
  })

  onDestroy(() => {
    cleanup()
  })
</script>
