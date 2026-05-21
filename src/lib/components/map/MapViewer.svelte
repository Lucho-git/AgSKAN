<!-- src/lib/components/map/MapViewer.svelte -->
<script>
  import { onMount, onDestroy, setContext } from "svelte"
  import mapboxgl from "mapbox-gl"
  import "mapbox-gl/dist/mapbox-gl.css"
  import MapboxDraw from "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.js"
  import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css"
  import * as turf from "@turf/turf"

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
  import { drawingModeEnabled } from "$lib/stores/controlStore"
  import { connectedMapStore } from "$lib/stores/connectedMapStore"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import { fileApi } from "$lib/api/fileApi"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"

  // Import lucide icons for the toolbox
  import { LandPlot, Menu, Pencil, Search, X } from "lucide-svelte"

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
  import AddFieldOverlay from "$lib/components/map/overlays/AddFieldOverlay.svelte"
  import FieldCandidateOverlay from "$lib/components/map/overlays/FieldCandidateOverlay.svelte"
  import FtwPmtilesOverlay from "$lib/components/map/overlays/FtwPmtilesOverlay.svelte"
  import CreateFieldOverlay from "$lib/components/map/overlays/CreateFieldOverlay.svelte"
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
  import { fieldBoundaryCandidatesApi } from "$lib/api/fieldBoundaryCandidatesApi"

  export let handleBackToDashboard
  export let initialLocation
  export let selectedOperation

  let dbInstance
  let markerManagerRef = null
  let mapFieldsRef = null
  let addFieldOverlayRef = null
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
  let addFieldChoiceFarm = null
  let addFieldFarm = null
  let addFieldSeed = null
  let fieldCandidateCollection = null
  let fieldCandidateFarm = null
  let fieldCandidateTilesVisible = false
  let fieldCandidateYear = 2025
  let loadingFieldCandidates = false
  let selectedFieldCandidate = null
  let selectingAdditionalFieldArea = false
  let fieldCandidateError = ""
  let selectedPmtilesFeatures = []
  $: selectedPmtilesFeatures = getSelectedPmtilesFeatures(
    fieldCandidateCollection,
  )
  $: selectedPmtilesFeatureCount = selectedPmtilesFeatures.length
  $: selectedPmtilesFeatureHectares = selectedPmtilesFeatures.reduce(
    (total, feature) => total + (Number(feature?.properties?.area_ha) || 0),
    0,
  )
  let createFieldOverlayRef = null
  let creatingFieldFarm = null
  let createFieldTab = "select"
  // Remember the last tab the user chose, so re-opening Create Field or
  // Add Area returns them to that tab.
  let lastCreateFieldTab = "select"
  $: createFieldActive =
    !!creatingFieldFarm ||
    (selectingAdditionalFieldArea && (!!boundaryEditField || !!addFieldFarm))
  $: createFieldContextName =
    creatingFieldFarm?.farmName ||
    boundaryEditField?.name ||
    addFieldFarm?.farmName ||
    ""
  // Only show PMTiles tap-to-select tiles when the user is on the Select tab.
  $: showPmtilesSelectTiles = createFieldActive && createFieldTab === "select"
  $: console.log("[CreateField] state", {
    createFieldActive,
    createFieldTab,
    showPmtilesSelectTiles,
    creatingFieldFarm: creatingFieldFarm?.farmName || null,
    addFieldFarm: addFieldFarm?.farmName || null,
    selectingAdditionalFieldArea,
    boundaryEditField: boundaryEditField?.name || null,
    selectedPmtilesFeatureCount,
    selectedPmtilesFeatureHectares,
  })
  let savingAddField = false
  let fieldEditTarget = null
  let fieldEditName = ""
  let boundaryEditField = null
  let savingFieldEdit = false

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
        console.error(
          `Error adding active trail layer ${layerConfig.id}:`,
          error,
        )
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
    if (addFieldFarm || boundaryEditField) return
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

  function getBoundaryCoordinates(boundary) {
    if (!boundary) return []

    if (typeof boundary === "string") {
      try {
        return getBoundaryCoordinates(JSON.parse(boundary))
      } catch (error) {
        return []
      }
    }

    if (boundary.type === "Feature") {
      return getBoundaryCoordinates(boundary.geometry)
    }

    return boundary.type === "MultiPolygon"
      ? boundary.coordinates.flat(2)
      : boundary.coordinates?.flat(1) || []
  }

  function zoomToBoundary(boundary) {
    if (!map || !boundary) return

    const coords = getBoundaryCoordinates(boundary)
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

    map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 800 })
  }

  function focusField(field) {
    if (!field) return

    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection(
        "field",
        `field-${field._index ?? field.field_id}`,
        mapFieldsRef,
      )
    }

    if (mapFieldsRef && field._index !== undefined) {
      mapFieldsRef.handleFieldSelection(field._index)
    }

    zoomToBoundary(field.boundary)
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
    zoomToBoundary(boundary)
  }

  function handleAddField(event) {
    const farm = event.detail
    console.log("[CreateField] handleAddField", { farmName: farm?.farmName })
    addFieldChoiceFarm = null
    addFieldFarm = null
    addFieldSeed = null
    clearFieldCandidateState()
    fieldEditTarget = null
    boundaryEditField = null
    $drawingModeEnabled = false
    toolboxOpen = false

    // Open the unified Create Field overlay; default to the user's last tab.
    createFieldTab = lastCreateFieldTab
    creatingFieldFarm = farm || null
    fieldCandidateFarm = farm || null
    fieldCandidateTilesVisible = true
    fieldCandidateError = ""

    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection("field", "create-field", mapFieldsRef)
    }
  }

  function closeAddFieldChoice() {
    if (loadingFieldCandidates) return
    addFieldChoiceFarm = null
  }

  function buildBboxAroundMapCenter(radiusMeters = 500) {
    const center = map?.getCenter?.()
    if (!center) return null

    return buildBboxAroundLngLat(center, radiusMeters)
  }

  function buildBboxAroundLngLat(lngLat, radiusMeters = 25) {
    if (!lngLat) return null

    const latDelta = radiusMeters / 111320
    const lngDelta =
      radiusMeters /
      (111320 * Math.max(Math.cos((lngLat.lat * Math.PI) / 180), 0.01))

    return {
      xmin: lngLat.lng - lngDelta,
      ymin: lngLat.lat - latDelta,
      xmax: lngLat.lng + lngDelta,
      ymax: lngLat.lat + latDelta,
    }
  }

  function chooseClickedCandidate(features, lngLat) {
    if (!features?.length) return null

    const point = turf.point([lngLat.lng, lngLat.lat])
    const containingFeature = features.find((feature) => {
      try {
        return turf.booleanPointInPolygon(point, feature)
      } catch (error) {
        return false
      }
    })

    if (containingFeature) return containingFeature

    return features.reduce((closestFeature, feature) => {
      if (!closestFeature) return feature

      try {
        const closestDistance = turf.distance(
          point,
          turf.centroid(closestFeature),
          {
            units: "kilometers",
          },
        )
        const featureDistance = turf.distance(point, turf.centroid(feature), {
          units: "kilometers",
        })
        return featureDistance < closestDistance ? feature : closestFeature
      } catch (error) {
        return closestFeature
      }
    }, null)
  }

  function getCandidateAreaLabel(candidate) {
    const area = candidate?.properties?.area_ha
    return Number.isFinite(Number(area))
      ? `${Math.round(Number(area) * 100) / 100} ha`
      : "Boundary ready"
  }

  function cloneGeometry(geometry) {
    if (!geometry?.type || !geometry?.coordinates) return null

    try {
      return JSON.parse(JSON.stringify(geometry))
    } catch (error) {
      return null
    }
  }

  function getGeometryAreaHa(geometry) {
    if (!geometry) return null

    try {
      return Math.round((turf.area(geometry) / 10000) * 100) / 100
    } catch (error) {
      return null
    }
  }

  function createCandidateFromPmtilesFeature(feature, lngLat) {
    const geometry = cloneGeometry(feature?.geometry)
    if (!["Polygon", "MultiPolygon"].includes(geometry?.type)) return null

    const properties = feature?.properties || {}
    const areaHa = getGeometryAreaHa(geometry)
    const selectionKey =
      properties.ftw_id ||
      properties.id ||
      feature?.id ||
      getCandidateGeometryKey(geometry)

    return {
      type: "Feature",
      geometry,
      properties: {
        ...properties,
        ftw_id:
          properties.ftw_id ||
          properties.id ||
          feature?.id ||
          `pmtiles-${fieldCandidateYear}-${lngLat?.lng ?? "unknown"}-${lngLat?.lat ?? "unknown"}`,
        selection_key: selectionKey,
        provider: properties.provider || "ftw",
        year: fieldCandidateYear,
        area_ha: areaHa,
        boundary_source: "pmtiles",
        selectedFrom: "ftw_pmtiles_vector_tile",
        selectedAt: new Date().toISOString(),
      },
    }
  }

  function getCandidateGeometryKey(geometry) {
    if (!geometry?.type || !geometry?.coordinates) return null

    try {
      return `${geometry.type}:${JSON.stringify(geometry.coordinates)}`
    } catch (error) {
      return null
    }
  }

  function getCandidateSelectionKey(candidate) {
    return (
      candidate?.properties?.selection_key ||
      candidate?.properties?.ftw_id ||
      candidate?.properties?.id ||
      candidate?.id ||
      getCandidateGeometryKey(candidate?.geometry)
    )
  }

  function getSelectedPmtilesFeatures(collection = fieldCandidateCollection) {
    return (collection?.features || []).filter(
      (feature) => feature.properties?.boundary_source === "pmtiles",
    )
  }

  function toggleSelectedFieldCandidate(candidate) {
    const candidateKey = getCandidateSelectionKey(candidate)
    if (!candidateKey)
      return { selected: false, count: selectedPmtilesFeatureCount }

    const existingFeatures = getSelectedPmtilesFeatures(
      fieldCandidateCollection,
    )
    const nextFeatures = existingFeatures.filter(
      (feature) => getCandidateSelectionKey(feature) !== candidateKey,
    )
    const wasSelected = nextFeatures.length !== existingFeatures.length

    if (!wasSelected) {
      nextFeatures.push(candidate)
    }

    selectedFieldCandidate = wasSelected
      ? nextFeatures[nextFeatures.length - 1] || null
      : candidate
    fieldCandidateCollection = nextFeatures.length
      ? {
          type: "FeatureCollection",
          features: nextFeatures,
        }
      : null

    return { selected: !wasSelected, count: nextFeatures.length }
  }

  function createSeedFieldFromCandidate(candidate) {
    return createSeedFieldFromCandidates([candidate])
  }

  function createSeedFieldFromCandidates(candidates) {
    const features = (candidates || []).filter(Boolean)
    if (!features.length) return null

    const polygonCoordinates = []
    features.forEach((candidate) => {
      const geometry = cloneGeometry(candidate.geometry)
      if (geometry?.type === "Polygon") {
        polygonCoordinates.push(geometry.coordinates)
      } else if (geometry?.type === "MultiPolygon") {
        polygonCoordinates.push(...geometry.coordinates)
      }
    })

    if (!polygonCoordinates.length) return null

    const boundary =
      polygonCoordinates.length === 1
        ? { type: "Polygon", coordinates: polygonCoordinates[0] }
        : { type: "MultiPolygon", coordinates: polygonCoordinates }

    const firstCandidate = features[0]
    const properties = firstCandidate?.properties || {}
    const areaHa = getGeometryAreaHa(boundary) || 0

    return {
      id: properties.ftw_id || `ftw-selected-${Date.now()}`,
      name: "",
      boundary,
      area: areaHa,
      properties: {
        ...properties,
        sourceType: "FieldsOfTheWorld",
        provider: properties.provider || "ftw",
        selectedFrom: properties.selectedFrom || "ftw_visual_tile_layer",
        selectedCount: features.length,
        selectedAt: new Date().toISOString(),
      },
    }
  }

  function clearFieldCandidateState(clearFarm = true) {
    console.log("[CreateField] clearFieldCandidateState", { clearFarm })
    fieldCandidateCollection = null
    if (clearFarm) fieldCandidateFarm = null
    fieldCandidateTilesVisible = false
    selectedFieldCandidate = null
    selectingAdditionalFieldArea = false
    fieldCandidateError = ""
    creatingFieldFarm = null
    createFieldTab = "select"
  }

  function beginDrawNewField() {
    if (!addFieldChoiceFarm) return
    addFieldFarm = addFieldChoiceFarm
    addFieldSeed = null
    addFieldChoiceFarm = null
    clearFieldCandidateState()
    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection("field", "new-field", mapFieldsRef)
    }
  }

  async function beginFieldCandidateSearch() {
    if (!addFieldChoiceFarm) return

    fieldCandidateCollection = null
    fieldCandidateFarm = addFieldChoiceFarm
    fieldCandidateTilesVisible = true
    fieldCandidateYear = 2025
    selectedFieldCandidate = null
    fieldCandidateError = ""
    addFieldChoiceFarm = null
  }

  function handleFtwFieldSelect(event) {
    const isAddingAreaToDraft =
      selectingAdditionalFieldArea && addFieldOverlayRef
    if (
      (!fieldCandidateFarm && !isAddingAreaToDraft) ||
      loadingFieldCandidates
    ) {
      return
    }

    const lngLat = event.detail?.lngLat
    const selectedCandidate = createCandidateFromPmtilesFeature(
      event.detail?.feature,
      lngLat,
    )

    if (!selectedCandidate) {
      toast.error("Could not read the selected field location")
      return
    }

    fieldCandidateError = ""
    // Selection feedback is visible in the bottom action bar; no toast needed.
    toggleSelectedFieldCandidate(selectedCandidate)
  }

  async function loadExactFieldCandidates() {
    if (!fieldCandidateFarm || loadingFieldCandidates) return

    const bbox = buildBboxAroundMapCenter()
    if (!bbox) {
      toast.error("Map is not ready yet")
      return
    }

    loadingFieldCandidates = true
    fieldCandidateError = ""

    try {
      const candidates = await fieldBoundaryCandidatesApi.getCandidates({
        bbox,
        year: fieldCandidateYear,
        limit: 75,
        source: "local",
      })
      fieldCandidateCollection = candidates
      selectedFieldCandidate = null

      if (candidates.features?.length) {
        toast.success(`Loaded ${candidates.features.length} exact candidates`)
      } else {
        toast.info("No exact candidates found in this area")
      }
    } catch (error) {
      console.error("Error loading field candidates:", error)
      fieldCandidateError = error.message || "Failed to load field candidates"
      toast.error(fieldCandidateError)
    } finally {
      loadingFieldCandidates = false
    }
  }

  function clearFieldCandidates() {
    clearFieldCandidateState()
    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection(null, null, null)
    }
  }

  function useSelectedFieldCandidate() {
    const selectedFeatures = getSelectedPmtilesFeatures(
      fieldCandidateCollection,
    )
    console.log("[CreateField] useSelectedFieldCandidate", {
      count: selectedFeatures.length,
      selectingAdditionalFieldArea,
      hasOverlayRef: !!addFieldOverlayRef,
    })
    if (!selectedFeatures.length) return

    const seedField = createSeedFieldFromCandidates(selectedFeatures)
    if (!seedField) {
      toast.error("Could not prepare the selected fields")
      return
    }

    if (selectingAdditionalFieldArea) {
      if (!addFieldOverlayRef) return

      addFieldOverlayRef.addSeedArea(seedField)
      clearFieldCandidateState()
      toast.success(
        `Added ${selectedFeatures.length} field area${selectedFeatures.length === 1 ? "" : "s"}`,
      )
      return
    }

    if (!fieldCandidateFarm) return

    addFieldFarm = fieldCandidateFarm
    addFieldSeed = seedField
    addFieldChoiceFarm = null
    clearFieldCandidateState()

    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection("field", "new-ftw-field", mapFieldsRef)
    }
  }

  function handleEditField(event) {
    const field = event.detail?.field
    if (!field?.field_id) {
      toast.error("This field cannot be edited yet")
      return
    }

    fieldEditTarget = null
    fieldEditName = ""
    addFieldChoiceFarm = null
    addFieldFarm = null
    addFieldSeed = null
    clearFieldCandidateState()
    boundaryEditField = field
    toolboxOpen = false
    focusField(field)

    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection(
        "field",
        `edit-field-${field.field_id}`,
        mapFieldsRef,
      )
    }
  }

  function closeFieldEditModal() {
    if (savingFieldEdit) return
    fieldEditTarget = null
    fieldEditName = ""
  }

  async function saveFieldNameEdit() {
    if (!fieldEditTarget?.field_id || savingFieldEdit) return

    const nextName = fieldEditName.trim()
    if (!nextName) {
      toast.error("Field name is required")
      return
    }

    const updates = {
      name: nextName,
      properties: {
        ...(fieldEditTarget.properties || {}),
        FIELD_NAME: nextName,
      },
    }

    savingFieldEdit = true

    const promise = fileApi
      .updateField(fieldEditTarget.field_id, updates)
      .then((result) => {
        if (!result.success) {
          throw new Error(result.message || "Failed to update field")
        }
        return result
      })

    toast.promise(promise, {
      loading: "Updating field...",
      success: `Field renamed to "${nextName}".`,
      error: (error) => error.message,
    })

    try {
      await promise
      const fieldId = fieldEditTarget.field_id
      mapFieldsStore.update((fields) =>
        fields.map((field) =>
          field.field_id === fieldId ? { ...field, ...updates } : field,
        ),
      )
      fieldEditTarget = null
      fieldEditName = ""
    } catch (error) {
      console.error("Error updating field name:", error)
    } finally {
      savingFieldEdit = false
    }
  }

  function startFieldBoundaryEdit() {
    if (!fieldEditTarget?.boundary || savingFieldEdit) return

    boundaryEditField = fieldEditTarget
    fieldEditTarget = null
    fieldEditName = ""
    addFieldFarm = null
    $drawingModeEnabled = false
    focusField(boundaryEditField)

    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection(
        "field",
        `edit-field-${boundaryEditField.field_id}`,
        mapFieldsRef,
      )
    }
  }

  function handleFieldEditCancel() {
    if (savingFieldEdit) return
    boundaryEditField = null
    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection(null, null, null)
    }
  }

  function handleAddFieldCancel() {
    addFieldFarm = null
    addFieldSeed = null
    clearFieldCandidateState()
    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection(null, null, null)
    }
  }

  async function handleAddFieldComplete(event) {
    if (savingAddField) return

    const detail = event.detail || {}
    const fieldName = detail.fieldName?.trim()
    const mapId = $connectedMapStore?.id

    if (!fieldName) {
      toast.error("Field name is required")
      return
    }

    if (!mapId) {
      toast.error("No map connected. Please connect to a map first.")
      return
    }

    savingAddField = true

    const paddock = {
      name: fieldName,
      boundary: detail.boundary,
      area: detail.area?.hectares || 0,
      status: "accepted",
      properties: {
        FIELD_NAME: fieldName,
        FARM_NAME: detail.farmName,
        FIELD_AREA: detail.area?.hectares || 0,
        AREA_SQUARE_METERS: detail.area?.squareMeters || 0,
        PART_COUNT: detail.partCount || 1,
        sourceType: "DrawnInApp",
        createdFrom: "map_add_field_overlay",
        drawnAt: new Date().toISOString(),
      },
      isMultiPolygon: detail.boundary?.type === "MultiPolygon",
      polygon_areas: detail.polygonAreas || null,
      farm_id: detail.farmId,
    }

    const promise = fileApi.uploadFields(mapId, [paddock]).then((result) => {
      if (!result.success) {
        throw new Error(result.message || "Failed to save field")
      }
      if (!result.insertedFields?.length) {
        const rejectedReason = result.rejectedFields?.[0]?.reason
        throw new Error(rejectedReason || "No field was saved")
      }
      return result
    })

    toast.promise(promise, {
      loading: "Saving field...",
      success: (result) => `Field "${result.insertedFields[0].name}" saved.`,
      error: (error) => error.message,
    })

    try {
      const result = await promise
      const insertedField = result.insertedFields[0]
      mapFieldsStore.update((fields) => [...fields, insertedField])
      addFieldFarm = null
      addFieldSeed = null
      addFieldChoiceFarm = null
      clearFieldCandidateState()
      if (mapFieldsRef?.handleFieldSelection) {
        mapFieldsRef.handleFieldSelection(null)
      }
      if (mapEventManagerRef?.setSelection) {
        mapEventManagerRef.setSelection(null, null, null)
      }
    } catch (error) {
      console.error("Error saving drawn field:", error)
    } finally {
      savingAddField = false
    }
  }

  function handleSelectAdditionalFieldArea() {
    if (
      (!addFieldFarm && !boundaryEditField) ||
      savingAddField ||
      savingFieldEdit
    )
      return

    console.log("[CreateField] handleSelectAdditionalFieldArea", {
      hasAddFieldFarm: !!addFieldFarm,
      hasBoundaryEditField: !!boundaryEditField,
    })

    selectingAdditionalFieldArea = true
    creatingFieldFarm = null
    createFieldTab = lastCreateFieldTab
    fieldCandidateFarm = addFieldFarm || {
      farmName:
        boundaryEditField?.properties?.FARM_NAME ||
        boundaryEditField?.farm_name ||
        boundaryEditField?.name ||
        "Selected field",
    }
    fieldCandidateCollection = null
    selectedFieldCandidate = null
    fieldCandidateTilesVisible = true
    fieldCandidateError = ""
  }

  function handleCreateFieldCancel() {
    // If we were adding to an existing draft/field, return to the review panel.
    const wasAddingArea =
      selectingAdditionalFieldArea && (!!boundaryEditField || !!addFieldFarm)
    console.log("[CreateField] handleCreateFieldCancel", { wasAddingArea })
    clearFieldCandidateState()
    if (!wasAddingArea && mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection(null, null, null)
    }
  }

  function handleCreateFieldClearSelection() {
    console.log("[CreateField] handleCreateFieldClearSelection")
    fieldCandidateCollection = null
    selectedFieldCandidate = null
  }

  function handleCreateFieldTabChange(event) {
    const nextTab = event?.detail?.tab || "select"
    console.log("[CreateField] handleCreateFieldTabChange", {
      previous: createFieldTab,
      next: nextTab,
    })
    createFieldTab = nextTab
    lastCreateFieldTab = nextTab
    // When leaving Select for Draw, also clear any selected PMTiles fields so
    // they don't linger as highlighted polygons in the background.
    if (nextTab !== "select") {
      fieldCandidateCollection = null
      selectedFieldCandidate = null
    }
  }

  function handleCreateFieldConfirmSelect() {
    console.log("[CreateField] handleCreateFieldConfirmSelect", {
      selectedPmtilesFeatureCount,
      selectingAdditionalFieldArea,
    })
    // Reuse existing seeding logic which dispatches into AddFieldOverlay.
    useSelectedFieldCandidate()
  }

  function handleCreateFieldConfirmDraw(event) {
    const detail = event.detail || {}
    const boundary = detail.boundary
    if (!boundary) return

    const seedField = {
      name: "",
      boundary,
      properties: {
        sourceType: "DrawnBoundary",
        provider: "manual",
      },
    }

    const wasAddingArea =
      selectingAdditionalFieldArea && (!!boundaryEditField || !!addFieldFarm)
    console.log("[CreateField] handleCreateFieldConfirmDraw", {
      wasAddingArea,
      areaHa: detail.area?.hectares,
      hasOverlayRef: !!addFieldOverlayRef,
    })
    if (wasAddingArea && addFieldOverlayRef) {
      addFieldOverlayRef.addSeedArea(seedField)
      clearFieldCandidateState()
      return
    }

    addFieldFarm = creatingFieldFarm || fieldCandidateFarm
    addFieldSeed = seedField
    clearFieldCandidateState()

    if (mapEventManagerRef?.setSelection) {
      mapEventManagerRef.setSelection("field", "new-field-draw", mapFieldsRef)
    }
  }

  async function handleFieldBoundaryUpdate(event) {
    if (savingFieldEdit) return

    const targetField = boundaryEditField
    const detail = event.detail || {}
    const fieldName = detail.fieldName?.trim()

    if (!targetField?.field_id) {
      toast.error("Field could not be updated")
      return
    }

    if (!fieldName) {
      toast.error("Field name is required")
      return
    }

    savingFieldEdit = true

    const areaHectares = detail.area?.hectares || 0
    const areaSquareMeters = detail.area?.squareMeters || 0
    const properties = {
      ...(targetField.properties || {}),
      FIELD_NAME: fieldName,
      FIELD_AREA: areaHectares,
      AREA_SQUARE_METERS: areaSquareMeters,
      PART_COUNT: detail.partCount || 1,
      updatedFrom: "map_edit_field_overlay",
      boundaryUpdatedAt: new Date().toISOString(),
    }

    const updates = {
      name: fieldName,
      boundary: detail.boundary,
      area: areaHectares,
      polygonAreas: detail.polygonAreas || null,
      properties,
    }

    const promise = fileApi
      .updateField(targetField.field_id, updates)
      .then((result) => {
        if (!result.success) {
          throw new Error(result.message || "Failed to update field")
        }
        return result
      })

    toast.promise(promise, {
      loading: "Updating boundary...",
      success: `Field "${fieldName}" updated.`,
      error: (error) => error.message,
    })

    try {
      await promise
      mapFieldsStore.update((fields) =>
        fields.map((field) =>
          field.field_id === targetField.field_id
            ? {
                ...field,
                name: updates.name,
                boundary: updates.boundary,
                area: updates.area,
                polygon_areas: updates.polygonAreas,
                properties: updates.properties,
              }
            : field,
        ),
      )
      boundaryEditField = null
      clearFieldCandidateState()
      if (mapFieldsRef?.handleFieldSelection) {
        mapFieldsRef.handleFieldSelection(null)
      }
      if (mapEventManagerRef?.setSelection) {
        mapEventManagerRef.setSelection(null, null, null)
      }
    } catch (error) {
      console.error("Error updating field boundary:", error)
    } finally {
      savingFieldEdit = false
    }
  }

  async function handleFieldDelete(event) {
    if (savingFieldEdit) return

    const targetField = event.detail?.field || boundaryEditField
    if (!targetField?.field_id) {
      toast.error("Field could not be deleted")
      return
    }

    await runFieldDelete(targetField, targetField.name || "this field")
  }

  // Invoked from InfoPanel where the user already confirmed via the in-panel
  // countdown — skip the extra window.confirm so the action is immediate.
  async function handleInfoPanelDelete(event) {
    if (savingFieldEdit) return
    const targetField = event.detail?.field
    if (!targetField?.field_id) {
      toast.error("Field could not be deleted")
      return
    }
    await runFieldDelete(targetField, targetField.name || "this field")
  }

  async function runFieldDelete(targetField, fieldName) {
    savingFieldEdit = true

    const promise = fileApi.deleteField(targetField.field_id).then((result) => {
      if (!result.success) {
        throw new Error(result.message || "Failed to delete field")
      }
      return result
    })

    toast.promise(promise, {
      loading: "Deleting field...",
      success: `Field "${fieldName}" deleted.`,
      error: (error) => error.message,
    })

    try {
      await promise
      mapFieldsStore.update((fields) =>
        fields.filter((field) => field.field_id !== targetField.field_id),
      )
      boundaryEditField = null
      fieldEditTarget = null
      clearFieldCandidateState()
      if (mapEventManagerRef?.setSelection) {
        mapEventManagerRef.setSelection(null, null, null)
      }
    } catch (error) {
      console.error("Error deleting field:", error)
    } finally {
      savingFieldEdit = false
    }
  }

  function handleMarkerSelect(event) {
    const marker = event.detail
    // Register marker as active selection so clicking map deselects it
    if (mapEventManagerRef?.setSelection && marker?.id) {
      mapEventManagerRef.setSelection(
        "marker",
        `marker-${marker.id}`,
        markerManagerRef,
      )
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
    <MapFields
      bind:this={mapFieldsRef}
      {map}
      coordinatedEvents={true}
      on:editBoundaries={handleEditField}
      on:deleteField={handleInfoPanelDelete}
    />
    <FtwPmtilesOverlay
      {map}
      visible={showPmtilesSelectTiles}
      year={fieldCandidateYear}
      on:select={handleFtwFieldSelect}
    />
    <FieldCandidateOverlay
      {map}
      candidates={fieldCandidateCollection}
      visible={!!fieldCandidateCollection}
    />
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

    {#if addFieldFarm}
      <AddFieldOverlay
        bind:this={addFieldOverlayRef}
        {map}
        farm={addFieldFarm}
        seedField={addFieldSeed}
        saving={savingAddField}
        hidden={selectingAdditionalFieldArea}
        on:cancel={handleAddFieldCancel}
        on:complete={handleAddFieldComplete}
        on:selectArea={handleSelectAdditionalFieldArea}
      />
    {:else if boundaryEditField}
      <AddFieldOverlay
        bind:this={addFieldOverlayRef}
        {map}
        existingField={boundaryEditField}
        saving={savingFieldEdit}
        hidden={selectingAdditionalFieldArea}
        on:cancel={handleFieldEditCancel}
        on:complete={handleFieldBoundaryUpdate}
        on:selectArea={handleSelectAdditionalFieldArea}
        on:delete={handleFieldDelete}
      />
    {/if}
  {/if}
</div>

{#if fieldEditTarget}
  <div class="field-edit-modal-backdrop">
    <section
      class="field-edit-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="field-edit-title"
    >
      <div class="field-edit-modal-header">
        <div>
          <h2 id="field-edit-title">Edit Field</h2>
          <p>{fieldEditTarget.name}</p>
        </div>
        <button
          class="field-edit-close"
          on:click={closeFieldEditModal}
          disabled={savingFieldEdit}
          aria-label="Close field editor"
        >
          ×
        </button>
      </div>

      <label class="field-edit-label" for="field-edit-name">Field name</label>
      <input
        id="field-edit-name"
        class="field-edit-input"
        bind:value={fieldEditName}
        disabled={savingFieldEdit}
        maxlength="40"
        on:keydown={(event) => {
          if (event.key === "Enter") saveFieldNameEdit()
          if (event.key === "Escape") closeFieldEditModal()
        }}
      />

      <div class="field-edit-actions">
        <button
          class="field-edit-secondary"
          on:click={startFieldBoundaryEdit}
          disabled={savingFieldEdit || !fieldEditTarget.boundary}
        >
          Boundaries
        </button>
        <button
          class="field-edit-primary"
          on:click={saveFieldNameEdit}
          disabled={savingFieldEdit || !fieldEditName.trim()}
        >
          {savingFieldEdit ? "Saving" : "Save Name"}
        </button>
      </div>
    </section>
  </div>
{/if}

{#if createFieldActive}
  <CreateFieldOverlay
    bind:this={createFieldOverlayRef}
    {map}
    farmName={createFieldContextName}
    initialTab={createFieldTab}
    selectionCount={selectedPmtilesFeatureCount}
    selectionHectares={selectedPmtilesFeatureHectares}
    returnsToReview={selectingAdditionalFieldArea &&
      (!!boundaryEditField || !!addFieldFarm)}
    on:cancel={handleCreateFieldCancel}
    on:clearSelection={handleCreateFieldClearSelection}
    on:tabChange={handleCreateFieldTabChange}
    on:confirmSelect={handleCreateFieldConfirmSelect}
    on:confirmDraw={handleCreateFieldConfirmDraw}
  />
{/if}

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
  on:addField={handleAddField}
  on:editField={handleEditField}
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

  .field-edit-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(4px);
  }

  .field-edit-modal {
    width: min(440px, 100%);
    background: rgba(10, 14, 22, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.48);
    color: #fff;
    padding: 16px;
  }

  .field-edit-modal-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 14px;
  }

  .field-edit-modal h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
  }

  .field-edit-modal p {
    margin: 3px 0 0;
    color: rgba(255, 255, 255, 0.58);
    font-size: 13px;
  }

  .field-edit-close {
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.82);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .field-edit-label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.68);
  }

  .field-edit-input {
    width: 100%;
    min-height: 42px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    padding: 0 12px;
    font-size: 15px;
    outline: none;
  }

  .field-edit-input:focus {
    border-color: rgba(14, 165, 233, 0.68);
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.14);
  }

  .field-edit-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 14px;
  }

  .field-edit-primary,
  .field-edit-secondary {
    min-height: 42px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .field-edit-primary {
    background: rgba(34, 197, 94, 0.92);
    color: #fff;
    border-color: rgba(134, 239, 172, 0.45);
  }

  .field-edit-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.82);
  }

  .field-edit-primary:disabled,
  .field-edit-secondary:disabled,
  .field-edit-close:disabled {
    opacity: 0.46;
    cursor: not-allowed;
  }

  @media (max-width: 520px) {
    .field-edit-modal-backdrop {
      padding: 0;
    }

    .field-edit-modal {
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
    }
  }
</style>
