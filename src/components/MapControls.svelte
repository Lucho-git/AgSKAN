<!-- MapControls.svelte -->
<script>
  import { createEventDispatcher, onMount, onDestroy } from "svelte"
  import { confirmedMarkersStore } from "../stores/mapStore"
  import { controlStore, drawingModeEnabled } from "$lib/stores/controlStore"

  export let map

  const dispatch = createEventDispatcher()

  let isDragging = false
  let longPressTimer = null
  let longPressOccurred = false
  let longPressStartPosition = null
  const longPressThreshold = 500
  const longPressMoveThreshold = 5
  let confirmedMarkers = []
  let confirmedMarkersUnsubscribe
  let controlsEnabled = true
  let initialized = false

  // Add these variables for pinch detection
  let touchStartCount = 0
  let isPinching = false
  let lastTouchTime = 0

  // Add these variables for marker drag detection
  let markerTouchStartTime = 0
  let markerTouchStartPosition = null
  let potentialMarkerClick = null
  let markerClickTimer = null
  const markerClickThreshold = 300 // ms
  const markerMoveThreshold = 10 // pixels

  function handleMarkerMouseEnter(event) {
    if (!controlsEnabled) return
    const markerElement = event.target
    markerElement.style.cursor = "pointer"
  }

  function handleMarkerMouseLeave(event) {
    if (!controlsEnabled) return
    const markerElement = event.target
    markerElement.style.cursor = ""
  }

  function handleMarkerClick(event) {
    if (!controlsEnabled) return

    // For mouse events, just handle the click normally
    if (event.type === "click") {
      event.stopPropagation()
      const markerElement = event.target.closest(".mapboxgl-marker")

      if (markerElement) {
        const foundMarker = confirmedMarkers.find(
          (m) => m.marker.getElement() === markerElement,
        )

        if (foundMarker) {
          const { marker, id } = foundMarker
          dispatch("markerClick", { marker, id })
        } else {
          console.log("No matching marker found in confirmedMarkers array")
        }
      } else {
        console.log("No marker element found")
      }
    }
  }

  function handleMarkerTouchStart(event) {
    if (!controlsEnabled) return

    // Get the current timestamp
    const now = Date.now()

    // Check if we're currently in a pinch gesture
    if (isPinching) {
      return // Don't process marker clicks during pinch, but don't prevent default
    }

    // Check if this is part of a multi-touch event (pinch)
    if (event.touches && event.touches.length > 1) {
      isPinching = true
      return // Allow default behavior for pinch
    }

    // Check if this is happening immediately after another touch
    if (now - lastTouchTime < 300) {
      isPinching = true
      return
    }

    // Update the last touch time
    lastTouchTime = now
    markerTouchStartTime = now

    // Store touch position to check for drag later
    markerTouchStartPosition = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    }

    // Find the marker
    const markerElement = event.target.closest(".mapboxgl-marker")
    if (markerElement) {
      const foundMarker = confirmedMarkers.find(
        (m) => m.marker.getElement() === markerElement,
      )

      if (foundMarker) {
        // Store potential click but don't dispatch yet
        potentialMarkerClick = {
          marker: foundMarker.marker,
          id: foundMarker.id,
        }

        // Clear any existing timer
        clearTimeout(markerClickTimer)

        // Don't prevent default or stop propagation here
        // This allows the map to receive the touch event for potential dragging

        // Setup a document-level touch move and touch end listeners
        document.addEventListener("touchmove", handleMarkerTouchMove, {
          passive: true,
        })
        document.addEventListener("touchend", handleMarkerTouchEnd, {
          passive: true,
        })
      }
    }
  }

  function handleMarkerTouchMove(event) {
    if (!markerTouchStartPosition || !potentialMarkerClick) return

    const touch = event.touches[0]
    const dx = touch.clientX - markerTouchStartPosition.x
    const dy = touch.clientY - markerTouchStartPosition.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // If moved more than threshold, consider it a drag, not a click
    if (distance > markerMoveThreshold) {
      potentialMarkerClick = null
      markerTouchStartPosition = null

      // Clean up listeners
      document.removeEventListener("touchmove", handleMarkerTouchMove)
      document.removeEventListener("touchend", handleMarkerTouchEnd)
    }

    // Don't prevent default - allow the map to drag
  }

  function handleMarkerTouchEnd(event) {
    // Clean up listeners
    document.removeEventListener("touchmove", handleMarkerTouchMove)
    document.removeEventListener("touchend", handleMarkerTouchEnd)

    const now = Date.now()
    const touchDuration = now - markerTouchStartTime

    // Only process as a click if:
    // 1. We have a potential marker click
    // 2. The touch was short (less than threshold)
    if (potentialMarkerClick && touchDuration < markerClickThreshold) {
      // For quick taps, stop the event to prevent map click
      if (event.cancelable) {
        event.preventDefault()
        event.stopPropagation()
      }
      dispatch("markerClick", potentialMarkerClick)
    }

    // Reset state
    potentialMarkerClick = null
    markerTouchStartPosition = null
  }

  function handleMarkerPlacement(event) {
    if (!controlsEnabled) return

    const lngLat = event.lngLat || event.target.getLngLat()

    if (lngLat) {
      dispatch("markerPlacement", { lngLat })
    } else {
      console.error("Invalid event format. Missing lngLat property.")
    }
  }

  function handleMouseDown(event) {
    if (!controlsEnabled) return

    // Check if the click/touch is on a marker
    const target = event.originalEvent.target
    if (target.closest(".mapboxgl-marker")) {
      return // Don't start long press if touching a marker
    }

    isDragging = false
    longPressOccurred = false
    clearTimeout(longPressTimer)

    // Store whether this is a touch event for reference
    const isTouchEvent = event.originalEvent.type.startsWith("touch")

    longPressStartPosition = {
      x:
        event.originalEvent.clientX ||
        (event.originalEvent.touches && event.originalEvent.touches[0].clientX),
      y:
        event.originalEvent.clientY ||
        (event.originalEvent.touches && event.originalEvent.touches[0].clientY),
      isTouchEvent: isTouchEvent,
    }

    longPressTimer = setTimeout(() => {
      handleMarkerPlacement(event)
      longPressOccurred = true
      longPressTimer = null
    }, longPressThreshold)

    // For touch events, we need to listen for touchend to cancel the timer
    if (isTouchEvent) {
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
    if (!controlsEnabled) return

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
      }
    }
  }

  function handleMouseUp(event) {
    if (!controlsEnabled) return

    isDragging = false
    clearTimeout(longPressTimer)
    longPressTimer = null
    longPressStartPosition = null
  }

  function updateMarkerListeners(marker, id) {
    const markerElement = marker.getElement()

    // Remove all existing listeners
    markerElement.removeEventListener("mouseenter", handleMarkerMouseEnter)
    markerElement.removeEventListener("mouseleave", handleMarkerMouseLeave)
    markerElement.removeEventListener("click", handleMarkerClick)
    markerElement.removeEventListener("touchstart", handleMarkerTouchStart)
    markerElement.removeAttribute("data-listeners-added")

    // Add listeners
    markerElement.addEventListener("mouseenter", handleMarkerMouseEnter)
    markerElement.addEventListener("mouseleave", handleMarkerMouseLeave)
    markerElement.addEventListener("click", handleMarkerClick)
    markerElement.addEventListener("touchstart", handleMarkerTouchStart, {
      passive: true,
    })
    markerElement.setAttribute("data-listeners-added", "true")

    const existingMarkerIndex = confirmedMarkers.findIndex((m) => m.id === id)
    if (existingMarkerIndex !== -1) {
      confirmedMarkers = confirmedMarkers.map((m, index) =>
        index === existingMarkerIndex ? { marker, id } : m,
      )
    } else {
      confirmedMarkers = [...confirmedMarkers, { marker, id }]
    }
  }

  function handleUpdateMarkerListeners(event) {
    const { marker, id } = event.detail
    updateMarkerListeners(marker, id)
  }

  // Handle document-level touch events for pinch detection
  function handleDocumentTouchStart(e) {
    touchStartCount = e.touches.length
    if (touchStartCount > 1) {
      isPinching = true
    }
  }

  function handleDocumentTouchEnd(e) {
    // Reset pinch state after a delay to avoid immediate clicks
    setTimeout(() => {
      isPinching = false
      touchStartCount = 0
    }, 300)
  }

  function initializeEventListeners() {
    if (!map || initialized) return

    map.on("mousedown", handleMouseDown)
    map.on("touchstart", handleMouseDown)
    map.on("drag", handleMapDrag)
    map.on("mouseup", handleMouseUp)
    map.on("touchend", handleMouseUp)
    map.on("touchcancel", handleMouseUp)

    // Add document-level listeners for pinch detection
    document.addEventListener("touchstart", handleDocumentTouchStart, {
      passive: true,
    })
    document.addEventListener("touchend", handleDocumentTouchEnd, {
      passive: true,
    })

    document.addEventListener(
      "handleUpdateMarkerListeners",
      handleUpdateMarkerListeners,
    )

    initialized = true
  }

  function removeEventListeners() {
    if (!map || !initialized) return

    map.off("mousedown", handleMouseDown)
    map.off("touchstart", handleMouseDown)
    map.off("drag", handleMapDrag)
    map.off("mouseup", handleMouseUp)
    map.off("touchend", handleMouseUp)
    map.off("touchcancel", handleMouseUp)

    // Remove document-level listeners
    document.removeEventListener("touchstart", handleDocumentTouchStart)
    document.removeEventListener("touchend", handleDocumentTouchEnd)
    document.removeEventListener("touchmove", handleMarkerTouchMove)
    document.removeEventListener("touchend", handleMarkerTouchEnd)

    document.removeEventListener(
      "handleUpdateMarkerListeners",
      handleUpdateMarkerListeners,
    )

    initialized = false
  }

  // Watch for drawingModeEnabled changes
  $: {
    if ($drawingModeEnabled !== undefined) {
      controlsEnabled = !$drawingModeEnabled
      if (controlsEnabled && !initialized) {
        initializeEventListeners()
      } else if (!controlsEnabled && initialized) {
        removeEventListeners()
      }
    }
  }

  onMount(() => {
    if (controlsEnabled && !initialized) {
      initializeEventListeners()
    }
  })

  onDestroy(() => {
    if (confirmedMarkersUnsubscribe) {
      confirmedMarkersUnsubscribe()
    }
    removeEventListeners()
  })
</script>
