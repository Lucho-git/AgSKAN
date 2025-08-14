<script>
  import { onMount, onDestroy, setContext } from "svelte"
  import mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  // ✅ Add MapboxDraw import, do not remove as it provides mobile touch deduplication, other options is device detection
  //and fixing it in Eventhandler instead, although then chrome devtools won't switch properly
  import MapboxDraw from "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.js"
  import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"

  import { mapStore } from "../stores/mapStore"
  import {
    fieldBoundaryStore,
    markerBoundaryStore,
  } from "$lib/stores/homeBoundaryStore"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"

  import MapEventManager from "./MapEventManager.svelte"
  import MarkerManager from "./MarkerManager.svelte"
  import ButtonSection from "./ButtonSection.svelte"
  import MapStateSaver from "./MapStateSaver.svelte"
  import VehicleTracker from "./VehicleTracker.svelte"
  import VehicleStateSynchronizer from "./VehicleStateSynchronizer.svelte"
  import TrailTracker from "./TrailTracker.svelte"
  import MapFields from "./MapFields.svelte"
  import MapSatelliteOptions from "./MapSatelliteOptions.svelte"
  import TrailSynchronizer from "$lib/components/TrailSynchronizer.svelte"
  import TrailView from "$lib/components/TrailView.svelte"
  import DrawingHectares from "$lib/components/DrawingHectares.svelte"
  import NavigationControl from "$lib/components/NavigationControl.svelte"

  import { db } from "./db.js"

  export let handleBackToDashboard
  export let initialLocation
  export let selectedOperation

  let dbInstance
  let markerManagerRef = null
  let mapFieldsRef = null

  // ✅ Add event interceptor variable
  let eventInterceptor = null

  const DEFAULT_SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"

  let mapLoaded = false
  let mapContainer
  let map

  let mapInitialized = false
  let mapboxInitError = null

  // ✅ Layer ordering registry
  const LAYER_ORDER = {
    // Bottom layers (fields)
    "fields-fill": { order: 100 },
    "fields-fill-selected": { order: 101 },

    // Trail layers (middle)
    "trail-layers-start": { order: 200 }, // Marker for trail layer insertion

    // Field outlines and labels (above trails)
    "fields-outline": { order: 300 },
    "fields-outline-selected": { order: 301 },
    "fields-labels-area": { order: 302 },
    "fields-labels": { order: 303 },

    // Markers (top)
    "markers-layer": { order: 400 },
  }

  // ✅ Central layer management
  function getInsertionPoint(layerId) {
    if (!map) return undefined

    const targetOrder = LAYER_ORDER[layerId]?.order || 999

    try {
      // Find the layer with the next higher order that already exists
      const existingLayers = map.getStyle().layers

      for (const layer of existingLayers.reverse()) {
        const layerOrder = LAYER_ORDER[layer.id]?.order
        if (layerOrder && layerOrder > targetOrder) {
          console.log(`🎯 Inserting ${layerId} before ${layer.id}`)
          return layer.id
        }
      }
    } catch (error) {
      console.warn("Error getting insertion point:", error)
    }

    console.log(`🎯 Adding ${layerId} on top`)
    return undefined // Add on top
  }

  // ✅ Expose layer management to child components
  setContext("map", {
    getMap: () => Promise.resolve(map),
    addLayerOrdered: (layerConfig) => {
      if (!map || map.getLayer(layerConfig.id)) {
        console.warn(`Layer ${layerConfig.id} already exists or map not ready`)
        return false
      }

      try {
        const beforeId = getInsertionPoint(layerConfig.id)

        if (beforeId) {
          map.addLayer(layerConfig, beforeId)
        } else {
          map.addLayer(layerConfig)
        }

        console.log(`✅ Added layer ${layerConfig.id} in correct order`)
        return true
      } catch (error) {
        console.error(`Error adding layer ${layerConfig.id}:`, error)
        return false
      }
    },
    getTrailInsertionPoint: () => {
      // Trails should be inserted before field outlines
      return getInsertionPoint("trail-layers-start")
    },
  })

  const mapOptions = {
    container: null,
    style: DEFAULT_SATELLITE_STYLE,
    center: [133.7751, -25.2744], // Center on Australia
    zoom: 4,
  }

  // ✅ Initialize the global event interceptor
  function initializeEventInterceptor() {
    if (!map || eventInterceptor) return

    try {
      eventInterceptor = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: "simple_select", // Non-drawing mode
        clickBuffer: 6,
        touchBuffer: 6,
        touchEnabled: true,
        boxSelect: false,
        translateEnabled: false,
        rotateEnabled: false,
      })

      // Add it to the map to intercept events globally
      map.addControl(eventInterceptor)
      console.log("✅ Global event interceptor (MapboxDraw) added to MapViewer")
    } catch (error) {
      console.warn("Could not initialize global event interceptor:", error)
    }
  }

  // ✅ Cleanup the event interceptor
  function cleanupEventInterceptor() {
    if (eventInterceptor && map) {
      try {
        map.removeControl(eventInterceptor)
        eventInterceptor = null
        console.log("✅ Global event interceptor removed from MapViewer")
      } catch (error) {
        console.warn("Error removing global event interceptor:", error)
      }
    }
  }

  function initializeMapLocation() {
    if (!map || !initialLocation || !Array.isArray(initialLocation)) return

    try {
      if (initialLocation.length === 4) {
        const bounds = [
          [initialLocation[0], initialLocation[1]],
          [initialLocation[2], initialLocation[3]],
        ]
        map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
        })
      } else if (initialLocation.length === 2) {
        map.flyTo({
          center: initialLocation,
          zoom: 15,
          duration: 4000,
        })
      }
    } catch (error) {
      console.error("Error initializing map location:", error)
    }
  }

  function handleLongPress(lngLat) {
    console.log("🔥 MapViewer: Long press detected at:", lngLat)
    if (markerManagerRef) {
      markerManagerRef.handleMarkerPlacement(lngLat)
    }
  }

  onMount(async () => {
    if (!browser) return

    try {
      mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN

      mapOptions.container = mapContainer
      map = new mapboxgl.Map({
        ...mapOptions,
        accessToken: PUBLIC_MAPBOX_ACCESS_TOKEN,
        fadeDuration: 300,
        refreshExpiredTiles: false,
        maxTileCacheSize: 100,
        attributionControl: false,
        doubleClickZoom: false,
      })

      map.doubleClickZoom.disable()

      map.setMaxPitch(0)
      map.setMinPitch(0)

      mapStore.set(map)
      mapInitialized = true

      if (map.loaded()) {
        mapLoaded = true
        initializeMapLocation()

        map.doubleClickZoom.disable()

        // Disable the tap-drag zoom gesture
        if (map.touchZoomRotate._tapDragZoom) {
          map.touchZoomRotate._tapDragZoom.disable()
        }

        // ✅ Initialize event interceptor when map is loaded
        initializeEventInterceptor()
      } else {
        map.on("load", () => {
          mapLoaded = true
          initializeMapLocation()

          map.doubleClickZoom.disable()

          // Disable the tap-drag zoom gesture
          if (map.touchZoomRotate._tapDragZoom) {
            map.touchZoomRotate._tapDragZoom.disable()
          }

          // ✅ Initialize event interceptor when map is loaded
          initializeEventInterceptor()
        })
      }

      map.on("error", (e) => {
        if (
          e.error &&
          !e.error.message?.includes("404") &&
          !e.error.message?.includes("tile")
        ) {
          console.error("Map error:", e.error)
        }
      })

      try {
        await db.open()
        dbInstance = db
      } catch (error) {
        console.error("Error opening IndexedDB database:", error)
      }
    } catch (error) {
      console.error("Error initializing Mapbox:", error)
      mapboxInitError = error.message
      toast.error(`Failed to initialize map: ${error.message}`)
    }
  })

  onDestroy(() => {
    // ✅ Cleanup event interceptor first
    cleanupEventInterceptor()

    if (map) {
      map.off()
      map.remove()
      map = null
      mapStore.set(null)
    }
  })

  function handleLocateHome() {
    if (!map) return

    if ($fieldBoundaryStore) {
      map.fitBounds($fieldBoundaryStore, {
        padding: 50,
        maxZoom: 15,
      })
    } else if ($markerBoundaryStore) {
      map.fitBounds($markerBoundaryStore, {
        padding: 50,
        maxZoom: 15,
      })
    } else {
      toast.error(
        "Please place markers or upload field boundaries to set a home location",
        {
          duration: 4000,
        },
      )
    }
  }
