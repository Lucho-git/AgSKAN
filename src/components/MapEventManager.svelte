<script>
  import { onMount, onDestroy } from "svelte"

  export let map
  export let mapLoaded = false
  export let markerManagerRef = null
  export let mapFieldsRef = null
  export let onLongPress = () => {}

  // Layer interaction registry with priority support
  let layerRegistry = new Map()

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

  // Layer-specific touch tracking
  let layerTouchTracking = new Map()

  // 🆕 NEW: Map-level touch tracking for drag prevention
  let mapLevelTouchStart = null
  let mapLevelHasMoved = false
  const mapLevelMoveThreshold = 10

  // Initialize when map and refs are ready
  $: if (mapLoaded && map && (markerManagerRef || mapFieldsRef)) {
    initializeEventHandling()
  }

  function initializeEventHandling() {
    console.log("🎯 MapEventManager: Initializing event handling")

    // Setup map-level event listeners
    setupMapEventListeners()

    // Register child component layers
    setTimeout(() => {
      registerChildLayers()
    }, 1000)
  }

  // Layer interaction registry functions with priority
  function registerLayerInteractions(layerConfigs) {
    layerConfigs.forEach((config) => {
      layerRegistry.set(config.layerId, {
        componentRef: config.componentRef,
        handlers: config.handlers,
        options: {
          preventOnDrag: true,
          touchMoveThreshold: 10,
          priority: 0, // Default priority
          ...config.options,
        },
      })

      // Initialize touch tracking for this layer
      if (config.options?.preventOnDrag) {
        layerTouchTracking.set(config.layerId, {
          touchStartPosition: null,
          hasTouchMoved: false,
        })
      }

      console.log(
        `📍 Registered layer: ${config.layerId} with priority: ${layerRegistry.get(config.layerId).options.priority}`,
      )
    })
  }

  function setupLayerEvents(layerId) {
    const config = layerRegistry.get(layerId)
    if (!config) return

    // Wait for layer to exist
    const checkLayer = () => {
      try {
        if (map.getLayer && map.getLayer(layerId)) {
          console.log(`🔗 Setting up events for layer: ${layerId}`)

          // Mouse click handler - use coordinated click handler
          if (config.handlers.onClick) {
            map.on("click", layerId, (e) => handleCoordinatedLayerClick(e))
          }

          // Touch handlers with movement tracking if needed
          if (config.handlers.onTouchEnd && config.options.preventOnDrag) {
            map.on("touchstart", layerId, (e) =>
              handleLayerTouchStart(layerId, e),
            )
            map.on("touchmove", layerId, (e) =>
              handleLayerTouchMove(layerId, e),
            )
            map.on("touchend", layerId, (e) =>
              handleCoordinatedLayerTouchEnd(e),
            )
          } else if (config.handlers.onTouchEnd) {
            map.on("touchend", layerId, (e) =>
              handleCoordinatedLayerTouchEnd(e),
            )
          }

          // Hover effects
          map.on("mouseenter", layerId, () => {
            map.getCanvas().style.cursor = "pointer"
          })
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = ""
          })

          return true
        }
      } catch (error) {
        console.warn(`⚠️ Error setting up layer ${layerId}:`, error)
      }
      return false
    }

    // Try immediately, then retry with timeout
    if (!checkLayer()) {
      setTimeout(checkLayer, 100)
    }
  }

  // Coordinated click handler - determines which layer gets the interaction
  function handleCoordinatedLayerClick(event) {
    // Check if this click follows a recent long press
    if (longPressJustCompleted) {
      console.log("🚫 Click ignored - follows recent long press")
      return
    }

    const layersAtPoint = getLayersAtPoint(event.point)
    const selectedLayer = selectHighestPriorityLayer(layersAtPoint)

    if (selectedLayer) {
      console.log(
        `🎯 Coordinated click - selected layer: ${selectedLayer.layerId} (priority: ${selectedLayer.priority})`,
      )
      console.log("Selected layer features:", selectedLayer.features)
      handleLayerInteraction(
        selectedLayer.layerId,
        "onClick",
        event,
        selectedLayer,
      )
    } else {
      // 🆕 NEW: Handle empty space clicks
      console.log("🌍 Click on empty space - handling deselection")
      handleEmptySpaceClick(event)
    }
  }

  // Coordinated touch end handler
  function handleCoordinatedLayerTouchEnd(event) {
    // Check if this touch end follows a recent long press
    if (longPressJustCompleted) {
      console.log("🚫 Touch end ignored - follows recent long press")
      resetAllLayerTouchTracking()
      return
    }

    // Check if any layer had touch movement that should cancel the interaction
    let shouldCancelDueToMovement = false

    for (const [layerId, tracking] of layerTouchTracking.entries()) {
      if (tracking.hasTouchMoved) {
        shouldCancelDueToMovement = true
        break
      }
    }

    if (shouldCancelDueToMovement) {
      console.log("📱 Touch interaction cancelled due to movement")
      resetAllLayerTouchTracking()
      return
    }

    const layersAtPoint = getLayersAtPoint(event.point)
    const selectedLayer = selectHighestPriorityLayer(layersAtPoint)

    if (selectedLayer) {
      console.log(
        `📱 Coordinated touch end - selected layer: ${selectedLayer.layerId} (priority: ${selectedLayer.priority})`,
      )
      handleLayerInteraction(
        selectedLayer.layerId,
        "onTouchEnd",
        event,
        selectedLayer,
      )
    } else {
      // 🆕 NEW: Handle empty space touches
      console.log("🌍 Touch on empty space - handling deselection")
      handleEmptySpaceClick(event)
    }

    resetAllLayerTouchTracking()
  }

  // 🆕 NEW: Handle empty space clicks - deselect active elements
  function handleEmptySpaceClick(event) {
    console.log("🌍 Empty space interaction - deselecting active elements")

    // Deselect any currently selected field (always call, let the component handle it)
    if (mapFieldsRef) {
      console.log("🔄 Calling field deselection due to empty space click")
      mapFieldsRef.handleFieldSelection(null)
    }

    // 🆕 EXTENSIBLE: Add other deselections here as needed
  }

  // Get all interactive layers at a given point
  function getLayersAtPoint(point) {
    const layersAtPoint = []

    // Query all registered layers at this point
    layerRegistry.forEach((config, layerId) => {
      try {
        if (map.getLayer(layerId)) {
          const features = map.queryRenderedFeatures(point, {
            layers: [layerId],
          })
          if (features.length > 0) {
            layersAtPoint.push({
              layerId,
              priority: config.options.priority,
              features,
              config,
            })
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error querying layer ${layerId}:`, error)
      }
    })

    return layersAtPoint
  }

  // Select the layer with highest priority (highest number wins)
  function selectHighestPriorityLayer(layersAtPoint) {
    if (layersAtPoint.length === 0) return null
    if (layersAtPoint.length === 1) return layersAtPoint[0]

    // Sort by priority (highest first), then by registration order if priorities are equal
    return layersAtPoint.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority
      }
      // If priorities are equal, maintain registration order (first registered wins)
      return 0
    })[0]
  }

  // Reset touch tracking for all layers
  function resetAllLayerTouchTracking() {
    setTimeout(() => {
      layerTouchTracking.forEach((tracking) => {
        tracking.touchStartPosition = null
        tracking.hasTouchMoved = false
      })
    }, 100)
  }

  // 🆕 NEW: Reset map-level touch tracking
  function resetMapLevelTouchTracking() {
    mapLevelTouchStart = null
    mapLevelHasMoved = false
  }

  // Layer touch tracking
  function handleLayerTouchStart(layerId, e) {
    const tracking = layerTouchTracking.get(layerId)
    if (tracking) {
      tracking.touchStartPosition = {
        x: e.originalEvent.touches[0].clientX,
        y: e.originalEvent.touches[0].clientY,
      }
      tracking.hasTouchMoved = false
    }
  }

  function handleLayerTouchMove(layerId, e) {
    const tracking = layerTouchTracking.get(layerId)
    const config = layerRegistry.get(layerId)

    if (!tracking || !tracking.touchStartPosition) return

    const currentX = e.originalEvent.touches[0].clientX
    const currentY = e.originalEvent.touches[0].clientY

    const dx = currentX - tracking.touchStartPosition.x
    const dy = currentY - tracking.touchStartPosition.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > config.options.touchMoveThreshold) {
      tracking.hasTouchMoved = true
    }
  }

  // 🆕 NEW: Track map-level touch start
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

  // 🆕 NEW: Track map-level touch movement
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

  // Generic layer interaction handler
  function handleLayerInteraction(
    layerId,
    interactionType,
    originalEvent,
    selectedLayer,
  ) {
    const config = layerRegistry.get(layerId)

    if (!config || !config.handlers[interactionType]) return

    // Check for drag prevention
    if (config.options.preventOnDrag && isDragging) {
      console.log(`🚫 ${layerId} ${interactionType} ignored due to drag`)
      return
    }

    // Cancel any ongoing long press
    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressStartPosition = null

    console.log(`✅ ${layerId} ${interactionType}:`, originalEvent)
    console.log(`✅ Selected layer data:`, selectedLayer)

    // Create a properly formatted event object with the correct features
    const formattedEvent = {
      ...originalEvent,
      features: selectedLayer.features, // Use the features from our priority selection
      point: originalEvent.point,
      lngLat: originalEvent.lngLat,
    }

    console.log(`✅ Formatted event for ${layerId}:`, formattedEvent)

    // Call the handler with the properly formatted event
    config.handlers[interactionType](formattedEvent)
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

        // Reset the flag after a short delay to allow the marker to be placed
        // but prevent the subsequent click/touch events
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
    // If this mouseup/touchend follows a completed long press, prevent further processing
    if (longPressStartTime && longPressJustCompleted) {
      const timeSinceStart = Date.now() - longPressStartTime
      if (timeSinceStart >= longPressThreshold - 50) {
        console.log("🚫 Preventing mouseup/touchend after long press")
      }
    }

    // Reset isDragging after a delay to prevent immediate layer interactions
    setTimeout(() => {
      isDragging = false
    }, 150)

    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressStartPosition = null
    longPressStartTime = null
  }

  function setupMapEventListeners() {
    if (!map) return

    console.log("🎮 Setting up map event listeners")

    // Long press handlers for map-level interactions
    map.on("mousedown", handleMouseDown)
    map.on("touchstart", handleMouseDown)
    map.on("drag", handleMapDrag)
    map.on("mouseup", handleMouseUp)
    map.on("touchend", handleMouseUp)
    map.on("touchcancel", handleMouseUp)

    // 🆕 UPDATED: Add map-level click handlers for empty space detection with touch tracking
    map.on("click", handleMapClick)
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

    console.log("✅ Map event listeners setup complete")
  }

  // 🆕 UPDATED: Map-level click handler (fires for all clicks)
  function handleMapClick(event) {
    // Only handle if no layer-specific handlers have fired
    if (longPressJustCompleted || isDragging) return

    setTimeout(() => {
      // Small delay to let layer-specific handlers fire first
      const layersAtPoint = getLayersAtPoint(event.point)
      if (layersAtPoint.length === 0) {
        console.log("🌍 Map-level click on empty space (backup handler)")
        handleEmptySpaceClick(event)
      }
    }, 10)
  }

  // 🆕 UPDATED: Map-level touch handler with drag prevention
  function handleMapTouchEnd(event) {
    // Check for conditions that should prevent the interaction
    if (longPressJustCompleted || isDragging || mapLevelHasMoved) {
      console.log("🚫 Map-level touch end ignored - drag/long press detected")
      resetMapLevelTouchTracking()
      return
    }

    setTimeout(() => {
      // Small delay to let layer-specific handlers fire first
      const layersAtPoint = getLayersAtPoint(event.point)
      if (layersAtPoint.length === 0) {
        console.log("🌍 Map-level touch on empty space (backup handler)")
        handleEmptySpaceClick(event)
      }
      resetMapLevelTouchTracking()
    }, 10)
  }

  function cleanupEventListeners() {
    if (!map) return

    console.log("🧹 Cleaning up event listeners")

    // Clean up map-level event listeners
    map.off("mousedown", handleMouseDown)
    map.off("touchstart", handleMouseDown)
    map.off("drag", handleMapDrag)
    map.off("mouseup", handleMouseUp)
    map.off("touchend", handleMouseUp)
    map.off("touchcancel", handleMouseUp)

    // 🆕 UPDATED: Clean up empty space handlers including new touch tracking
    map.off("click", handleMapClick)
    map.off("touchstart", handleMapTouchStart)
    map.off("touchmove", handleMapTouchMove)
    map.off("touchend", handleMapTouchEnd)

    // Remove document-level listeners
    document.removeEventListener("touchstart", handleDocumentTouchStart)
    document.removeEventListener("touchend", handleDocumentTouchEnd)

    // Clean up layer-specific events
    layerRegistry.forEach((config, layerId) => {
      try {
        map.off("click", layerId)
        map.off("touchstart", layerId)
        map.off("touchmove", layerId)
        map.off("touchend", layerId)
        map.off("mouseenter", layerId)
        map.off("mouseleave", layerId)
      } catch (error) {
        // Layer might not exist, that's ok
      }
    })

    // Clear registries
    layerRegistry.clear()
    layerTouchTracking.clear()

    // 🆕 NEW: Reset map-level tracking
    resetMapLevelTouchTracking()

    // Clear any pending timers
    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressStartPosition = null
    longPressStartTime = null
    longPressJustCompleted = false
  }

  // Register child component layers
  function registerChildLayers() {
    console.log("📋 Registering child layers")

    // Register marker layers if MarkerManager is ready (HIGH PRIORITY)
    if (markerManagerRef) {
      registerLayerInteractions([
        {
          layerId: "markers-layer",
          componentRef: markerManagerRef,
          handlers: {
            onClick: (e) => {
              console.log("🎯 Marker onClick handler called with:", e)
              if (e.features.length > 0) {
                markerManagerRef.handleMarkerSelection(e)
              }
            },
            onTouchEnd: (e) => {
              console.log("📱 Marker onTouchEnd handler called with:", e)
              if (e.features.length > 0) {
                markerManagerRef.handleMarkerSelection(e)
              }
            },
          },
          options: {
            preventOnDrag: true,
            touchMoveThreshold: 10,
            priority: 100, // HIGH PRIORITY - markers win over fields
          },
        },
      ])
    }

    // Register field layers if MapFields is ready (LOWER PRIORITY)
    if (mapFieldsRef) {
      registerLayerInteractions([
        {
          layerId: "fields-fill",
          componentRef: mapFieldsRef,
          handlers: {
            onClick: (e) => {
              console.log("🎯 Field onClick handler called with:", e)
              if (e.features.length > 0) {
                mapFieldsRef.handleFieldSelection(e.features[0].properties.id)
              }
            },
            onTouchEnd: (e) => {
              console.log("📱 Field onTouchEnd handler called with:", e)
              if (e.features.length > 0) {
                mapFieldsRef.handleFieldSelection(e.features[0].properties.id)
              }
            },
          },
          options: {
            preventOnDrag: true,
            touchMoveThreshold: 10,
            priority: 10, // LOWER PRIORITY - fields are background layers
          },
        },
        {
          layerId: "fields-fill-selected",
          componentRef: mapFieldsRef,
          handlers: {
            onClick: (e) => {
              if (e.features.length > 0) {
                mapFieldsRef.handleFieldSelection(e.features[0].properties.id)
              }
            },
            onTouchEnd: (e) => {
              if (e.features.length > 0) {
                mapFieldsRef.handleFieldSelection(e.features[0].properties.id)
              }
            },
          },
          options: {
            preventOnDrag: true,
            touchMoveThreshold: 10,
            priority: 10, // LOWER PRIORITY - fields are background layers
          },
        },
      ])
    }

    // Setup events for each registered layer
    layerRegistry.forEach((config, layerId) => {
      setupLayerEvents(layerId)
    })
  }

  onDestroy(() => {
    cleanupEventListeners()
  })
</script>

<!-- MapEventManager is purely functional - no visual elements -->
