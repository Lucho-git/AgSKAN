<!-- src/lib/components/map/overlays/FtwPmtilesOverlay.svelte -->
<script>
  import { createEventDispatcher, onDestroy } from "svelte"

  export let map
  export let visible = false
  export let year = 2025

  const dispatch = createEventDispatcher()
  const defaultTileBaseUrl = "http://127.0.0.1:8787/ftw-pmtiles"
  const sourceId = "ftw-pmtiles-source"
  const layerIds = {
    fill: "ftw-pmtiles-fill",
    lineCasing: "ftw-pmtiles-line-casing",
    line: "ftw-pmtiles-line",
  }

  let listeningForStyleLoad = false
  let listeningForLayerEvents = false
  // Manual tap tracking — Mapbox's layer-scoped `click` event is unreliable
  // on touch devices (a tap often doesn't trigger it after pinch/drag
  // settles). We mirror the pattern used in MapEventManager: capture a
  // touchstart, then on touchend if movement was small, queryRenderedFeatures
  // ourselves and dispatch a synthetic select.
  let touchStart = null
  let touchMoved = false
  const TAP_MOVE_THRESHOLD_PX = 10

  function getTileBaseUrl() {
    if (typeof window === "undefined") return defaultTileBaseUrl
    return (
      window.localStorage.getItem("agskan-ftw-tile-base-url") ||
      defaultTileBaseUrl
    )
  }

  function styleReady() {
    return !!map?.getStyle?.()?.layers?.length
  }

  function getFieldLayerName() {
    return `field-${year}-01-01 00:00:00`
  }

  function getBeforeLayerId() {
    const candidates = [
      "fields-fill",
      "fields-outline",
      "markers-layer",
      "gl-draw-polygon-fill",
    ]
    return candidates.find((layerId) => map.getLayer(layerId))
  }

  function addLayer(layerConfig) {
    if (map.getLayer(layerConfig.id)) return
    const beforeLayerId = getBeforeLayerId()
    if (beforeLayerId) {
      map.addLayer(layerConfig, beforeLayerId)
    } else {
      map.addLayer(layerConfig)
    }
  }

  function handleFieldClick(event) {
    const feature = event.features?.[0]
    if (!feature || !event.lngLat) return

    dispatch("select", {
      feature,
      lngLat: {
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      },
      point: event.point,
    })
  }

  function handleFieldMouseEnter() {
    if (map?.getCanvas) map.getCanvas().style.cursor = "pointer"
  }

  function handleFieldMouseLeave() {
    if (map?.getCanvas) map.getCanvas().style.cursor = ""
  }

  function handleMapTouchStart(event) {
    const touches = event.originalEvent?.touches
    if (!touches || touches.length !== 1) {
      touchStart = null
      touchMoved = false
      return
    }
    touchStart = {
      x: touches[0].clientX,
      y: touches[0].clientY,
      point: event.point,
      lngLat: event.lngLat,
    }
    touchMoved = false
  }

  function handleMapTouchMove(event) {
    if (!touchStart) return
    const touches = event.originalEvent?.touches
    if (!touches || touches.length !== 1) {
      touchMoved = true
      return
    }
    const dx = touches[0].clientX - touchStart.x
    const dy = touches[0].clientY - touchStart.y
    if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_THRESHOLD_PX) touchMoved = true
  }

  function handleMapTouchEnd(event) {
    const start = touchStart
    touchStart = null
    if (!start || touchMoved) {
      touchMoved = false
      return
    }
    touchMoved = false
    if (!map?.getLayer || !map.getLayer(layerIds.fill)) return

    const features = map.queryRenderedFeatures(start.point, {
      layers: [layerIds.fill],
    })
    const feature = features?.[0]
    if (!feature) return

    dispatch("select", {
      feature,
      lngLat: start.lngLat
        ? { lng: start.lngLat.lng, lat: start.lngLat.lat }
        : null,
      point: start.point,
    })
  }

  function attachInteractionListeners() {
    if (listeningForLayerEvents || !map?.on || !map.getLayer(layerIds.fill)) {
      return
    }

    map.on("click", layerIds.fill, handleFieldClick)
    map.on("mouseenter", layerIds.fill, handleFieldMouseEnter)
    map.on("mouseleave", layerIds.fill, handleFieldMouseLeave)
    // Mapbox layer-scoped click is flaky on touch; also bind raw touch
    // events so taps register reliably on mobile/Capacitor.
    map.on("touchstart", handleMapTouchStart)
    map.on("touchmove", handleMapTouchMove)
    map.on("touchend", handleMapTouchEnd)
    listeningForLayerEvents = true
  }

  function detachInteractionListeners() {
    if (!listeningForLayerEvents || !map?.off) return

    map.off("click", layerIds.fill, handleFieldClick)
    map.off("mouseenter", layerIds.fill, handleFieldMouseEnter)
    map.off("mouseleave", layerIds.fill, handleFieldMouseLeave)
    map.off("touchstart", handleMapTouchStart)
    map.off("touchmove", handleMapTouchMove)
    map.off("touchend", handleMapTouchEnd)
    handleFieldMouseLeave()
    touchStart = null
    touchMoved = false
    listeningForLayerEvents = false
  }

  function initializeLayers() {
    if (!map || !styleReady()) return false

    try {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "vector",
          tiles: [`${getTileBaseUrl()}/{z}/{x}/{y}.mvt`],
          minzoom: 0,
          maxzoom: 15,
          bounds: [-179.8340817, -56.9030569, 179.995742, 82.8192209],
          attribution: "Fields of The World / Source Cooperative",
        })
      }

      const sourceLayer = getFieldLayerName()

      addLayer({
        id: layerIds.fill,
        type: "fill",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: 9,
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.16,
        },
      })

      addLayer({
        id: layerIds.lineCasing,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: 9,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#111827",
          "line-opacity": 0.55,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 14, 2.4],
        },
      })

      addLayer({
        id: layerIds.line,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: 9,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#fbbf24",
          "line-opacity": 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.35, 14, 1.5],
        },
      })

      attachInteractionListeners()
      return true
    } catch (error) {
      console.error("Error initializing FTW PMTiles overlay:", error)
      return false
    }
  }

  function cleanupLayers() {
    if (!map?.getLayer || !map?.getSource) return

    try {
      detachInteractionListeners()
    } catch (error) {
      console.warn("Error detaching FTW PMTiles listeners:", error)
    }

    Object.values(layerIds).forEach((layerId) => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
      } catch (error) {
        console.warn(
          `Error removing FTW PMTiles overlay layer ${layerId}:`,
          error,
        )
      }
    })

    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    } catch (error) {
      console.warn("Error removing FTW PMTiles overlay source:", error)
    }
  }

  function renderOverlay() {
    if (visible) {
      initializeLayers()
    } else {
      cleanupLayers()
    }
  }

  function handleStyleLoad() {
    renderOverlay()
  }

  function attachStyleListener() {
    if (listeningForStyleLoad || !map?.on) return
    map.on("style.load", handleStyleLoad)
    listeningForStyleLoad = true
  }

  function detachStyleListener() {
    if (!listeningForStyleLoad || !map?.off) return
    map.off("style.load", handleStyleLoad)
    listeningForStyleLoad = false
  }

  $: if (map && visible !== undefined && year) {
    if (visible) {
      attachStyleListener()
    } else {
      detachStyleListener()
    }
    renderOverlay()
  }

  onDestroy(() => {
    detachStyleListener()
    detachInteractionListeners()
    cleanupLayers()
  })
</script>
