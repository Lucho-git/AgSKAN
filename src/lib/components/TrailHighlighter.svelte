<!-- src/lib/components/TrailHighlighter.svelte -->

<script lang="ts">
  import type { Map } from "mapbox-gl"
  import type { Trail } from "$lib/types/trail"
  import { historicalTrailStore } from "$lib/stores/otherTrailStore"
  import * as mapboxgl from "mapbox-gl"
  import { onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import {
    X,
    Trash2,
    Play,
    Square,
    Pause,
    ChevronUp,
    ChevronDown,
    SkipBack,
    SkipForward,
    Loader2,
  } from "lucide-svelte"

  interface TrailIdentifiers {
    sourceId: string
    layerId: string
    highlightLayerId: string
    highlightBackgroundLayerId: string
  }

  interface AnimationState {
    trailId: string
    coordinates: [number, number][]
    currentIndex: number
    progress: number
    isPlaying: boolean
    isPaused: boolean
    isComplete: boolean
    isLoading: boolean
    isReady: boolean
  }

  export let calculateZoomDependentWidth: (
    width: number,
    multiplier: number,
  ) => number
  export let generateTrailIds: (trailId: string) => TrailIdentifiers
  export let deleteTrail: (trailId: string) => Promise<boolean>

  export let map: Map
  let currentTrailIndex = 0
  let showNavigationUI = false
  let showDeleteModal = false
  let showDropdownMenu = false
  let showReplayPanel = false
  let isExpanded = false
  let trailToDelete: Trail | null = null
  let animationIntervalId: number | null = null
  let tractorMarker: mapboxgl.Marker | null = null
  let isSliderActive = false
  let wasPlayingBeforeDrag = false // Track if we were playing before slider drag
  let progressContainer: HTMLElement

  // Centralized animation state
  let animationState: AnimationState = {
    trailId: "",
    coordinates: [],
    currentIndex: 0,
    progress: 0,
    isPlaying: false,
    isPaused: false,
    isComplete: false,
    isLoading: false,
    isReady: false,
  }

  const HIGHLIGHT_CONFIG = {
    TRAIL_HIGHLIGHT_DELAY: 3000,
    FLIGHT_DURATION: 800, // Reduced from 2000ms for faster camera movement
    HIGHLIGHT_WIDTH_MULTIPLIER: 1.2,
    MAX_FLIGHT_ZOOM: 19,
    ANIMATION_SPEED: 25,
  }

  // Make currentTrail reactive to currentTrailIndex changes
  $: currentTrail = $historicalTrailStore[currentTrailIndex] || null

  // Watch for trail changes and reset animation state
  $: if (currentTrail) {
    initializeTrailAnimation(currentTrail)
  }

  function getCurrentTrail(): Trail | null {
    return currentTrail
  }

  function initializeTrailAnimation(trail: Trail) {
    // Stop any existing animation
    stopAnimation()

    // Reset animation state for new trail
    animationState = {
      trailId: trail.id,
      coordinates: [],
      currentIndex: 0,
      progress: 0,
      isPlaying: false,
      isPaused: false,
      isComplete: false,
      isLoading: true,
      isReady: false,
    }

    // Process trail coordinates
    setTimeout(() => {
      try {
        let coordinates: [number, number][] = []

        if (trail.path && typeof trail.path === "object") {
          if ("type" in trail.path && trail.path.type === "LineString") {
            coordinates = trail.path.coordinates
          } else if (Array.isArray(trail.path)) {
            const sortedCoords = [...trail.path].sort(
              (a, b) => a.timestamp - b.timestamp,
            )
            coordinates = sortedCoords.map((coord) => [
              coord.coordinates.longitude,
              coord.coordinates.latitude,
            ])
          }
        }

        if (coordinates.length === 0) {
          console.error("No valid coordinates found for trail:", trail.id)
          animationState.isLoading = false
          return
        }

        // Update animation state with processed coordinates
        animationState = {
          ...animationState,
          coordinates,
          isLoading: false,
          isReady: true,
        }

        console.log(
          `Trail ${trail.id} initialized with ${coordinates.length} coordinates`,
        )
      } catch (error) {
        console.error("Error initializing trail animation:", error)
        animationState.isLoading = false
      }
    }, 50) // Small delay to ensure UI update
  }

  function createTractorIcon() {
    const tractorDiv = document.createElement("div")
    tractorDiv.innerHTML = `
      <div style="
        width: 24px; 
        height: 24px; 
        background: #22c55e;
        border: 2px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        font-size: 12px;
      ">🚜</div>
    `
    return tractorDiv
  }

  function createAnimationSource(trail: Trail): string {
    const animationSourceId = `animation-source-${trail.id}`
    const animationBorderSourceId = `animation-border-source-${trail.id}`

    // Remove existing animation sources if they exist
    if (map.getSource(animationSourceId)) {
      if (map.getLayer(`animation-layer-${trail.id}`)) {
        map.removeLayer(`animation-layer-${trail.id}`)
      }
      map.removeSource(animationSourceId)
    }

    if (map.getSource(animationBorderSourceId)) {
      if (map.getLayer(`animation-border-layer-${trail.id}`)) {
        map.removeLayer(`animation-border-layer-${trail.id}`)
      }
      map.removeSource(animationBorderSourceId)
    }

    // Create empty GeoJSON sources
    map.addSource(animationSourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [],
        },
      },
    })

    map.addSource(animationBorderSourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [],
        },
      },
    })

    // Add white border layer first (underneath)
    map.addLayer({
      id: `animation-border-layer-${trail.id}`,
      type: "line",
      source: animationBorderSourceId,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "white",
        "line-width": calculateZoomDependentWidth(
          (trail.trail_width || 3) * 1.6,
          1,
        ),
        "line-opacity": 0.8,
      },
    })

    // Add colored animation layer on top
    map.addLayer({
      id: `animation-layer-${trail.id}`,
      type: "line",
      source: animationSourceId,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#ff4444", // Bright red for the animation
        "line-width": calculateZoomDependentWidth(
          (trail.trail_width || 3) * 1.3,
          1,
        ),
        "line-opacity": 0.7,
      },
    })

    return animationSourceId
  }

  function getMenuHeight(): number {
    if (!showReplayPanel) return 0

    let height = 76 // Control bar height with padding

    if (isExpanded) {
      height += window.innerHeight * 0.5 // 50vh max height
    }

    return Math.min(height, window.innerHeight * 0.6) // Cap at 60vh
  }

  function fitTrailBounds(
    coordinates: [number, number][],
    considerMenu = false,
    fastTransition = false,
  ) {
    if (coordinates.length === 0) return

    const bounds = coordinates.reduce(
      (bounds, coord) => {
        return bounds.extend(coord)
      },
      new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
    )

    let bottomPadding = 100
    if (considerMenu && showReplayPanel) {
      bottomPadding = getMenuHeight() + 50
    }

    // Use faster duration for trail switching
    const duration = fastTransition
      ? HIGHLIGHT_CONFIG.FLIGHT_DURATION / 2
      : HIGHLIGHT_CONFIG.FLIGHT_DURATION

    map.fitBounds(bounds, {
      padding: {
        top: 100,
        bottom: bottomPadding,
        left: 100,
        right: 100,
      },
      duration: duration,
      maxZoom: HIGHLIGHT_CONFIG.MAX_FLIGHT_ZOOM,
    })
  }

  function updateAnimationProgress() {
    if (!animationState.isReady || animationState.coordinates.length === 0)
      return

    const totalSteps = animationState.coordinates.length - 1
    if (totalSteps > 0) {
      const progress = animationState.currentIndex / totalSteps
      animationState.progress = Math.min(1, Math.max(0, progress))
    }
  }

  function handleProgressClick(event: MouseEvent) {
    if (
      !progressContainer ||
      !animationState.isReady ||
      animationState.isLoading
    )
      return

    const rect = progressContainer.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const progress = Math.max(0, Math.min(1, clickX / rect.width))

    seekToProgress(progress)

    // Start playing from new position
    if (!animationState.isPlaying && !isSliderActive) {
      startAnimation()
    }
  }

  function handleSliderStart() {
    if (!animationState.isReady) return

    isSliderActive = true
    wasPlayingBeforeDrag = animationState.isPlaying

    // Pause animation if it's currently playing
    if (animationState.isPlaying) {
      pauseAnimation()
    }
  }

  function handleSliderEnd() {
    if (!animationState.isReady) return

    isSliderActive = false

    // Resume playing if we were playing before the drag started
    if (wasPlayingBeforeDrag) {
      startAnimation()
    }

    wasPlayingBeforeDrag = false
  }

  function startAnimation() {
    if (!animationState.isReady || animationState.coordinates.length === 0) {
      console.warn("Cannot start animation: trail not ready")
      return
    }

    // Auto-expand when starting animation
    if (!isExpanded) {
      isExpanded = true
    }

    // Clear any existing animation
    if (animationIntervalId) {
      clearInterval(animationIntervalId)
      animationIntervalId = null
    }

    // Update state
    animationState.isPlaying = true
    animationState.isPaused = false
    animationState.isComplete = false

    const trail = getCurrentTrail()
    if (!trail) return

    // Ensure animation sources exist
    const animationSourceId = createAnimationSource(trail)
    const animationBorderSourceId = `animation-border-source-${trail.id}`

    // Hide original trail
    const { layerId } = generateTrailIds(trail.id)
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none")
    }

    // Safely remove existing tractor marker
    if (tractorMarker) {
      try {
        tractorMarker.remove()
      } catch (error) {
        console.warn("Error removing tractor marker:", error)
      }
      tractorMarker = null
    }

    // Create new tractor marker with validation
    const startIndex = Math.min(
      animationState.currentIndex,
      animationState.coordinates.length - 1,
    )
    if (startIndex >= 0 && startIndex < animationState.coordinates.length) {
      tractorMarker = new mapboxgl.Marker({
        element: createTractorIcon(),
        anchor: "center",
      })
        .setLngLat(animationState.coordinates[startIndex])
        .addTo(map)
    }

    // Update initial display
    updateAnimationDisplay()

    // Start animation loop
    animationIntervalId = setInterval(() => {
      if (
        animationState.currentIndex >=
        animationState.coordinates.length - 1
      ) {
        // Animation completed
        completeAnimation()
        return
      }

      if (!animationState.isPlaying) {
        // Animation was paused
        return
      }

      animationState.currentIndex++
      updateAnimationDisplay()
      updateAnimationProgress()
    }, HIGHLIGHT_CONFIG.ANIMATION_SPEED)
  }

  function pauseAnimation() {
    if (!animationState.isReady) return

    animationState.isPlaying = false
    animationState.isPaused = true

    if (animationIntervalId) {
      clearInterval(animationIntervalId)
      animationIntervalId = null
    }
  }

  function resumeAnimation() {
    if (!animationState.isReady || !animationState.isPaused) return

    animationState.isPlaying = true
    animationState.isPaused = false

    startAnimation()
  }

  function completeAnimation() {
    if (animationIntervalId) {
      clearInterval(animationIntervalId)
      animationIntervalId = null
    }

    animationState.isPlaying = false
    animationState.isPaused = false
    animationState.isComplete = true
    animationState.progress = 1
    animationState.currentIndex = animationState.coordinates.length - 1

    // Safely remove tractor marker when animation completes
    if (tractorMarker) {
      try {
        tractorMarker.remove()
      } catch (error) {
        console.warn("Error removing tractor marker on completion:", error)
      }
      tractorMarker = null
    }

    console.log(`Animation completed for trail ${animationState.trailId}`)
  }

  function updateAnimationDisplay() {
    if (!animationState.isReady || animationState.coordinates.length === 0)
      return

    const trail = getCurrentTrail()
    if (!trail || trail.id !== animationState.trailId) return

    const animationSourceId = `animation-source-${trail.id}`
    const animationBorderSourceId = `animation-border-source-${trail.id}`

    // Update animation display
    const currentCoordinates = animationState.coordinates.slice(
      0,
      animationState.currentIndex + 1,
    )
    const source = map.getSource(animationSourceId) as mapboxgl.GeoJSONSource
    const borderSource = map.getSource(
      animationBorderSourceId,
    ) as mapboxgl.GeoJSONSource

    const geoJsonData = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: currentCoordinates,
      },
    }

    if (source) {
      source.setData(geoJsonData)
    }
    if (borderSource) {
      borderSource.setData(geoJsonData)
    }

    // Safely move tractor marker with validation
    if (
      tractorMarker &&
      animationState.currentIndex >= 0 &&
      animationState.currentIndex < animationState.coordinates.length
    ) {
      try {
        tractorMarker.setLngLat(
          animationState.coordinates[animationState.currentIndex],
        )
      } catch (error) {
        console.warn("Error updating tractor marker position:", error)
        // Remove broken marker
        tractorMarker.remove()
        tractorMarker = null
      }
    }
  }

  function seekToProgress(targetProgress: number) {
    if (!animationState.isReady || animationState.coordinates.length === 0)
      return

    const targetIndex = Math.floor(
      targetProgress * (animationState.coordinates.length - 1),
    )
    animationState.currentIndex = targetIndex
    animationState.progress = targetProgress

    // Update completion state
    if (targetProgress >= 1) {
      animationState.isComplete = true
      animationState.isPlaying = false
      animationState.isPaused = false
    } else {
      animationState.isComplete = false
    }

    const trail = getCurrentTrail()
    if (!trail || trail.id !== animationState.trailId) return

    // Ensure animation sources exist
    const animationSourceId = `animation-source-${trail.id}`
    if (!map.getSource(animationSourceId)) {
      createAnimationSource(trail)
    }

    // Safely create or move tractor marker with validation
    if (
      !tractorMarker &&
      targetIndex >= 0 &&
      targetIndex < animationState.coordinates.length
    ) {
      try {
        tractorMarker = new mapboxgl.Marker({
          element: createTractorIcon(),
          anchor: "center",
        })
          .setLngLat(animationState.coordinates[targetIndex])
          .addTo(map)
      } catch (error) {
        console.warn("Error creating tractor marker:", error)
      }
    } else if (
      tractorMarker &&
      targetIndex >= 0 &&
      targetIndex < animationState.coordinates.length
    ) {
      try {
        tractorMarker.setLngLat(animationState.coordinates[targetIndex])
      } catch (error) {
        console.warn("Error moving tractor marker:", error)
        // Remove broken marker
        tractorMarker.remove()
        tractorMarker = null
      }
    }

    // Update display
    updateAnimationDisplay()
  }

  function togglePlayPause() {
    if (!animationState.isReady || animationState.isLoading) {
      console.warn("Trail not ready for playback")
      return
    }

    if (animationState.isPlaying) {
      pauseAnimation()
    } else if (animationState.isPaused) {
      resumeAnimation()
    } else if (animationState.isComplete) {
      // Restart from beginning
      animationState.currentIndex = 0
      animationState.progress = 0
      animationState.isComplete = false
      startAnimation()
    } else {
      // Start from current position
      startAnimation()
    }
  }

  function animateTrailCreation(trail: Trail) {
    console.log(`Starting animation for trail ${trail.id}`)

    if (!animationState.isReady || animationState.trailId !== trail.id) {
      console.warn("Trail not ready for animation")
      return
    }

    // Auto-expand when starting animation
    if (!isExpanded) {
      isExpanded = true
      // Wait for expansion animation to complete before fitting bounds
      setTimeout(() => {
        fitTrailBounds(animationState.coordinates, true, true) // Use fast transition
      }, 300)
    } else {
      fitTrailBounds(animationState.coordinates, true, true) // Use fast transition
    }

    // Reset animation state for new playback
    animationState.currentIndex = 0
    animationState.progress = 0
    animationState.isComplete = false
    animationState.isPaused = false

    // Start animation after camera movement - reduced delay due to faster camera
    setTimeout(() => {
      startAnimation()
    }, HIGHLIGHT_CONFIG.FLIGHT_DURATION + 100) // Reduced from 200
  }

  function stopAnimation() {
    if (animationIntervalId) {
      clearInterval(animationIntervalId)
      animationIntervalId = null
    }

    // Safely remove tractor marker
    if (tractorMarker) {
      try {
        tractorMarker.remove()
      } catch (error) {
        console.warn("Error removing tractor marker:", error)
      }
      tractorMarker = null
    }

    const currentTrail = getCurrentTrail()
    if (currentTrail && map && map.getStyle()) {
      // Remove animation layers
      const animationSourceId = `animation-source-${currentTrail.id}`
      const animationLayerId = `animation-layer-${currentTrail.id}`
      const animationBorderSourceId = `animation-border-source-${currentTrail.id}`
      const animationBorderLayerId = `animation-border-layer-${currentTrail.id}`

      // Remove all animation layers and sources
      try {
        if (map.getLayer(animationLayerId)) {
          map.removeLayer(animationLayerId)
        }
        if (map.getSource(animationSourceId)) {
          map.removeSource(animationSourceId)
        }
        if (map.getLayer(animationBorderLayerId)) {
          map.removeLayer(animationBorderLayerId)
        }
        if (map.getSource(animationBorderSourceId)) {
          map.removeSource(animationBorderSourceId)
        }

        // Show the original trail again
        const { layerId } = generateTrailIds(currentTrail.id)
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", "visible")
        }
      } catch (error) {
        console.warn("Error cleaning up animation layers:", error)
      }
    }

    // Reset animation state
    if (animationState.trailId === currentTrail?.id) {
      animationState.isPlaying = false
      animationState.isPaused = false
      animationState.isComplete = false
      animationState.currentIndex = 0
      animationState.progress = 0
    }
  }

  function createStartEndMarkers(trail: Trail) {
    const markersSourceId = `markers-source-${trail.id}`
    const markersLayerId = `markers-layer-${trail.id}`
    const markersTextLayerId = `markers-text-layer-${trail.id}`

    // Remove existing markers if they exist
    if (map.getSource(markersSourceId)) {
      if (map.getLayer(markersLayerId)) {
        map.removeLayer(markersLayerId)
      }
      if (map.getLayer(markersTextLayerId)) {
        map.removeLayer(markersTextLayerId)
      }
      map.removeSource(markersSourceId)
    }

    // Use coordinates from animation state if available and matching
    let coordinates: [number, number][] = []
    if (animationState.isReady && animationState.trailId === trail.id) {
      coordinates = animationState.coordinates
    } else {
      // Fallback to processing from trail data
      if (trail.path && typeof trail.path === "object") {
        if ("type" in trail.path && trail.path.type === "LineString") {
          coordinates = trail.path.coordinates
        } else if (Array.isArray(trail.path)) {
          const sortedCoords = [...trail.path].sort(
            (a, b) => a.timestamp - b.timestamp,
          )
          coordinates = sortedCoords.map((coord) => [
            coord.coordinates.longitude,
            coord.coordinates.latitude,
          ])
        }
      }
    }

    if (coordinates.length < 2) return

    const startPoint = coordinates[0]
    const endPoint = coordinates[coordinates.length - 1]

    // Create markers source
    map.addSource(markersSourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { type: "start", symbol: "🚜" },
            geometry: {
              type: "Point",
              coordinates: startPoint,
            },
          },
          {
            type: "Feature",
            properties: { type: "end", symbol: "🏁" },
            geometry: {
              type: "Point",
              coordinates: endPoint,
            },
          },
        ],
      },
    })

    // Add background circles first
    map.addLayer({
      id: markersLayerId,
      type: "circle",
      source: markersSourceId,
      paint: {
        "circle-radius": 15,
        "circle-color": [
          "case",
          ["==", ["get", "type"], "start"],
          "#22c55e", // Green for start
          "#ef4444", // Red for end
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "white",
        "circle-opacity": 0.9,
      },
    })

    // Add emoji text on top
    map.addLayer({
      id: markersTextLayerId,
      type: "symbol",
      source: markersSourceId,
      layout: {
        "text-field": ["get", "symbol"],
        "text-size": 16,
        "text-anchor": "center",
        "text-offset": [0, 0],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-opacity": 1,
      },
    })
  }

  function removeStartEndMarkers(trailId: string) {
    const markersSourceId = `markers-source-${trailId}`
    const markersLayerId = `markers-layer-${trailId}`
    const markersTextLayerId = `markers-text-layer-${trailId}`

    if (map.getLayer(markersTextLayerId)) {
      map.removeLayer(markersTextLayerId)
    }
    if (map.getLayer(markersLayerId)) {
      map.removeLayer(markersLayerId)
    }
    if (map.getSource(markersSourceId)) {
      map.removeSource(markersSourceId)
    }
  }

  function selectTrail(trail: Trail) {
    const { sourceId, highlightLayerId } = generateTrailIds(trail.id)
    const baseWidth = trail.trail_width || 3

    // Thin white border for selection
    map.addLayer({
      type: "line",
      source: sourceId,
      id: highlightLayerId,
      paint: {
        "line-color": "white",
        "line-width": calculateZoomDependentWidth(baseWidth, 1.4),
        "line-opacity": 0.6,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    })

    // Add the original trail on top with slight emphasis
    const innerLayerId = `${highlightLayerId}-inner`
    map.addLayer({
      type: "line",
      source: sourceId,
      id: innerLayerId,
      paint: {
        "line-color": trail.trail_color,
        "line-width": calculateZoomDependentWidth(baseWidth, 1.1),
        "line-opacity": 0.9,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    })

    // Add start/end markers
    createStartEndMarkers(trail)
  }

  function handleDeleteTrail() {
    trailToDelete = $historicalTrailStore[currentTrailIndex]
    showDeleteModal = true
  }

  function closeReplayPanel() {
    showReplayPanel = false
    showNavigationUI = false
    stopAnimation()
    isExpanded = false

    // Clean up highlights and animations when closing
    $historicalTrailStore.forEach((t) => {
      removeHighlight(t.id)
      removeStartEndMarkers(t.id)
    })
  }

  async function handleDeleteConfirm() {
    if (trailToDelete) {
      const success = await deleteTrail(trailToDelete.id)
      if (success) {
        showDeleteModal = false
        trailToDelete = null

        // If this was the last trail, close the navigation UI
        if ($historicalTrailStore.length === 0) {
          showNavigationUI = false
          showReplayPanel = false
        } else {
          // Update currentTrailIndex only if there are remaining trails
          if (currentTrailIndex >= $historicalTrailStore.length) {
            currentTrailIndex = Math.max(0, $historicalTrailStore.length - 1)
          }
          navigateToTrail(currentTrailIndex)
        }
      }
    }
  }

  function toggleNavigationUI() {
    if (!$historicalTrailStore.length) {
      toast.error("No trails available. Create some trails first!")
      return
    }

    showNavigationUI = !showNavigationUI
    if (!showNavigationUI) {
      // Clean up highlights and animations when hiding UI
      $historicalTrailStore.forEach((t) => {
        removeHighlight(t.id)
        removeStartEndMarkers(t.id)
      })
      stopAnimation()
      showDropdownMenu = false
      showReplayPanel = false
      isExpanded = false
    } else {
      // Start selection for current trail when showing UI
      if ($historicalTrailStore.length > 0) {
        const currentTrail = $historicalTrailStore[currentTrailIndex]
        flyToTrail(currentTrail)
        selectTrail(currentTrail)
        showReplayPanel = true
        isExpanded = false // Start in minimal state
      }
    }
  }

  function flyToTrail(trail: Trail) {
    // Use coordinates from animation state if available
    let coordinates: [number, number][] = []
    if (animationState.isReady && animationState.trailId === trail.id) {
      coordinates = animationState.coordinates
    } else if (trail.path && trail.path.coordinates) {
      coordinates = trail.path.coordinates
    }

    if (coordinates.length > 0) {
      fitTrailBounds(coordinates, true, true) // Use fast transition for trail switching
    }
  }

  function removeHighlight(trailId: string) {
    const { highlightLayerId } = generateTrailIds(trailId)
    const innerLayerId = `${highlightLayerId}-inner`

    try {
      if (map && map.getLayer(highlightLayerId)) {
        map.removeLayer(highlightLayerId)
      }
      if (map && map.getLayer(innerLayerId)) {
        map.removeLayer(innerLayerId)
      }
    } catch (error) {
      console.log("Error removing highlight layers:", error)
    }
  }

  async function navigateToTrail(index: number) {
    if ($historicalTrailStore.length === 0) return

    // Stop any ongoing animation when navigating
    stopAnimation()

    // Clean up previous trail highlights and markers
    $historicalTrailStore.forEach((t) => {
      removeHighlight(t.id)
      removeStartEndMarkers(t.id)
    })

    currentTrailIndex = index
    if (currentTrailIndex >= $historicalTrailStore.length) {
      currentTrailIndex = 0
    } else if (currentTrailIndex < 0) {
      currentTrailIndex = $historicalTrailStore.length - 1
    }

    const trail = $historicalTrailStore[currentTrailIndex]
    console.log("Navigating to trail_id:", trail.id)

    flyToTrail(trail)
    selectTrail(trail)

    // Reduced wait time due to faster camera movement
    await new Promise((resolve) =>
      setTimeout(resolve, HIGHLIGHT_CONFIG.FLIGHT_DURATION + 100),
    )
  }

  function handlePrevious() {
    navigateToTrail(currentTrailIndex - 1)
  }

  function handleNext() {
    navigateToTrail(currentTrailIndex + 1)
  }

  // Format date for display
  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  }

  // Format distance from meters to kilometers
  function formatDistance(distanceInMeters: number): string {
    if (!distanceInMeters) return "0.0 km"
    const kilometers = distanceInMeters / 1000
    return `${kilometers.toFixed(1)} km`
  }

  // Format hectares
  function formatHectares(hectares: number): string {
    if (!hectares) return "0.0"
    return hectares.toFixed(1)
  }

  // Format percentage
  function formatPercentage(percentage: number): string {
    if (!percentage) return "0.0%"
    return `${percentage.toFixed(1)}%`
  }

  // Calculate estimated time based on start and end time
  function getEstimatedTime(): string {
    const currentTrail = getCurrentTrail()
    if (!currentTrail?.start_time || !currentTrail?.end_time) return "N/A"

    const startTime = new Date(currentTrail.start_time)
    const endTime = new Date(currentTrail.end_time)
    const durationMs = endTime.getTime() - startTime.getTime()

    const hours = Math.floor(durationMs / (1000 * 60 * 60))
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  // Function to handle clicking on a trail (from external calls)
  function playTrail(trailIndex: number) {
    currentTrailIndex = trailIndex
    showReplayPanel = true
    showNavigationUI = true
    isExpanded = false // Start in minimal state, will expand when animation starts

    const trail = $historicalTrailStore[currentTrailIndex]
    if (trail) {
      flyToTrail(trail)
      selectTrail(trail)
      // Wait for trail to be ready, then start animation - reduced delay
      const checkReady = setInterval(() => {
        if (animationState.isReady && animationState.trailId === trail.id) {
          clearInterval(checkReady)
          setTimeout(() => {
            animateTrailCreation(trail)
          }, HIGHLIGHT_CONFIG.FLIGHT_DURATION + 200) // Reduced delay
        }
      }, 100)
    }
  }

  // Watch for expansion changes to update camera bounds
  $: if (
    isExpanded !== undefined &&
    currentTrail &&
    showReplayPanel &&
    animationState.isReady
  ) {
    setTimeout(() => {
      if (currentTrail && animationState.coordinates.length > 0) {
        fitTrailBounds(animationState.coordinates, true, false) // Don't use fast transition for expansion
      }
    }, 300) // Wait for expansion animation
  }

  export const highlighterAPI = {
    selectTrail,
    removeHighlight,
    flyToTrail,
    nextTrail: handleNext,
    previousTrail: handlePrevious,
    navigateToTrail,
    animateTrailCreation,
    stopAnimation,
    toggleNavigationUI,
    playTrail,
  }

  onMount(() => {
    const cleanup = () => {
      if (map && map.getStyle()) {
        stopAnimation()
      } else {
        // Just clean up non-map resources if map is already destroyed
        if (animationIntervalId) {
          clearInterval(animationIntervalId)
          animationIntervalId = null
        }
        if (tractorMarker) {
          try {
            tractorMarker.remove()
          } catch (error) {
            console.warn("Error removing tractor marker on cleanup:", error)
          }
          tractorMarker = null
        }
      }
    }

    return cleanup
  })
</script>

<!-- Trail Replay Panel - Only shows when opened via toolbox -->
{#if showReplayPanel}
  <div class="trail-panel" class:expanded={isExpanded}>
    <!-- Expandable Info Section -->
    {#if isExpanded}
      <div class="info-section">
        <!-- Trail Header -->
        <div class="trail-header">
          <div class="trail-title">
            <span class="trail-label">Trail {currentTrailIndex + 1}</span>
            <span class="trail-date"
              >{formatDate(
                currentTrail?.start_time || new Date().toISOString(),
              )}</span
            >
          </div>

          <!-- Trail Color and Width Info -->
          <div class="trail-info">
            <div
              class="trail-color-indicator"
              style="background-color: {currentTrail?.trail_color || '#gray'}"
            ></div>
            <span class="trail-width">{currentTrail?.trail_width || 0}m</span>
          </div>

          <!-- Delete Button -->
          <button class="delete-btn" on:click={handleDeleteTrail}>
            <Trash2 size={16} />
          </button>
        </div>

        <!-- Start/Finish Timeline with Integrated Progress Bar -->
        <div class="timeline-section">
          <div class="point-compact start">
            <div class="point-marker">🚜</div>
            <div class="point-info">
              <span class="point-label">Start</span>
              <span class="point-time"
                >{currentTrail?.start_time
                  ? new Date(currentTrail.start_time).toLocaleTimeString(
                      "en-US",
                      { hour: "2-digit", minute: "2-digit" },
                    )
                  : "N/A"}</span
              >
            </div>
          </div>

          <!-- Integrated Progress Bar (replaces the trail-line) -->
          {#if animationState.isReady}
            <div
              class="trail-progress-container"
              bind:this={progressContainer}
              on:click={handleProgressClick}
              on:keydown={() => {}}
              role="slider"
              tabindex="0"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(animationState.progress * 100)}
            >
              <div class="trail-progress-track">
                <div
                  class="trail-progress-fill"
                  style="width: {animationState.progress * 100}%"
                ></div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  bind:value={animationState.progress}
                  on:mousedown={handleSliderStart}
                  on:mouseup={handleSliderEnd}
                  on:touchstart={handleSliderStart}
                  on:touchend={handleSliderEnd}
                  on:input={(e) => {
                    if (isSliderActive) {
                      const newProgress = parseFloat(e.target.value)
                      animationState.progress = newProgress
                      seekToProgress(newProgress)
                    }
                  }}
                  class="trail-progress-slider"
                  disabled={!animationState.isReady}
                />
              </div>
            </div>
          {:else}
            <!-- Fallback static line when trail is loading -->
            <div class="trail-line-static"></div>
          {/if}

          <div class="point-compact end">
            <div class="point-marker">🏁</div>
            <div class="point-info">
              <span class="point-label">Finish</span>
              <span class="point-time"
                >{currentTrail?.end_time
                  ? new Date(currentTrail.end_time).toLocaleTimeString(
                      "en-US",
                      { hour: "2-digit", minute: "2-digit" },
                    )
                  : "N/A"}</span
              >
            </div>
          </div>
        </div>

        <!-- Compact Stats Grid -->
        <div class="compact-stats">
          <div class="stat-compact">
            <div class="stat-icon">📏</div>
            <div class="stat-info">
              <span class="stat-value"
                >{formatDistance(currentTrail?.trail_distance || 0)}</span
              >
              <span class="stat-label">distance</span>
            </div>
          </div>

          <div class="stat-compact">
            <div class="stat-icon">⏱️</div>
            <div class="stat-info">
              <span class="stat-value">{getEstimatedTime()}</span>
              <span class="stat-label">duration</span>
            </div>
          </div>

          <div class="stat-compact">
            <div class="stat-icon">🚜</div>
            <div class="stat-info">
              <span class="stat-value"
                >{formatHectares(currentTrail?.trail_hectares || 0)}</span
              >
              <span class="stat-label">hectares</span>
            </div>
          </div>

          <div class="stat-compact overlap-stat">
            <div class="stat-icon">🔄</div>
            <div class="stat-info">
              <span class="stat-value"
                >{formatHectares(currentTrail?.trail_hectares_overlap || 0)} ha</span
              >
              <span class="stat-label"
                >{formatPercentage(currentTrail?.trail_percentage_overlap || 0)}
                overlap</span
              >
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Control Bar (Always Visible) -->
    <div class="control-bar">
      <!-- Navigation Controls -->
      <div class="nav-controls">
        <button
          class="control-btn"
          on:click={handlePrevious}
          disabled={$historicalTrailStore.length <= 1}
        >
          <SkipBack size={18} />
        </button>

        <div class="trail-indicator">
          <span class="trail-counter"
            >{currentTrailIndex + 1}/{$historicalTrailStore.length}</span
          >
        </div>

        <button
          class="control-btn"
          on:click={handleNext}
          disabled={$historicalTrailStore.length <= 1}
        >
          <SkipForward size={18} />
        </button>
      </div>

      <!-- Play Control -->
      <div class="play-control">
        <button
          class="play-btn"
          class:playing={animationState.isPlaying}
          class:paused={animationState.isPaused}
          class:completed={animationState.isComplete}
          class:loading={animationState.isLoading}
          disabled={animationState.isLoading || !animationState.isReady}
          on:click={togglePlayPause}
        >
          {#if animationState.isLoading}
            <Loader2 size={20} class="animate-spin" />
          {:else if animationState.isPlaying}
            <Pause size={20} />
          {:else if animationState.isPaused}
            <Play size={20} />
          {:else if animationState.isComplete}
            <Play size={20} />
          {:else}
            <Play size={20} />
          {/if}
        </button>
      </div>

      <!-- Action Controls -->
      <div class="action-controls">
        <button
          class="control-btn"
          on:click={() => (isExpanded = !isExpanded)}
          disabled={animationState.isLoading}
        >
          {#if isExpanded}
            <ChevronDown size={18} />
          {:else}
            <ChevronUp size={18} />
          {/if}
        </button>

        <button class="control-btn" on:click={closeReplayPanel}>
          <X size={18} />
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Modal -->
{#if showDeleteModal && trailToDelete}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-bold">Delete Trail?</h3>
      <p class="py-4">
        Are you sure you want to delete this trail? This action cannot be
        undone.
      </p>
      <div class="modal-action">
        <button class="btn btn-ghost" on:click={() => (showDeleteModal = false)}
          >Cancel</button
        >
        <button class="btn btn-error" on:click={handleDeleteConfirm}
          >Delete</button
        >
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button on:click={() => (showDeleteModal = false)}>Close</button>
    </form>
  </dialog>
{/if}

<style>
  /* Main Trail Panel */
  .trail-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(16px);
    color: white;
    z-index: 1000;
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* Info Section (Only visible when expanded) */
  .info-section {
    padding: 16px 20px 0;
    max-height: 50vh;
    overflow-y: auto;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.9),
      rgba(0, 0, 0, 0.8)
    );
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s ease;
  }

  .trail-panel.expanded .info-section {
    opacity: 1;
    transform: translateY(0);
  }

  .trail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    gap: 12px;
  }

  .trail-title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .trail-label {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .trail-date {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  /* Trail Info (Color & Width) */
  .trail-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .trail-color-indicator {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .trail-width {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* Timeline Section with Integrated Progress Bar */
  .timeline-section {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
  }

  .point-compact {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .point-marker {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .point-compact.start .point-marker {
    background: rgba(34, 197, 94, 0.2);
  }

  .point-compact.end .point-marker {
    background: rgba(239, 68, 68, 0.2);
  }

  .point-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .point-label {
    font-size: 10px;
    font-weight: 500;
    color: white;
    line-height: 1;
  }

  .point-time {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1;
  }

  /* Static Trail Line (fallback) */
  .trail-line-static {
    height: 3px;
    background: linear-gradient(to right, #22c55e, #ef4444);
    flex: 1;
    margin: 0 8px;
    border-radius: 2px;
    opacity: 0.6;
  }

  /* Integrated Progress Bar */
  .trail-progress-container {
    flex: 1;
    margin: 0 8px;
    cursor: pointer;
    padding: 8px 0;
    position: relative;
  }

  .trail-progress-track {
    position: relative;
    height: 6px;
    background: linear-gradient(
      to right,
      rgba(34, 197, 94, 0.2),
      rgba(239, 68, 68, 0.2)
    );
    border-radius: 3px;
    overflow: visible;
  }

  .trail-progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(to right, #22c55e, #ef4444);
    border-radius: 3px;
    transition: width 0.05s ease;
    pointer-events: none;
  }

  .trail-progress-slider {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 6px;
    background: transparent;
    cursor: pointer;
    border-radius: 3px;
    -webkit-appearance: none;
    appearance: none;
    outline: none;
  }

  .trail-progress-slider:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .trail-progress-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: 2px solid #22c55e;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: all 0.2s ease;
  }

  .trail-progress-slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
  }

  .trail-progress-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: 2px solid #22c55e;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: all 0.2s ease;
  }

  .trail-progress-slider::-moz-range-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
  }

  /* Delete Button */
  .delete-btn {
    background: rgba(239, 68, 68, 0.1);
    border: none;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .delete-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    transform: scale(1.05);
  }

  /* Compact Stats Grid */
  .compact-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
  }

  .stat-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    padding: 10px 12px;
    border-radius: 8px;
    border-left: 3px solid #60a5fa;
    transition: all 0.2s ease;
  }

  .stat-compact:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .stat-compact.overlap-stat {
    border-left-color: #f59e0b;
  }

  .stat-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
    flex-shrink: 0;
  }

  .stat-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .stat-value {
    font-size: 13px;
    font-weight: 600;
    color: #60a5fa;
    line-height: 1;
  }

  .overlap-stat .stat-value {
    color: #f59e0b;
  }

  .stat-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1;
  }

  /* Control Bar (Always Visible) */
  .control-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
  }

  .nav-controls,
  .action-controls {
    display: flex;
    gap: 8px;
    flex: 1;
    align-items: center;
  }

  .action-controls {
    justify-content: flex-end;
  }

  .play-control {
    display: flex;
    justify-content: center;
    flex: 1;
  }

  /* Trail Indicator */
  .trail-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 60px;
  }

  .trail-counter {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 8px;
    border-radius: 12px;
  }

  .control-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .control-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    transform: scale(1.05);
  }

  .control-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .play-btn {
    background: rgba(34, 197, 94, 0.2);
    border: none;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #22c55e;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .play-btn:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.3);
    transform: scale(1.1);
  }

  .play-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .play-btn.playing {
    background: rgba(234, 179, 8, 0.2);
    color: #eab308;
  }

  .play-btn.playing:hover:not(:disabled) {
    background: rgba(234, 179, 8, 0.3);
  }

  .play-btn.paused {
    background: rgba(59, 130, 246, 0.2);
    color: #3b82f6;
  }

  .play-btn.paused:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.3);
  }

  .play-btn.completed {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .play-btn.completed:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.3);
  }

  .play-btn.loading {
    background: rgba(156, 163, 175, 0.2);
    color: #9ca3af;
  }

  /* Loading Animation */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  /* Scrollbar Styling */
  .info-section::-webkit-scrollbar {
    width: 2px;
  }

  .info-section::-webkit-scrollbar-track {
    background: transparent;
  }

  .info-section::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 1px;
  }

  /* Mobile Responsiveness */
  @media (max-width: 768px) {
    .info-section {
      max-height: 40vh;
      padding: 12px 16px 0;
    }

    .compact-stats {
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .stat-compact {
      padding: 8px 10px;
    }

    .control-bar {
      padding: 10px 16px;
    }

    .control-btn {
      width: 32px;
      height: 32px;
    }

    .play-btn {
      width: 40px;
      height: 40px;
    }

    .trail-counter {
      font-size: 11px;
      padding: 3px 6px;
    }

    .delete-btn {
      width: 28px;
      height: 28px;
    }

    .trail-progress-container {
      padding: 6px 0;
    }

    .trail-progress-slider::-webkit-slider-thumb {
      width: 14px;
      height: 14px;
    }

    .trail-progress-slider::-moz-range-thumb {
      width: 14px;
      height: 14px;
    }
  }

  @media (max-width: 480px) {
    .info-section {
      max-height: 35vh;
    }

    .trail-header {
      margin-bottom: 12px;
    }

    .compact-stats {
      margin-bottom: 12px;
    }

    .nav-controls,
    .action-controls {
      gap: 6px;
    }

    .point-marker {
      width: 20px;
      height: 20px;
      font-size: 10px;
    }

    .point-label {
      font-size: 9px;
    }

    .point-time {
      font-size: 8px;
    }
  }
</style>