</script>

<div class="map-container" bind:this={mapContainer}>
  {#if mapboxInitError}
    <div class="error-container">
      <h2>Map Initialization Error</h2>
      <p>{mapboxInitError}</p>
      <button on:click={() => window.location.reload()}>Retry</button>
      <button on:click={handleBackToDashboard}>Back to Dashboard</button>
    </div>
  {:else if mapInitialized}
    <!-- Event Management - handles ALL map interactions -->
    <MapEventManager
      {map}
      {mapLoaded}
      {markerManagerRef}
      {mapFieldsRef}
      onLongPress={handleLongPress}
    />

    <!-- Map UI Components -->
    <MapSatelliteOptions {map} {mapLoaded} />
    <ButtonSection
      on:backToDashboard={handleBackToDashboard}
      on:locateHome={handleLocateHome}
    />
    <NavigationControl />

    <!-- Map Feature Components -->
    <MarkerManager
      bind:this={markerManagerRef}
      {map}
      {mapLoaded}
      coordinatedEvents={true}
    />
    <MapStateSaver {map} />
    <VehicleStateSynchronizer />
    <VehicleTracker {map} disableAutoZoom={initialLocation} />
    <MapFields bind:this={mapFieldsRef} {map} coordinatedEvents={true} />
    <DrawingHectares {map} />

    {#if selectedOperation}
      <TrailSynchronizer {selectedOperation} {map} />
    {/if}
  {/if}
</div>

<style>
  .map-container {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .error-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    text-align: center;
    max-width: 90%;
  }

  .error-container h2 {
    color: #e53e3e;
    margin-bottom: 10px;
  }

  .error-container button {
    margin: 10px 5px 0;
    padding: 8px 16px;
    background-color: #4299e1;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .error-container button:hover {
    background-color: #3182ce;
  }

  :global(.mapboxgl-ctrl-logo) {
    display: none !important;
  }
</style>
