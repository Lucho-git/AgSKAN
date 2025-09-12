<!-- src\components\MapViewer.svelte -->
<script>
  import { onMount, onDestroy, setContext, getContext } from "svelte"
  import mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import MapboxDraw from "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.js"
  import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"

  import { mapStore } from "../stores/mapStore"
  import {
    fieldBoundaryStore,
    markerBoundaryStore,
  } from "$lib/stores/homeBoundaryStore"
  import { userVehicleStore } from "../stores/vehicleStore"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"

  // Import lucide icons for the toolbox - changed from Wrench to Menu
  import { Menu } from "lucide-svelte"

  import MapEventManager from "./MapEventManager.svelte"
  import MarkerManager from "./MarkerManager.svelte"
  import ButtonSection from "./ButtonSection.svelte"
  import MapStateSaver from "./MapStateSaver.svelte"
  import VehicleTracker from "./VehicleTracker.svelte"
  import VehicleStateSynchronizer from "./VehicleStateSynchronizer.svelte"
  import MapFields from "./MapFields.svelte"
  import TrailSynchronizer from "$lib/components/TrailSynchronizer.svelte"
  import TrailView from "$lib/components/TrailView.svelte"
  import DrawingHectares from "$lib/components/DrawingHectares.svelte"
  import NavigationControl from "$lib/components/NavigationControl.svelte"
  import Toolbox from "$lib/components/Toolbox.svelte"

  // Import persistent managers
  import SatelliteManager from "$lib/components/SatelliteManager.svelte"

  import { db } from "./db.js"

  export let handleBackToDashboard
  export let initialLocation
  export let selectedOperation

  let dbInstance
  let markerManagerRef = null
  let mapFieldsRef = null
  let vehicleTrackerRef = null
  let mapEventManagerRef = null
  let trailHighlighter = null

  // Manager references
  let satelliteManager = null

  const DEFAULT_SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"

  let mapLoaded = false
  let mapContainer
  let map

  let mapInitialized = false
  let mapboxInitError = null

  // Toolbox state
  let toolboxOpen = false

  // Current vehicle state for toolbox
  $: currentVehicleType = $userVehicleStore.vehicle_marker?.type || "Tractor"
  $: currentVehicleColor =
    $userVehicleStore.vehicle_marker?.bodyColor || "#22c55e"
  $: currentVehicleSwath = $userVehicleStore.vehicle_marker?.swath || 12

  // Layer ordering registry with trail support
  const LAYER_ORDER = {
    // Bottom layers (fields) - 100-199
    "fields-fill": { order: 100, category: "field-base" },
    "fields-fill-selected": { order: 101, category: "field-base" },

    // Trail layers (middle) - 200-299
    "trail-layers-start": { order: 200, category: "trails" },

    // Field outlines and labels (above trails) - 300-399
    "fields-outline": { order: 300, category: "field-decoration" },
    "fields-outline-selected": { order: 301, category: "field-decoration" },
    "fields-labels-area": { order: 302, category: "field-decoration" },
    "fields-labels": { order: 303, category: "field-decoration" },

    // Interactive/UI layers (top) - 400+
    "markers-layer": { order: 400, category: "interactive" },
  }

  // Central layer management
  function getInsertionPoint(layerId) {
    if (!map) return undefined

    const targetOrder = LAYER_ORDER[layerId]?.order || 999

    try {
      const existingLayers = map.getStyle().layers

      for (const layer of existingLayers.reverse()) {
        const layerOrder = LAYER_ORDER[layer.id]?.order
        if (layerOrder && layerOrder > targetOrder) {
          return layer.id
        }
      }
    } catch (error) {
      console.warn("Error getting insertion point:", error)
    }

    return undefined
  }

  // Layer management context with trail support
  setContext("map", {
    getMap: () => Promise.resolve(map),
    addLayerOrdered: (layerConfig) => {
      if (!map || map.getLayer(layerConfig.id)) return false

      try {
        const beforeId = getInsertionPoint(layerConfig.id)
        if (beforeId) {
          map.addLayer(layerConfig, beforeId)
        } else {
          map.addLayer(layerConfig)
        }
        return true
      } catch (error) {
        console.error(`Error adding layer ${layerConfig.id}:`, error)
        return false
      }
    },
    addTrailLayerOrdered: (layerConfig) => {
      if (!map || map.getLayer(layerConfig.id)) return false

      try {
        const layers = map.getStyle().layers
        const insertBeforeLayer = layers.find((layer) =>
          [
            "fields-outline",
            "fields-outline-selected",
            "fields-labels-area",
            "fields-labels",
            "markers-layer",
          ].includes(layer.id),
        )

        if (insertBeforeLayer) {
          map.addLayer(layerConfig, insertBeforeLayer.id)
        } else {
          map.addLayer(layerConfig)
        }
        return true
      } catch (error) {
        console.error(`Error adding trail layer ${layerConfig.id}:`, error)
        return false
      }
    },
  })

  const mapOptions = {
    container: null,
    style: DEFAULT_SATELLITE_STYLE,
    center: [133.7751, -25.2744],
    zoom: 4,
  }

  function initializeMapLocation() {
    if (!map || !initialLocation || !Array.isArray(initialLocation)) return

    try {
      if (initialLocation.length === 4) {
        const bounds = [
          [initialLocation[0], initialLocation[1]],
          [initialLocation[2], initialLocation[3]],
        ]
        map.fitBounds(bounds, { padding: 50, maxZoom: 15 })
      } else if (initialLocation.length === 2) {
        map.flyTo({ center: initialLocation, zoom: 15, duration: 4000 })
      }
    } catch (error) {
      console.error("Error initializing map location:", error)
    }
  }

  function handleLongPress(lngLat) {
    if (markerManagerRef) {
      markerManagerRef.handleMarkerPlacement(lngLat)
    }
  }

  // Toolbox functions
  function toggleToolbox() {
    toolboxOpen = !toolboxOpen
  }

  function closeToolbox() {
    toolboxOpen = false
  }

  // Handle vehicle updates from toolbox
  function handleVehicleUpdate(event) {
    const { type, color, swath } = event.detail
    // The VehicleStateSynchronizer will handle the actual updates
    console.log("Vehicle updated:", { type, color, swath })
  }

  // Handle trail viewer opening
  function handleOpenTrailViewer() {
    if (trailHighlighter?.highlighterAPI?.toggleNavigationUI) {
      trailHighlighter.highlighterAPI.toggleNavigationUI()
    } else {
      toast.error("Trail viewer not available")
    }
  }

  function handleToolAction(event) {
    const { type } = event.detail

    console.log("Tool action:", type)

    // Handle different tool actions
    switch (type) {
      case "locate-home":
        handleLocateHome()
        break
      case "place-marker":
        // TODO: Implement marker placement mode
        toast.info("Marker placement mode activated")
        break
      case "drawing-mode":
        // TODO: Implement drawing mode toggle
        toast.info("Drawing mode activated")
        break
      case "vehicle-controls":
        // TODO: Open vehicle controls
        toast.info("Vehicle controls opened")
        break
      case "trail-recording":
        // TODO: Toggle trail recording
        toast.info("Trail recording toggled")
        break
      case "measurement":
        // TODO: Open measurement tools
        toast.info("Measurement tools opened")
        break
      case "map-sync":
        // TODO: Trigger map sync
        toast.info("Map sync initiated")
        break
      case "settings":
        // TODO: Open settings
        toast.info("Settings opened")
        break
      default:
        console.warn("Unknown tool action:", type)
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

      const setupMap = () => {
        mapLoaded = true
        initializeMapLocation()

        // Disable gestures
        if (map.touchZoomRotate._tapDragZoom) {
          map.touchZoomRotate._tapDragZoom.disable()
        }

        // Simple MapboxDraw setup for mobile touch handling
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: {},
          defaultMode: "simple_select",
          clickBuffer: 6,
          touchBuffer: 6,
          touchEnabled: true,
          boxSelect: false,
          translateEnabled: false,
          rotateEnabled: false,
          // Add custom styles to fix the line-dasharray issue
          styles: [
            // Point style
            {
              id: "gl-draw-point",
              type: "circle",
              filter: [
                "all",
                ["==", "$type", "Point"],
                ["!=", "mode", "static"],
              ],
              paint: {
                "circle-radius": 5,
                "circle-color": "#000",
              },
            },
            // Line styles with proper dasharray format
            {
              id: "gl-draw-lines",
              type: "line",
              filter: [
                "all",
                ["==", "$type", "LineString"],
                ["!=", "mode", "static"],
              ],
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": "#000",
                "line-width": 2,
              },
            },
            {
              id: "gl-draw-lines-cold",
              type: "line",
              filter: [
                "all",
                ["==", "$type", "LineString"],
                ["!=", "mode", "static"],
                ["!=", "active", "true"],
              ],
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": "#000",
                "line-width": 2,
                "line-dasharray": ["literal", [2, 2]],
              },
            },
            {
              id: "gl-draw-lines-hot",
              type: "line",
              filter: [
                "all",
                ["==", "$type", "LineString"],
                ["!=", "mode", "static"],
                ["==", "active", "true"],
              ],
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": "#000",
                "line-width": 2,
                "line-dasharray": ["literal", [1, 1]],
              },
            },
            // Polygon styles
            {
              id: "gl-draw-polygon-fill",
              type: "fill",
              filter: [
                "all",
                ["==", "$type", "Polygon"],
                ["!=", "mode", "static"],
              ],
              paint: {
                "fill-color": "#000",
                "fill-outline-color": "#000",
                "fill-opacity": 0.1,
              },
            },
            {
              id: "gl-draw-polygon-stroke",
              type: "line",
              filter: [
                "all",
                ["==", "$type", "Polygon"],
                ["!=", "mode", "static"],
              ],
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": "#000",
                "line-width": 2,
              },
            },
          ],
        })
        map.addControl(draw)
      }

      if (map.loaded()) {
        setupMap()
      } else {
        map.on("load", setupMap)
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
      map.fitBounds($fieldBoundaryStore, { padding: 50, maxZoom: 15 })
    } else if ($markerBoundaryStore) {
      map.fitBounds($markerBoundaryStore, { padding: 50, maxZoom: 15 })
    } else {
      toast.error(
        "Please place markers or upload field boundaries to set a home location",
        { duration: 4000 },
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
    <MapEventManager
      bind:this={mapEventManagerRef}
      {map}
      {mapLoaded}
      {markerManagerRef}
      {mapFieldsRef}
      {vehicleTrackerRef}
      onLongPress={handleLongPress}
    />

    <!-- Persistent Managers - Never unmount -->
    <SatelliteManager bind:this={satelliteManager} {map} {mapLoaded} />

    <!-- Toolbox Trigger Button -->
    <div class="toolbox-trigger-container">
      <button
        class="toolbox-trigger-button"
        class:active={toolboxOpen}
        on:click={toggleToolbox}
      >
        <Menu size={28} />
      </button>
    </div>

    <!-- Keep existing ButtonSection for now -->
    <ButtonSection
      on:backToDashboard={handleBackToDashboard}
      on:locateHome={handleLocateHome}
    />

    <NavigationControl />
    <MarkerManager
      bind:this={markerManagerRef}
      {map}
      {mapLoaded}
      coordinatedEvents={true}
    />
    <MapStateSaver {map} />
    <VehicleStateSynchronizer />
    <VehicleTracker
      bind:this={vehicleTrackerRef}
      {map}
      disableAutoZoom={initialLocation}
    />
    <MapFields bind:this={mapFieldsRef} {map} coordinatedEvents={true} />
    <DrawingHectares {map} />

    <!-- Trail View with clean API access -->
    <TrailView bind:this={trailHighlighter} {map} />

    {#if selectedOperation}
      <TrailSynchronizer {selectedOperation} {map} />
    {/if}
  {/if}
</div>

<!-- Toolbox with direct API access -->
<Toolbox
  {satelliteManager}
  trailReplayAPI={trailHighlighter?.highlighterAPI}
  {currentVehicleType}
  {currentVehicleColor}
  {currentVehicleSwath}
  isOpen={toolboxOpen}
  on:close={closeToolbox}
  on:tool={handleToolAction}
  on:vehicleUpdated={handleVehicleUpdate}
  on:openTrailViewer={handleOpenTrailViewer}
/>

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

  /* Toolbox Trigger Button Styles */
  .toolbox-trigger-container {
    position: absolute;
    top: 92px;
    left: 16px;
    z-index: 10;
  }

  .toolbox-trigger-button {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.5);
    border: 2px solid #000000;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
    width: 64px;
    height: 64px;
    color: #000000;
  }

  .toolbox-trigger-button:hover {
    background-color: #f7db5c;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  .toolbox-trigger-button.active {
    background-color: #f7db5c;
    border-color: #000000;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
  }

  :global(.mapboxgl-ctrl-logo) {
    display: none !important;
  }
</style>
