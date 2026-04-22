<!-- src/lib/components/map/MapViewer.svelte -->
<script>
  import { onMount, onDestroy, setContext } from "svelte"
  import mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import MapboxDraw from "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.js"
  import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"

  import {
    markerStore,
    selectedMarkerStore,
    pendingMarkerChangesStore,
    pendingMarkerDeletionsStore,
    collectionRouteStore,
  } from "$lib/stores/markerStore"
  import {
    fieldBoundaryStore,
    markerBoundaryStore,
  } from "$lib/stores/homeBoundaryStore"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"

  // Import lucide icons for the toolbox
  import { Menu } from "lucide-svelte"

  import MapEventManager from "./MapEventManager.svelte"
  import MarkerManager from "./markers/MarkerManager.svelte"
  import ButtonSection from "./toolbox/ButtonSection.svelte"
  import TrailModals from "./trails/TrailModals.svelte"
  import MapStateSaver from "./MapStateSaver.svelte"
  import VehicleTracker from "./vehicles/VehicleTracker.svelte"
  import VehicleStateSynchronizer from "./vehicles/VehicleStateSynchronizer.svelte"
  import MapFields from "./MapFields.svelte"
  import EmOverlays from "$lib/components/map/overlays/EmOverlays.svelte"
  import TrailSynchronizer from "$lib/components/map/trails/TrailSynchronizer.svelte"
  import TrailView from "$lib/components/map/trails/TrailView.svelte"
  import OverlayTrailManager from "$lib/components/map/trails/OverlayTrailManager.svelte"
  import GhostTrailManager from "$lib/components/map/trails/GhostTrailManager.svelte"
  import DrawingHectares from "$lib/components/map/overlays/DrawingHectares.svelte"
  import CollectionRoutePlanner from "$lib/components/map/overlays/CollectionRoutePlanner.svelte"
  import NavigationControl from "$lib/components/map/toolbox/NavigationControl.svelte"
  import Toolbox from "$lib/components/map/toolbox/Toolbox.svelte"
  import CrosshairMarkerPlacement from "$lib/components/map/markers/CrosshairMarkerPlacement.svelte"
  import DrawingTool from "$lib/components/map/overlays/DrawingTool.svelte"
  import DrawingModePanel from "$lib/components/map/overlays/DrawingModePanel.svelte"
  import MarkerDrawings from "$lib/components/map/markers/MarkerDrawings.svelte"
  import DevModeJoystick from "$lib/components/map/dev/DevModeJoystick.svelte"
  import BackgroundSimPanel from "$lib/components/map/dev/BackgroundSimPanel.svelte"
  import {
    devModeEnabled,
    devBackgroundSimEnabled,
  } from "$lib/stores/devModeStore"

  // Import persistent managers
  import SatelliteManager from "$lib/components/map/toolbox/SatelliteManager.svelte"

  import { db } from "$lib/services/db.js"
  import { commands } from "$lib/stores/commandStore"
  import {
    userVehicleTrailing,
    userVehicleStore,
  } from "$lib/stores/vehicleStore"
  import {
    pendingCoordinatesStore,
    pendingClosuresStore,
  } from "$lib/stores/currentTrailStore"

  export let handleBackToDashboard
  export let initialLocation
  export let selectedOperation

  let dbInstance
  let markerManagerRef = null
  let mapFieldsRef = null
  let vehicleTrackerRef = null
  let mapEventManagerRef = null
  let trailHighlighter = null
  let toolboxRef = null

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

  // Pending sync data for ButtonSection
  let pendingCoordinates = []
  let pendingClosures = []

  // Trail modal state (managed at MapViewer level)
  let showTrailInfoModal = false
  let showExitModal = false

  // Layer ordering registry with trail support
  const LAYER_ORDER = {
    // EM overlay layers (very bottom) - 50-99
    "em-overlay-fill": { order: 50, category: "em-overlays" },
    "em-overlay-outline": { order: 51, category: "em-overlays" },

    // Bottom layers (fields) - 100-199
    "fields-fill": { order: 100, category: "field-base" },
    "fields-fill-selected": { order: 101, category: "field-base" },

    // Marker drawings (above fields, below markers) - 150-199
    "marker-drawings-fill": { order: 150, category: "marker-drawings" },
    "marker-drawings-line-solid": { order: 151, category: "marker-drawings" },
    "marker-drawings-line-dashed": { order: 152, category: "marker-drawings" },

    // Trail layers (middle) - 200-299
    "trail-layers-start": { order: 200, category: "trails" },

    // Field outlines and labels (above trails) - 300-399
    "fields-outline": { order: 300, category: "field-decoration" },
    "fields-outline-selected": { order: 301, category: "field-decoration" },
    "fields-labels-area": { order: 302, category: "field-decoration" },
    "fields-labels": { order: 303, category: "field-decoration" },

    // Marker layers (above everything) - 400-499
    "markers-layer": { order: 400, category: "markers" },
    "markers-selection-circle": { order: 401, category: "markers" },
    "markers-selected-layer": { order: 402, category: "markers" },
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
            "markers-selection-circle",
            "markers-selected-layer",
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
    // Historical trails should stay under active trail layers.
    addHistoricalTrailLayerOrdered: (layerConfig) => {
      if (!map || map.getLayer(layerConfig.id)) return false

      try {
        const layers = map.getStyle().layers
        const activeInsertAnchor = layers.find((layer) =>
          [
            "all-active-trails-layer",
            "all-active-trails-center-line",
            "all-active-trails-markers",
          ].includes(layer.id),
        )

        if (activeInsertAnchor) {
          map.addLayer(layerConfig, activeInsertAnchor.id)
          return true
        }

        const topTrailBoundary = layers.find((layer) =>
          [
            "fields-outline",
            "fields-outline-selected",
            "fields-labels-area",
            "fields-labels",
            "markers-layer",
            "markers-selection-circle",
            "markers-selected-layer",
          ].includes(layer.id),
        )

        if (topTrailBoundary) {
          map.addLayer(layerConfig, topTrailBoundary.id)
        } else {
          map.addLayer(layerConfig)
        }
        return true
      } catch (error) {
        console.error(
          `Error adding historical trail layer ${layerConfig.id}:`,
          error,
        )
        return false
      }
    },
    // Active trails should remain on top of historical trails.
    addActiveTrailLayerOrdered: (layerConfig) => {
      if (!map || map.getLayer(layerConfig.id)) return false

      try {
        const layers = map.getStyle().layers
        const topTrailBoundary = layers.find((layer) =>
          [
            "fields-outline",
            "fields-outline-selected",
            "fields-labels-area",
            "fields-labels",
            "markers-layer",
            "markers-selection-circle",
            "markers-selected-layer",
          ].includes(layer.id),
        )

        if (topTrailBoundary) {
          map.addLayer(layerConfig, topTrailBoundary.id)
        } else {
          map.addLayer(layerConfig)
        }
        return true
      } catch (error) {
        console.error(`Error adding active trail layer ${layerConfig.id}:`, error)
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
    // Don't place markers while lasso-drawing a collection route
    if ($collectionRouteStore.phase === "drawing") return
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
    console.log("Vehicle updated:", { type, color, swath })
  }

  // Handle trail viewer opening
  function handleOpenTrailViewer() {
    if (trailHighlighter?.highlighterAPI?.toggleNavigationUI) {
      // Register trail as active selection so other menus (fields/markers/vehicles) dismiss
      if (mapEventManagerRef?.setSelection) {
        mapEventManagerRef.setSelection("trail", "viewer", trailHighlighter)
      }
      trailHighlighter.highlighterAPI.toggleNavigationUI()
    } else {
      toast.error("Trail viewer not available")
    }
  }

  // Handle trail selected from My Trails list — fly to and highlight
  function handleTrailSelect(event) {
    const { trail, index } = event.detail
    if (!trail) return
    if (trailHighlighter?.highlighterAPI) {
      const api = trailHighlighter.highlighterAPI
      // Register trail as active selection so other menus dismiss
      if (mapEventManagerRef?.setSelection) {
        mapEventManagerRef.setSelection(
          "trail",
          `select-${index}`,
          trailHighlighter,
        )
      }
      // Ensure navigation UI is open (don't toggle it off if already open)
      if (api.toggleNavigationUI) api.toggleNavigationUI(true)
      if (api.navigateToTrail) api.navigateToTrail(index)
    }
  }

  // Handle replay button from My Trails list — open viewer and start playback
  function handleTrailReplay(event) {
    const { trail, index } = event.detail
    if (!trail) return
    if (trailHighlighter?.highlighterAPI) {
      const api = trailHighlighter.highlighterAPI
      // Register trail as active selection so other menus dismiss
      if (mapEventManagerRef?.setSelection) {
        mapEventManagerRef.setSelection(
          "trail",
          `replay-${index}`,
          trailHighlighter,
        )
      }
      // Ensure navigation UI is open (don't toggle it off if already open)
      if (api.toggleNavigationUI) api.toggleNavigationUI(true)
      // Directly start playback — playTrail handles navigation + animation
      if (api.playTrail) api.playTrail(index)
    }
    // Keep toolbox open — don't call closeToolbox()
  }

  function handleOpenVehicleControls() {
    console.log("🚗 Opening vehicle controls from vehicle panel icon click")
    toolboxOpen = true
    if (toolboxRef) {
      toolboxRef.switchToVehiclePanel()
    }
  }

  function handleOpenMarkerSettings() {
    console.log("📌 Opening marker settings from marker grid")
    toolboxOpen = true
    if (toolboxRef) {
      toolboxRef.switchToMarkerPanel()
    }
  }

  function handleOpenFlashPanel() {
    console.log("⚡ Opening flash panel from HUD")
    toolboxOpen = true
    if (toolboxRef) {
      toolboxRef.switchToFlashPanel()
    }
  }

  // Drawing callbacks
  function handleDrawingComplete() {
    console.log("Drawing completed")
    // Drawings are auto-reloaded when panel re-opens
  }

  function handleDrawingCancel() {
    console.log("Drawing cancelled")
  }

  function handleFieldSelect(event) {
    const { index, boundary } = event.detail
    // Register field as active selection so clicking map deselects it
    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection("field", `field-${index}`, mapFieldsRef)
    }
    // Highlight the field
    if (mapFieldsRef) {
      mapFieldsRef.handleFieldSelection(index)
    }
    // Zoom to field bounds
    if (map && boundary) {
      const coords =
        boundary.type === "MultiPolygon"
          ? boundary.coordinates.flat(2)
          : boundary.coordinates.flat(1)
      if (coords.length > 0) {
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
        map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 800 })
      }
    }
  }

  function handleMarkerSelect(event) {
    const marker = event.detail
    // Register marker as active selection so clicking map deselects it
    if (mapEventManagerRef?.setSelection && marker?.id) {
      mapEventManagerRef.setSelection("marker", `marker-${marker.id}`, markerManagerRef)
    }
    if (map && marker?.coordinates) {
      map.flyTo({
        center: marker.coordinates,
        zoom: 17,
        duration: 800,
      })
    }
    // Actually select the marker on the map (highlight it + show edit panel)
    if (markerManagerRef && marker?.id) {
      markerManagerRef.handleMarkerSelection({
        features: [
          {
            properties: { id: marker.id },
            geometry: { coordinates: marker.coordinates },
          },
        ],
      })
    }
    // Don't close toolbox — keep menu open like field selection
  }

  function handleToolAction(event) {
    const { type } = event.detail

    console.log("Tool action:", type)

    switch (type) {
      case "locate-home":
        handleLocateHome()
        break
      case "place-marker":
        toast.info("Marker placement mode activated")
        break
      case "drawing-mode":
        toast.info("Drawing mode activated")
        break
      case "vehicle-controls":
        toast.info("Vehicle controls opened")
        break
      case "trail-recording":
        toast.info("Trail recording toggled")
        break
      case "measurement":
        toast.info("Measurement tools opened")
        break
      case "map-sync":
        toast.info("Map sync initiated")
        break
      case "settings":
        toast.info("Settings opened")
        break
      default:
        console.warn("Unknown tool action:", type)
    }
  }

  // Handle pending data updates from TrailSynchronizer
  function handlePendingDataUpdate(event) {
    const { coordinates, closures } = event.detail
    pendingCoordinates = coordinates || []
    pendingClosures = closures || []
  }

  // Handle trail info modal request from ButtonSection
  function handleOpenTrailInfo() {
    showTrailInfoModal = true
  }

  // Handle exit request from ButtonSection
  function handleRequestExit() {
    const hasUnsyncedTrailChanges =
      $pendingCoordinatesStore.length > 0 || $pendingClosuresStore.length > 0

    const hasUnsyncedMarkerChanges =
      $pendingMarkerChangesStore.size > 0 ||
      $pendingMarkerDeletionsStore.size > 0

    // Show modal if trailing OR any unsynced changes exist
    if (
      $userVehicleTrailing ||
      hasUnsyncedTrailChanges ||
      hasUnsyncedMarkerChanges
    ) {
      showExitModal = true
    } else {
      handleBackToDashboard()
    }
  }

  // Handle confirmed exit from TrailModals
  function handleConfirmExit() {
    showExitModal = false

    if ($userVehicleTrailing) {
      commands.trail.stop()
      setTimeout(() => {
        handleBackToDashboard()
      }, 500)
    } else {
      handleBackToDashboard()
    }
  }

  // Handle cancel exit from TrailModals
  function handleCancelExit() {
    showExitModal = false
  }

  // Handle close trail info modal from TrailModals
  function handleCloseTrailInfo() {
    showTrailInfoModal = false
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

      markerStore.set(map)
      mapInitialized = true

      const setupMap = () => {
        mapLoaded = true
        initializeMapLocation()

        if (map.touchZoomRotate._tapDragZoom) {
          map.touchZoomRotate._tapDragZoom.disable()
        }

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
          styles: [
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
      markerStore.set(null)
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
      trailHighlighterRef={trailHighlighter}
      onLongPress={handleLongPress}
    />

    <!-- Persistent Managers -->
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
      <span class="toolbox-badge">Tools</span>
    </div>

    <!-- ButtonSection with event dispatching -->
    <ButtonSection
      {pendingCoordinates}
      {pendingClosures}
      on:openTrailInfo={handleOpenTrailInfo}
      on:requestExit={handleRequestExit}
      on:locateHome={handleLocateHome}
      on:openMarkerSettings={handleOpenMarkerSettings}
    />

    <NavigationControl />
    <MarkerManager
      bind:this={markerManagerRef}
      {map}
      {mapLoaded}
      coordinatedEvents={true}
    />

    <CrosshairMarkerPlacement {map} {markerManagerRef} />

    <MapStateSaver {map} />
    <VehicleStateSynchronizer />
    <VehicleTracker
      bind:this={vehicleTrackerRef}
      {map}
      disableAutoZoom={initialLocation}
      onOpenVehicleControls={handleOpenVehicleControls}
      onOpenFlashPanel={handleOpenFlashPanel}
    />
    <MapFields bind:this={mapFieldsRef} {map} coordinatedEvents={true} />
    <EmOverlays {map} />
    <MarkerDrawings {map} currentMarkerId={$selectedMarkerStore?.id} />

    <DrawingHectares {map} />
    <CollectionRoutePlanner {map} />

    <TrailView bind:this={trailHighlighter} {map} />
    <OverlayTrailManager {map} />
    <GhostTrailManager {map} />

    <!-- TrailSynchronizer with pending data event -->
    {#if selectedOperation}
      <TrailSynchronizer
        {selectedOperation}
        {map}
        on:pendingDataUpdate={handlePendingDataUpdate}
      />
    {/if}

    <!-- Drawing Components (Always Present) -->
    <DrawingTool {map} />
    <DrawingModePanel
      {map}
      onComplete={handleDrawingComplete}
      onCancel={handleDrawingCancel}
    />
  {/if}
</div>

<!-- Toolbox -->
<Toolbox
  bind:this={toolboxRef}
  {satelliteManager}
  trailReplayAPI={trailHighlighter?.highlighterAPI}
  isOpen={toolboxOpen}
  on:close={closeToolbox}
  on:tool={handleToolAction}
  on:openTrailViewer={handleOpenTrailViewer}
  on:selectField={handleFieldSelect}
  on:selectMarker={handleMarkerSelect}
  on:selectTrail={handleTrailSelect}
  on:replayTrail={handleTrailReplay}
/>

<!-- Dev Mode Joystick Overlay -->
{#if $devModeEnabled}
  <DevModeJoystick {map} />
{/if}

<!-- Background Simulation Panel -->
{#if $devModeEnabled || $devBackgroundSimEnabled}
  <BackgroundSimPanel {map} />
{/if}

<!-- Trail Modals (rendered at MapViewer level - no constraints!) -->
<TrailModals
  bind:showTrailInfo={showTrailInfoModal}
  bind:showExitModal
  on:confirmExit={handleConfirmExit}
  on:cancelExit={handleCancelExit}
  on:closeTrailInfo={handleCloseTrailInfo}
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
    color: #000000;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
  }

  .toolbox-trigger-button.active {
    background-color: rgba(0, 0, 0, 0.5);
    border-color: #000000;
    color: #f7db5c;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
  }

  .toolbox-badge {
    position: absolute;
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f7db5c;
    border: 1.5px solid #000;
    border-radius: 10px;
    padding: 2px 8px;
    z-index: 12;
    white-space: nowrap;
    height: 18px;
    pointer-events: none;
    font-size: 8px;
    font-weight: 900;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1;
  }

  :global(.mapboxgl-ctrl-logo) {
    display: none !important;
  }
</style>
