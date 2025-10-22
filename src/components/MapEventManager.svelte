<script>
  import { onMount, onDestroy, setContext } from "svelte"
  import { confirmedMarkersStore } from "../stores/mapStore"

  export let map
  export let mapLoaded = false
  export let markerManagerRef = null
  export let mapFieldsRef = null
  export let vehicleTrackerRef = null
  export let onLongPress = () => {}

  // Global selection state management
  let globalSelectionState = {
    selectedType: null, // 'vehicle', 'field', 'marker', null
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
    }
  }

  // Single unified interaction handler
  async function handleUnifiedInteraction(clientX, clientY, mapPoint) {
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
    const { type, id, features, isDrawing } = interaction

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
    const elements = document.elementsFromPoint(clientX, clientY)

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

  // Check for map layers at point with proper priority order
  async function checkMapLayersAtPoint(point) {
    try {
      // Check SELECTED marker layer FIRST (priority 200)
      if (map.getLayer("markers-selected-layer")) {
        const selectedMarkerFeatures = map.queryRenderedFeatures(point, {
          layers: ["markers-selected-layer"],
        })

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
        const markerFeatures = map.queryRenderedFeatures(point, {
          layers: ["markers-layer"],
        })

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
        const drawingFeatures = map.queryRenderedFeatures(point, {
          layers: drawingLayers,
        })

        if (drawingFeatures.length > 0) {
          const markerId = drawingFeatures[0]?.properties?.marker_id
          if (markerId) {
            console.log("🎨 Found drawing for marker:", markerId)
            // Return as a marker interaction to select the parent marker
            return {
              type: "marker",
              id: markerId,
              features: [],
              priority: 100,
              isDrawing: true,
            }
          }
        }
      }

      // Check fields FOURTH (priority 10)
      const fieldLayers = ["fields-fill", "fields-fill-selected"].filter(
        (layerId) => map.getLayer(layerId),
      )

      if (fieldLayers.length > 0) {
        const fieldFeatures = map.queryRenderedFeatures(point, {
          layers: fieldLayers,
        })

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

  function initializeEventHandling() {
    console.log("🎯 MapEventManager: Initializing unified event handling")
    setupMapEventListeners()
  }

  function setupMapEventListeners() {
    if (!map) return

    console.log("🎮 Setting up unified map event listeners")

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

  // Single click handler for everything
  function handleMapClick(event) {
    if (longPressJustCompleted || isDragging) {
      console.log("🚫 Click ignored - long press or drag detected")
      return
    }

    console.log("🖱️ Unified click handler")

    handleUnifiedInteraction(
      event.originalEvent.clientX,
      event.originalEvent.clientY,
      event.point,
    )
  }

  // Touch handlers
  function handleMapTouchStart(event) {
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
    if (longPressJustCompleted || isDragging || mapLevelHasMoved) {
      console.log(
        "🚫 Touch end ignored - long press, drag, or movement detected",
      )
      resetMapLevelTouchTracking()
      return
    }

    if (!mapLevelTouchStart) {
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
    const target = event.originalEvent.target
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

        setTimeout(() => {
          longPressJustCompleted = false
          console.log("🧊 Long press flag reset")
        }, 300)
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
    if (longPressStartTime && longPressJustCompleted) {
      const timeSinceStart = Date.now() - longPressStartTime
      if (timeSinceStart >= longPressThreshold - 50) {
        console.log("🚫 Preventing mouseup/touchend after long press")
      }
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

    console.log("🧹 Cleaning up unified event listeners")

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
</script>

<!-- MapEventManager is purely functional - no visual elements -->
