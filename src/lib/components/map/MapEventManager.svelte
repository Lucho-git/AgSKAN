<!-- src/lib/components/map/MapEventManager.svelte -->
<script>
  import { onMount, onDestroy, setContext } from "svelte"
  import { get } from "svelte/store"
  import {
    confirmedMarkersStore,
    collectionRouteStore,
    selectedMarkerStore,
  } from "$lib/stores/markerStore"
  import { drawingModeEnabled } from "$lib/stores/controlStore"
  import { mapInteractionsSuppressed } from "$lib/stores/controlStore"
  import { controlStore } from "$lib/stores/controlStore"
  import { kmzOverlaysStore } from "$lib/stores/kmzOverlaysStore"
  import { pendingDrawingSelection } from "$lib/stores/markerDrawingSelectionStore"
  import { userVehicleStore, otherVehiclesStore } from "$lib/stores/vehicleStore"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"
  import {
    locationPickStore,
    completeLocationPick,
    markLocationPickHandled,
    locationPickHandledRecently,
    focusMapLocation,
  } from "$lib/stores/locationPickStore"

  export let map
  export let mapLoaded = false
  export let markerManagerRef = null
  export let mapFieldsRef = null
  export let vehicleTrackerRef = null
  export let trailHighlighterRef = null
  export let onLongPress = () => {}

  // Global selection state management
  let globalSelectionState = {
    selectedType: null, // 'vehicle', 'field', 'marker', 'trail', null
    selectedId: null,
    selectedComponent: null,
  }

  // Set context so other components can access global selection state
  setContext("globalSelection", {
    getState: () => globalSelectionState,
    subscribe: (callback) => {
      const unsubscribe = () => {}
      callback(globalSelectionState)
      return unsubscribe
    },
  })

  // Long press state
  let longPressTimer = null
  let longPressStartPosition = null
  let longPressStartTime = null
  let longPressJustCompleted = false
  let isDragging = false
  const longPressThreshold = 850
  const longPressMoveThreshold = 5

  // Touch handling state
  let touchStartCount = 0
  let isPinching = false
  let lastTouchTime = 0

  // Map-level touch tracking
  let mapLevelTouchStart = null
  let mapLevelHasMoved = false
  const mapLevelMoveThreshold = 10

  // Simple interaction flags
  let isProcessingInteraction = false
  let eventHandlingInitialized = false
  let markerSelectionUnsubscribe = null

  function isControlInteractionTarget(target) {
    if (!target?.closest) return false
    if (target.closest("[data-vehicle-id]")) return false

    return Boolean(
      target.closest(
        [
          "button",
          "a",
          "input",
          "textarea",
          "select",
          "[role='button']",
          "[data-map-control]",
          ".toolbox-trigger-container",
          ".menu-expanded",
          ".tracking-bar",
          ".mapboxgl-ctrl",
          ".mapboxgl-popup",
        ].join(","),
      ),
    )
  }

  // Global selection management functions
  function setGlobalSelection(type, id, componentRef) {
    console.log(`🎯 Setting global selection: ${type}:${id}`)

    // Clear previous selection first
    clearCurrentSelection()

    // Set new selection
    globalSelectionState = {
      selectedType: type,
      selectedId: id,
      selectedComponent: componentRef,
    }

    console.log("🎯 Global selection state:", globalSelectionState)
    globalSelectionState = globalSelectionState // Trigger reactivity
  }

  function clearGlobalSelection() {
    console.log("🧹 Clearing global selection")
    clearCurrentSelection()
    globalSelectionState = {
      selectedType: null,
      selectedId: null,
      selectedComponent: null,
    }
    globalSelectionState = globalSelectionState // Trigger reactivity
  }

  function clearCurrentSelection() {
    // Clear selections in all components without triggering new selections
    if (globalSelectionState.selectedType === "vehicle" && vehicleTrackerRef) {
      console.log("🔄 Clearing vehicle selection")
      vehicleTrackerRef.handleVehicleSelection(null)
    } else if (globalSelectionState.selectedType === "field" && mapFieldsRef) {
      console.log("🔄 Clearing field selection")
      mapFieldsRef.handleFieldSelection(null)
    } else if (
      globalSelectionState.selectedType === "marker" &&
      markerManagerRef
    ) {
      console.log("🔄 Clearing marker selection")
      markerManagerRef.handleMarkerSelection({ features: [] })
    } else if (
      globalSelectionState.selectedType === "trail" &&
      trailHighlighterRef
    ) {
      console.log("🔄 Clearing trail selection")
      if (trailHighlighterRef.highlighterAPI?.closeReplayPanel) {
        trailHighlighterRef.highlighterAPI.closeReplayPanel()
      }
    }
  }

  // Single unified interaction handler
  async function handleUnifiedInteraction(clientX, clientY, mapPoint) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return

    if (isProcessingInteraction) {
      console.log("🚫 Already processing interaction, ignoring...")
      return
    }

    isProcessingInteraction = true
    console.log("🎯 Processing unified interaction at:", { clientX, clientY })

    try {
      // 1. Check for vehicles first (highest priority: 150)
      const vehicleId = getVehicleAtPoint(clientX, clientY)

      if (vehicleId) {
        console.log("🚗 Found vehicle:", vehicleId)
        await handleVehicleInteraction(vehicleId)
        return
      }

      // 2. Check for map layers with proper priority order
      if (mapPoint) {
        const mapInteraction = await checkMapLayersAtPoint(mapPoint)
        if (mapInteraction) {
          console.log(`🎯 Found ${mapInteraction.type}:`, mapInteraction.id)
          await handleMapInteraction(mapInteraction)
          return
        }
      }

      // 3. Empty space - clear selections
      console.log("🌍 Empty space clicked - clearing selections")
      clearGlobalSelection()
    } catch (error) {
      console.error("Unified map interaction failed", error)
    } finally {
      // Reset processing flag after a short delay
      setTimeout(() => {
        isProcessingInteraction = false
      }, 50)
    }
  }

  // Handle vehicle interactions
  async function handleVehicleInteraction(vehicleId) {
    const isCurrentlySelected =
      globalSelectionState.selectedType === "vehicle" &&
      globalSelectionState.selectedId === vehicleId

    if (isCurrentlySelected) {
      console.log("🔄 Vehicle reselection - deselecting")
      clearGlobalSelection()
    } else {
      console.log("✅ Selecting vehicle")
      setGlobalSelection("vehicle", vehicleId, vehicleTrackerRef)
      if (vehicleTrackerRef?.handleVehicleSelection) {
        await vehicleTrackerRef.handleVehicleSelection(vehicleId)
      }
    }
  }

  // Handle map layer interactions
  async function handleMapInteraction(interaction) {
    const { type, id, features, isDrawing, drawingId, drawingGeometry } =
      interaction

    const isCurrentlySelected =
      globalSelectionState.selectedType === type &&
      globalSelectionState.selectedId === id

    if (isCurrentlySelected) {
      console.log(`🔄 ${type} reselection - deselecting`)
      clearGlobalSelection()
    } else {
      console.log(`✅ Selecting ${type}${isDrawing ? " (from drawing)" : ""}`)

      if (type === "field") {
        setGlobalSelection("field", id, mapFieldsRef)
        if (mapFieldsRef?.handleFieldSelection) {
          await mapFieldsRef.handleFieldSelection(id)
        }
      } else if (type === "marker") {
        setGlobalSelection("marker", id, markerManagerRef)
        if (markerManagerRef?.handleMarkerSelection) {
          // If it's from a drawing, we need to construct the marker feature
          if (isDrawing) {
            // Find the marker in the confirmed markers
            const markers = confirmedMarkersStore
            let marker = null

            // Safely get the current value from the store
            const unsubscribe = markers.subscribe((value) => {
              marker = value?.find((m) => m.id === id)
            })
            unsubscribe()

            if (marker) {
              const syntheticFeatures = [
                {
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: marker.coordinates,
                  },
                  properties: {
                    id: marker.id,
                    iconClass: marker.iconClass,
                  },
                },
              ]
              await markerManagerRef.handleMarkerSelection({
                features: syntheticFeatures,
              })

              // Remember this drawing so the marker menu highlights it (and
              // scrolls to it) once its drawings are loaded, then pan/zoom
              // over to it like selecting a drawing from the list.
              const bounds = drawingGeometry
                ? drawingBounds(drawingGeometry)
                : null
              pendingDrawingSelection.set({
                markerId: id,
                drawingId,
                bounds,
              })
              if (map && bounds) {
                map.fitBounds(
                  [
                    [bounds.west, bounds.south],
                    [bounds.east, bounds.north],
                  ],
                  {
                    padding: { top: 400, bottom: 100, left: 120, right: 120 },
                    duration: 800,
                  },
                )
              }
            }
          } else {
            await markerManagerRef.handleMarkerSelection({ features })
          }
        }
      }
    }
  }

  // Check for vehicles at point
  function getVehicleAtPoint(clientX, clientY) {
    const elements = document.elementsFromPoint?.(clientX, clientY) || []

    for (const element of elements) {
      const vehicleElement = element.closest("[data-vehicle-id]")
      if (vehicleElement) {
        const vehicleId = vehicleElement.getAttribute("data-vehicle-id")
        console.log(`🚗 Found vehicle at point: ${vehicleId}`)
        return vehicleId
      }
    }

    return null
  }

  // Map canvas pixel → viewport client coordinates (for DOM hit-testing).
  function clientPointFromMapPoint(mapPoint) {
    try {
      const container = map?.getContainer?.()
      const rect = container?.getBoundingClientRect?.()
      if (!rect) return null
      return { x: rect.left + mapPoint.x, y: rect.top + mapPoint.y }
    } catch {
      return null
    }
  }

  // Current position of a vehicle from the vehicle stores (own vehicle or a
  // teammate's). Handles both {latitude, longitude} objects and "(lng,lat)"
  // strings — the same shapes VehicleTracker.parseCoordinates accepts.
  function vehicleCoordsFromStore(vehicleId) {
    try {
      const own = get(userVehicleStore)
      const source =
        own?.vehicle_id && own.vehicle_id === vehicleId
          ? own
          : (get(otherVehiclesStore) || []).find(
              (v) => v.vehicle_id === vehicleId,
            )
      const coords = source?.coordinates
      if (!coords) return null
      if (typeof coords === "object" && coords.latitude && coords.longitude) {
        return { lng: Number(coords.longitude), lat: Number(coords.latitude) }
      }
      if (typeof coords === "string") {
        const [lng, lat] = coords.slice(1, -1).split(",").map(parseFloat)
        if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat }
      }
      if (Array.isArray(coords) && coords.length >= 2) {
        return { lng: Number(coords[0]), lat: Number(coords[1]) }
      }
    } catch {
      // fall through to null
    }
    return null
  }

  // ── Drawing geometry helpers ──
  function collectCoords(geometry) {
    const out = []
    const push = (c) => {
      if (Array.isArray(c) && c.length >= 2 && typeof c[0] === "number") {
        out.push(c)
      }
    }
    if (!geometry) return out
    switch (geometry.type) {
      case "Polygon":
        geometry.coordinates.forEach((ring) => ring.forEach(push))
        break
      case "MultiPolygon":
        geometry.coordinates.forEach((poly) =>
          poly.forEach((ring) => ring.forEach(push)),
        )
        break
      case "LineString":
        geometry.coordinates.forEach(push)
        break
      case "MultiLineString":
        geometry.coordinates.forEach((line) => line.forEach(push))
        break
    }
    return out
  }

  function drawingBounds(geometry) {
    const coords = collectCoords(geometry)
    if (!coords.length) return null
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    coords.forEach(([lng, lat]) => {
      if (lng < west) west = lng
      if (lng > east) east = lng
      if (lat < south) south = lat
      if (lat > north) north = lat
    })
    if (!isFinite(west)) return null
    return { west, south, east, north }
  }

  // Check for map layers at point with proper priority order
  async function checkMapLayersAtPoint(point) {
    try {
      if (!point || !map?.queryRenderedFeatures) return null

      // Check SELECTED marker layer FIRST (priority 200)
      if (map.getLayer("markers-selected-layer")) {
        const selectedMarkerFeatures =
          map.queryRenderedFeatures(point, {
            layers: ["markers-selected-layer"],
          }) || []

        if (selectedMarkerFeatures.length > 0) {
          const markerId = selectedMarkerFeatures[0]?.properties?.id
          if (markerId !== undefined) {
            console.log("🎯 Found SELECTED marker with priority 200:", markerId)
            return {
              type: "marker",
              id: markerId,
              features: selectedMarkerFeatures,
              priority: 200,
            }
          }
        }
      }

      // Check regular markers SECOND (priority 150) - MOVED UP
      if (map.getLayer("markers-layer")) {
        const markerFeatures =
          map.queryRenderedFeatures(point, {
            layers: ["markers-layer"],
          }) || []

        if (markerFeatures.length > 0) {
          const markerId = markerFeatures[0]?.properties?.id
          if (markerId !== undefined) {
            console.log("🎯 Found regular marker with priority 150:", markerId)
            return {
              type: "marker",
              id: markerId,
              features: markerFeatures,
              priority: 150,
            }
          }
        }
      }

      // Check marker drawings THIRD (priority 100) - MOVED DOWN
      const drawingLayers = [
        "marker-drawings-fill",
        "marker-drawings-line-solid",
        "marker-drawings-line-dashed",
      ].filter((layerId) => map.getLayer(layerId))

      if (drawingLayers.length > 0) {
        const drawingFeatures =
          map.queryRenderedFeatures(point, {
            layers: drawingLayers,
          }) || []

        if (drawingFeatures.length > 0) {
          const markerId = drawingFeatures[0]?.properties?.marker_id
          if (markerId) {
            console.log("🎨 Found drawing for marker:", markerId)
            // Return as a marker interaction to select the parent marker AND
            // carry the drawing so it can be highlighted + zoomed to.
            return {
              type: "marker",
              id: markerId,
              features: [],
              priority: 100,
              isDrawing: true,
              drawingId: drawingFeatures[0]?.properties?.id,
              drawingGeometry: drawingFeatures[0]?.geometry,
            }
          }
        }
      }

      // Check fields FOURTH (priority 10)
      const fieldLayers = ["fields-fill", "fields-fill-selected"].filter(
        (layerId) => map.getLayer(layerId),
      )

      if (fieldLayers.length > 0) {
        const fieldFeatures =
          map.queryRenderedFeatures(point, {
            layers: fieldLayers,
          }) || []

        if (fieldFeatures.length > 0) {
          const fieldId = fieldFeatures[0]?.properties?.id
          if (fieldId !== undefined) {
            console.log("🎯 Found field with priority 10:", fieldId)
            return {
              type: "field",
              id: fieldId,
              features: fieldFeatures,
              priority: 10,
            }
          }
        }
      }
    } catch (error) {
      console.warn("⚠️ Error querying map layers:", error)
    }

    return null
  }
  // Initialize when map and refs are ready
  $: if (
    mapLoaded &&
    map &&
    (markerManagerRef || mapFieldsRef || vehicleTrackerRef)
  ) {
    initializeEventHandling()
  }

  // Keep the unified selection in sync when a marker is deselected from
  // outside the unified system (e.g. closing the silo panel after placing
  // a moved silo). Without this, MapEventManager still thinks that marker
  // is selected, and the next tap on it toggles it off instead of
  // selecting it. (Svelte context can't reach MarkerManager — they're
  // siblings — so we watch the actual marker selection store instead.)
  function syncExternalMarkerDeselection() {
    const selected = get(selectedMarkerStore)
    if (!selected && globalSelectionState.selectedType === "marker") {
      console.log("🧹 Syncing cleared marker selection (external deselection)")
      globalSelectionState = {
        selectedType: null,
        selectedId: null,
        selectedComponent: null,
      }
      globalSelectionState = globalSelectionState // Trigger reactivity
    }
  }

  function initializeEventHandling() {
    console.log("🎯 MapEventManager: Initializing unified event handling")
    setupMapEventListeners()
    if (!markerSelectionUnsubscribe) {
      markerSelectionUnsubscribe = selectedMarkerStore.subscribe(
        syncExternalMarkerDeselection,
      )
    }
  }

  function setupMapEventListeners() {
    if (!map) return
    if (eventHandlingInitialized) return

    console.log("🎮 Setting up unified map event listeners")
    eventHandlingInitialized = true

    // Long press handlers
    map.on("mousedown", handleMouseDown)
    map.on("touchstart", handleMouseDown)
    map.on("drag", handleMapDrag)
    map.on("mouseup", handleMouseUp)
    map.on("touchend", handleMouseUp)
    map.on("touchcancel", handleMouseUp)

    // Single unified click handler
    map.on("click", handleMapClick)

    // Touch tracking for movement detection
    map.on("touchstart", handleMapTouchStart)
    map.on("touchmove", handleMapTouchMove)
    map.on("touchend", handleMapTouchEnd)

    // Document-level listeners for pinch detection
    document.addEventListener("touchstart", handleDocumentTouchStart, {
      passive: true,
    })
    document.addEventListener("touchend", handleDocumentTouchEnd, {
      passive: true,
    })

    console.log("✅ Unified map event listeners setup complete")
  }

  // ── Location picking (message attachments) ──
  // While the picker is collecting (`active`), the next map tap captures a
  // location: a vehicle, a marker, a field, or any spot. During review
  // (`captured`), taps re-target the pick live until the user confirms.
  function maybeHandleLocationPick(mapPoint, lngLat) {
    if ($locationPickStore.active) {
      captureLocationPick(mapPoint, lngLat)
      markLocationPickHandled() // swallow the paired touchend/click event
      return true
    }
    if ($locationPickStore.captured) {
      // A tap that isn't the twin of the last one re-targets the pick.
      if (!locationPickHandledRecently()) {
        captureLocationPick(mapPoint, lngLat)
        markLocationPickHandled()
      }
      return true
    }
    // The same physical tap fires both touchend and click — ignore the twin.
    if (locationPickHandledRecently()) return true
    return false
  }

  function captureLocationPick(mapPoint, lngLat) {
    const point = lngLat || map.unproject(mapPoint)
    let result = null
    let markerHitId = null
    let fieldHitId = null
    let vehicleHitId = null

    try {
      // 0) Vehicle under the tap? (they render as DOM markers — hit-test the
      // same way a normal tap does, via client coordinates.)
      const clientPoint = clientPointFromMapPoint(mapPoint)
      const vehicleId = clientPoint
        ? getVehicleAtPoint(clientPoint.x, clientPoint.y)
        : null
      if (vehicleId) {
        const vehicle = (get(otherVehiclesStore) || []).find(
          (v) => v.vehicle_id === vehicleId,
        )
        // Use the vehicle's actual centre (from the vehicle stores) rather
        // than the tap point, so the shared location sits on the vehicle.
        const vCoords = vehicleCoordsFromStore(vehicleId)
        result = {
          lng: vCoords ? vCoords.lng : point.lng,
          lat: vCoords ? vCoords.lat : point.lat,
          label: vehicle?.full_name || "Vehicle",
          refType: "vehicle",
          refId: vehicleId,
        }
        vehicleHitId = vehicleId
        // Strip preview: the vehicle's real icon (cloned from its map marker).
        const vehicleIconSvg = document.querySelector(
          `[data-vehicle-id="${vehicleId}"] svg`,
        )?.outerHTML
        if (vehicleIconSvg) result.iconHtml = vehicleIconSvg
      }

      // 1) Marker under the tap?
      if (!result && map.getLayer("markers-layer")) {
        const markerFeatures =
          map.queryRenderedFeatures(mapPoint, { layers: ["markers-layer"] }) ||
          []
        const markerId = markerFeatures[0]?.properties?.id
        if (markerId !== undefined && markerId !== null) {
          const marker = get(confirmedMarkersStore).find(
            (m) => m.id === markerId,
          )
          const coords = markerFeatures[0]?.geometry?.coordinates
          // Prefer the marker's own stored coordinates (its true centre).
          const storeCoords = Array.isArray(marker?.coordinates)
            ? marker.coordinates
            : null
          result = {
            lng: storeCoords
              ? storeCoords[0]
              : coords
                ? coords[0]
                : point.lng,
            lat: storeCoords
              ? storeCoords[1]
              : coords
                ? coords[1]
                : point.lat,
            label: marker?.noteLabel || "Marker",
            refType: "marker",
            refId: markerId,
          }
          markerHitId = markerId
          // Strip preview: the marker's actual map icon.
          const markerIconUrl = markerManagerRef?.getMarkerIconUrl?.(markerId)
          if (markerIconUrl) result.iconUrl = markerIconUrl
        }
      }

      // 2) Field under the tap?
      if (!result) {
        const fieldLayers = ["fields-fill", "fields-fill-selected"].filter(
          (layerId) => map.getLayer(layerId),
        )
        if (fieldLayers.length > 0) {
          const fieldFeatures =
            map.queryRenderedFeatures(mapPoint, { layers: fieldLayers }) || []
          const props = fieldFeatures[0]?.properties
          if (props && props.id !== undefined && props.id !== null) {
            result = {
              lng: point.lng,
              lat: point.lat,
              label: props.name || props.field_name || props.label || "Field",
              refType: "field",
              refId: String(props.id),
            }
            // Layer filters compare against the raw (numeric) feature id.
            fieldHitId = props.id
            // Strip preview: mini field shape (same source the toolbox's
            // field list uses for its little polygon icons).
            const fieldShape = get(mapFieldsStore)?.[props.id]?.boundary
            if (fieldShape) result.geo = fieldShape
          }
        }
      }
    } catch (error) {
      console.warn("Location pick hit-test failed:", error)
    }

    // Keep only the tapped target highlighted — mirror the app's selection
    // visuals (marker ring / field highlight / vehicle highlight) without
    // opening any menus. Runs on every pick so re-taps move the highlight.
    applyPickHighlight(markerHitId, fieldHitId, vehicleHitId)

    // 3) Fallback: empty space — just the dropped point.
    if (!result) {
      result = {
        lng: point.lng,
        lat: point.lat,
        label: null,
        refType: null,
        refId: null,
      }
    }

    // Tag the spot with a plain text chip (no pin — the selection highlight
    // and the picker strip are the indicators), camera stays put.
    focusMapLocation({
      lng: result.lng,
      lat: result.lat,
      label: result.label || "Dropped pin",
      refType: result.refType,
      refId: result.refId,
      // A real target already has its selection highlight — only empty-space
      // picks get their own pin so the dropped point is visible.
      noPin: !!result.refType,
      fly: false,
    })
    completeLocationPick(result)
  }

  // ── Location picker: selection highlights ──
  // When a pick lands on a marker / field / vehicle we reuse the app's normal
  // selection visuals (without opening any overlay menus) so the user can see
  // exactly what was picked. They're cleared when the pick / review ends.
  let highlightedPickMarkerId = null

  function clearPickedMarkerHighlight() {
    if (!highlightedPickMarkerId) return
    try {
      markerManagerRef?.highlightMarker?.(highlightedPickMarkerId, false)
    } catch (error) {
      console.warn("Could not clear pick highlight:", error)
    }
    highlightedPickMarkerId = null
  }

  function highlightPickedMarker(markerId) {
    if (highlightedPickMarkerId === markerId) return
    clearPickedMarkerHighlight()
    try {
      markerManagerRef?.highlightMarker?.(markerId, true)
      highlightedPickMarkerId = markerId
    } catch (error) {
      console.warn("Could not highlight picked marker:", error)
    }
  }

  // Mirror the app's selection styling for whichever target was tapped.
  function applyPickHighlight(markerId, fieldId, vehicleId) {
    // Insurance: the picker never wants a selection menu on screen.
    controlStore.update((controls) =>
      controls.showMarkerMenu || controls.showVehicleMenu
        ? { ...controls, showMarkerMenu: false, showVehicleMenu: false }
        : controls,
    )

    if (markerId) highlightPickedMarker(markerId)
    else clearPickedMarkerHighlight()

    try {
      mapFieldsRef?.highlightField?.(fieldId ?? null)
    } catch (error) {
      console.warn("Could not highlight picked field:", error)
    }

    try {
      vehicleTrackerRef?.highlightVehicle?.(vehicleId ?? null)
    } catch (error) {
      console.warn("Could not highlight picked vehicle:", error)
    }
  }

  function clearPickedHighlights() {
    clearPickedMarkerHighlight()
    try {
      mapFieldsRef?.highlightField?.(null)
    } catch (error) {
      console.warn("Could not clear field highlight:", error)
    }
    try {
      vehicleTrackerRef?.highlightVehicle?.(null)
    } catch (error) {
      console.warn("Could not clear vehicle highlight:", error)
    }
  }

  onMount(() => {
    // Drop the highlights once the user leaves the pick / review flow.
    const unsubscribePickState = locationPickStore.subscribe((state) => {
      if (!state.active && !state.captured) clearPickedHighlights()
    })
    return unsubscribePickState
  })

  // Single click handler for everything
  function handleMapClick(event) {
    if ($mapInteractionsSuppressed) {
      // Suppressed (e.g. silo move mode) — don't select/place anything.
      return
    }

    if (isControlInteractionTarget(event.originalEvent?.target)) return

    // Road editor is active — let it handle road clicks (avoid "empty space")
    if ($kmzOverlaysStore.editingOverlayId) return

    if (longPressJustCompleted || isDragging) {
      console.log("🚫 Click ignored - long press or drag detected")
      longPressJustCompleted = false
      return
    }

    if (maybeHandleLocationPick(event.point, event.lngLat)) return

    console.log("🖱️ Unified click handler")

    handleUnifiedInteraction(
      event.originalEvent.clientX,
      event.originalEvent.clientY,
      event.point,
    )
  }

  // Touch handlers
  function handleMapTouchStart(event) {
    if ($mapInteractionsSuppressed) {
      resetMapLevelTouchTracking()
      return
    }

    if (isControlInteractionTarget(event.originalEvent?.target)) {
      resetMapLevelTouchTracking()
      return
    }

    if (
      event.originalEvent.touches &&
      event.originalEvent.touches.length === 1
    ) {
      mapLevelTouchStart = {
        x: event.originalEvent.touches[0].clientX,
        y: event.originalEvent.touches[0].clientY,
      }
      mapLevelHasMoved = false
    }
  }

  function handleMapTouchMove(event) {
    if (!mapLevelTouchStart || !event.originalEvent.touches) return

    const currentX = event.originalEvent.touches[0].clientX
    const currentY = event.originalEvent.touches[0].clientY

    const dx = currentX - mapLevelTouchStart.x
    const dy = currentY - mapLevelTouchStart.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > mapLevelMoveThreshold) {
      mapLevelHasMoved = true
    }
  }

  function handleMapTouchEnd(event) {
    if ($mapInteractionsSuppressed) {
      resetMapLevelTouchTracking()
      return
    }

    if (isControlInteractionTarget(event.originalEvent?.target)) {
      resetMapLevelTouchTracking()
      return
    }

    // Road editor is active — let it handle taps (avoid "empty space")
    if ($kmzOverlaysStore.editingOverlayId) {
      resetMapLevelTouchTracking()
      return
    }

    if (longPressJustCompleted || isDragging || mapLevelHasMoved) {
      console.log(
        "🚫 Touch end ignored - long press, drag, or movement detected",
      )
      longPressJustCompleted = false
      resetMapLevelTouchTracking()
      return
    }

    if (!mapLevelTouchStart) {
      resetMapLevelTouchTracking()
      return
    }

    if (maybeHandleLocationPick(event.point, null)) {
      resetMapLevelTouchTracking()
      return
    }

    console.log("📱 Unified touch handler")

    handleUnifiedInteraction(
      mapLevelTouchStart.x,
      mapLevelTouchStart.y,
      event.point,
    )

    resetMapLevelTouchTracking()
  }

  function resetMapLevelTouchTracking() {
    mapLevelTouchStart = null
    mapLevelHasMoved = false
  }

  // Touch detection functions
  function handleDocumentTouchStart(e) {
    touchStartCount = e.touches.length
    if (touchStartCount > 1) {
      isPinching = true
    }
  }

  function handleDocumentTouchEnd(e) {
    setTimeout(() => {
      isPinching = false
      touchStartCount = 0
    }, 300)
  }

  // Long press handlers
  function handleMouseDown(event) {
    // ── Guard: suppress long-press during any drawing mode ──
    if ($drawingModeEnabled) return
    // ── Guard: while choosing / confirming a message location, taps pick ──
    if (
      $locationPickStore.active ||
      $locationPickStore.captured ||
      locationPickHandledRecently()
    ) {
      return
    }
    // ── Guard: suppress while silo move mode is active ──
    if ($mapInteractionsSuppressed) return
    if ($collectionRouteStore.phase === "drawing") return
    if ($kmzOverlaysStore.editingOverlayId) return

    const target = event.originalEvent.target
    if (isControlInteractionTarget(target)) return

    if (target.closest(".mapboxgl-marker")) {
      return
    }

    // Only handle left mouse button (button 0) for long press
    // Right click (button 2) should be ignored for rotation/context menu
    if (
      event.originalEvent.type === "mousedown" &&
      event.originalEvent.button !== 0
    ) {
      return
    }

    if (event.originalEvent.type.startsWith("touch")) {
      const now = Date.now()

      if (isPinching) return

      if (
        event.originalEvent.touches &&
        event.originalEvent.touches.length > 1
      ) {
        isPinching = true
        return
      }

      if (now - lastTouchTime < 300) {
        isPinching = true
        return
      }

      lastTouchTime = now
    }

    isDragging = false
    longPressJustCompleted = false
    clearTimeout(longPressTimer)

    longPressStartTime = Date.now()
    longPressStartPosition = {
      x:
        event.originalEvent.clientX ||
        (event.originalEvent.touches && event.originalEvent.touches[0].clientX),
      y:
        event.originalEvent.clientY ||
        (event.originalEvent.touches && event.originalEvent.touches[0].clientY),
      isTouchEvent: event.originalEvent.type.startsWith("touch"),
    }

    longPressTimer = setTimeout(() => {
      if (!isDragging) {
        console.log("⏰ Long press timer fired")
        longPressJustCompleted = true
        onLongPress(event.lngLat)
        // Don't auto-reset longPressJustCompleted on a timer.
        // It will be consumed by handleMouseUp / handleMapTouchEnd / handleMapClick
        // when the user lifts their finger, no matter how long they hold.
      }
      longPressTimer = null
    }, longPressThreshold)

    if (longPressStartPosition.isTouchEvent) {
      const touchendHandler = function (e) {
        clearTimeout(longPressTimer)
        longPressTimer = null
        longPressStartPosition = null
        document.removeEventListener("touchend", touchendHandler)
      }
      document.addEventListener("touchend", touchendHandler)
    }
  }

  function handleMapDrag(event) {
    if (longPressStartPosition) {
      const touchEvent = event.originalEvent.touches
        ? event.originalEvent.touches[0]
        : event.originalEvent

      const dx = touchEvent.clientX - longPressStartPosition.x
      const dy = touchEvent.clientY - longPressStartPosition.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance > longPressMoveThreshold) {
        isDragging = true
        clearTimeout(longPressTimer)
        longPressTimer = null
        longPressStartPosition = null
        console.log("🚫 Long press cancelled due to drag, distance:", distance)
      }
    }
  }

  function handleMouseUp(event) {
    if (longPressJustCompleted) {
      console.log("🚫 Preventing mouseup/touchend after long press")
      // Reset the flag now that the gesture is complete
      longPressJustCompleted = false
    }

    setTimeout(() => {
      isDragging = false
    }, 150)

    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressStartPosition = null
    longPressStartTime = null
  }

  function cleanupEventListeners() {
    if (!map) return
    if (!eventHandlingInitialized) return

    console.log("🧹 Cleaning up unified event listeners")
    eventHandlingInitialized = false

    // Clean up all event listeners
    map.off("mousedown", handleMouseDown)
    map.off("touchstart", handleMouseDown)
    map.off("drag", handleMapDrag)
    map.off("mouseup", handleMouseUp)
    map.off("touchend", handleMouseUp)
    map.off("touchcancel", handleMouseUp)
    map.off("click", handleMapClick)
    map.off("touchstart", handleMapTouchStart)
    map.off("touchmove", handleMapTouchMove)
    map.off("touchend", handleMapTouchEnd)

    // Remove document-level listeners
    document.removeEventListener("touchstart", handleDocumentTouchStart)
    document.removeEventListener("touchend", handleDocumentTouchEnd)

    if (markerSelectionUnsubscribe) {
      markerSelectionUnsubscribe()
      markerSelectionUnsubscribe = null
    }

    // Clear any pending timers
    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressStartPosition = null
    longPressStartTime = null
    longPressJustCompleted = false

    // DON'T clear global selection here - let components clean up themselves
    // The map is being destroyed, so trying to update filters/sources will fail
    // Just reset the state object
    globalSelectionState = {
      selectedType: null,
      selectedId: null,
      selectedComponent: null,
    }
  }

  onDestroy(() => {
    cleanupEventListeners()
  })

  // Export function to get current selection state
  export function getCurrentSelection() {
    return globalSelectionState
  }

  // Allow external callers (e.g. trail replay) to register as the active selection
  export function setSelection(type, id, componentRef) {
    setGlobalSelection(type, id, componentRef)
  }
</script>

<!-- MapEventManager is purely functional - no visual elements -->
