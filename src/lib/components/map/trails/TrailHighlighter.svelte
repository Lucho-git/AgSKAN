<!-- src/lib/components/map/trails/TrailHighlighter.svelte -->
<script lang="ts">
  import type { Map } from "mapbox-gl"

  import type { Trail } from "$lib/types/trail"

  import {
    historicalTrailStore,
    selectedTrailIdStore,
  } from "$lib/stores/otherTrailStore"

  import * as mapboxgl from "mapbox-gl"

  import { onMount } from "svelte"

  import { toast } from "svelte-sonner"

  import {
    Trash2,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Loader2,
  } from "lucide-svelte"

  import {
    generateTrailIds,
    calculateZoomDependentWidth,
  } from "$lib/utils/trailGeometry"

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

  export let map: Map

  export let deleteTrail: (trailId: string) => Promise<boolean>

  export let historicalTrailAPI: any

  export let activeTrailAPI: any

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

  let wasPlayingBeforeDrag = false

  let progressContainer: HTMLElement

  let hasInitiallyFittedBounds = false

  let pendingBoundsFit = false

  let pulseAnimationId: number | null = null

  let currentlySelectedTrailId: string | null = null

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

    FLIGHT_DURATION: 800,

    MAX_FLIGHT_ZOOM: 19,

    ANIMATION_SPEED: 25,

    DIMMED_OPACITY: 0.25,

    NORMAL_OPACITY: 0.8,

    GLOW_WIDTH_MULTIPLIER: 3.0,

    BORDER_WIDTH_MULTIPLIER: 2.0,

    INNER_WIDTH_MULTIPLIER: 1.5,
  }

  $: currentTrail = $historicalTrailStore[currentTrailIndex] || null

  $: if (currentTrail) {
    initializeTrailAnimation(currentTrail)
  }

  $: if (pendingBoundsFit && currentTrail && animationState.isReady) {
    setTimeout(() => {
      if (currentTrail && animationState.coordinates.length > 0) {
        fitTrailBounds(animationState.coordinates, true, false)

        hasInitiallyFittedBounds = true

        pendingBoundsFit = false
      }
    }, 350)
  }

  function getCurrentTrail(): Trail | null {
    return currentTrail
  }

  function initializeTrailAnimation(trail: Trail) {
    stopAnimation()

    hasInitiallyFittedBounds = false

    pendingBoundsFit = false

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
    }, 50)
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

    const animationLayerId = `animation-layer-${trail.id}`

    const animationBorderLayerId = `animation-border-layer-${trail.id}`

    // Must remove layers BEFORE sources (Mapbox throws if source has dependent layers)
    try {
      if (map.getLayer(animationLayerId)) {
        map.removeLayer(animationLayerId)
      }

      if (map.getLayer(animationBorderLayerId)) {
        map.removeLayer(animationBorderLayerId)
      }

      if (map.getSource(animationSourceId)) {
        map.removeSource(animationSourceId)
      }

      if (map.getSource(animationBorderSourceId)) {
        map.removeSource(animationBorderSourceId)
      }
    } catch (error) {
      console.warn("Error cleaning up animation layers/sources:", error)
    }

    const emptyGeoJSON = {
      type: "FeatureCollection",

      features: [],
    }

    map.addSource(animationSourceId, {
      type: "geojson",

      data: emptyGeoJSON,
    })

    map.addSource(animationBorderSourceId, {
      type: "geojson",

      data: emptyGeoJSON,
    })

    // White border layer

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

        "line-opacity": 0.9,
      },
    })

    // Inner white fill layer

    map.addLayer({
      id: `animation-layer-${trail.id}`,

      type: "line",

      source: animationSourceId,

      layout: {
        "line-join": "round",

        "line-cap": "round",
      },

      paint: {
        "line-color": "white",

        "line-width": calculateZoomDependentWidth(
          (trail.trail_width || 3) * 1.0,

          1,
        ),

        "line-opacity": 1.0,
      },
    })

    return animationSourceId
  }

  function startPulsingGlow(trailId: string) {
    stopPulsingGlow()

    const { highlightLayerId } = generateTrailIds(trailId)

    const glowLayerId = `${highlightLayerId}-glow`

    let pulsePhase = 0

    function pulse() {
      pulsePhase = (pulsePhase + 0.08) % (Math.PI * 2)

      const glowOpacity = 0.4 + Math.sin(pulsePhase) * 0.3 // Oscillates between 0.1 and 0.7

      if (map.getLayer(glowLayerId)) {
        map.setPaintProperty(glowLayerId, "line-opacity", glowOpacity)
      } else {
        stopPulsingGlow()

        return
      }

      pulseAnimationId = requestAnimationFrame(pulse)
    }

    pulse()
  }

  function stopPulsingGlow() {
    if (pulseAnimationId !== null) {
      cancelAnimationFrame(pulseAnimationId)

      pulseAnimationId = null
    }
  }

  function getMenuHeight(): number {
    if (!showReplayPanel) return 0

    return 120
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
    // Ignore clicks that originated from the range slider itself
    if (event.target instanceof HTMLInputElement) return

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

    if (!animationState.isPlaying && !isSliderActive) {
      startAnimation()
    }
  }

  function handleSliderStart() {
    if (!animationState.isReady) return

    isSliderActive = true

    wasPlayingBeforeDrag = animationState.isPlaying

    if (animationState.isPlaying) {
      pauseAnimation()
    }
  }

  function handleSliderEnd() {
    if (!animationState.isReady) return

    isSliderActive = false

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

    if (!hasInitiallyFittedBounds) {
      fitTrailBounds(animationState.coordinates, true, false)

      hasInitiallyFittedBounds = true
    }

    if (animationIntervalId) {
      clearInterval(animationIntervalId)

      animationIntervalId = null
    }

    animationState.isPlaying = true

    animationState.isPaused = false

    animationState.isComplete = false

    const trail = getCurrentTrail()

    if (!trail) return

    const animationSourceId = createAnimationSource(trail)

    const animationBorderSourceId = `animation-border-source-${trail.id}`

    const { layerId } = generateTrailIds(trail.id)

    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none")
    }

    if (tractorMarker) {
      try {
        tractorMarker.remove()
      } catch (error) {
        console.warn("Error removing tractor marker:", error)
      }

      tractorMarker = null
    }

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

    updateAnimationDisplay()

    animationIntervalId = setInterval(() => {
      if (
        animationState.currentIndex >=
        animationState.coordinates.length - 1
      ) {
        completeAnimation()

        return
      }

      if (!animationState.isPlaying) {
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

    if (targetProgress >= 1) {
      animationState.isComplete = true

      animationState.isPlaying = false

      animationState.isPaused = false
    } else {
      animationState.isComplete = false
    }

    const trail = getCurrentTrail()

    if (!trail || trail.id !== animationState.trailId) return

    const animationSourceId = `animation-source-${trail.id}`

    if (!map.getSource(animationSourceId)) {
      createAnimationSource(trail)
    }

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

        tractorMarker.remove()

        tractorMarker = null
      }
    }

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
      animationState.currentIndex = 0

      animationState.progress = 0

      animationState.isComplete = false

      startAnimation()
    } else {
      startAnimation()
    }
  }

  function animateTrailCreation(trail: Trail) {
    console.log(`Starting animation for trail ${trail.id}`)

    if (!animationState.isReady || animationState.trailId !== trail.id) {
      console.warn("Trail not ready for animation")

      return
    }

    if (!hasInitiallyFittedBounds) {
      fitTrailBounds(animationState.coordinates, true, true)

      hasInitiallyFittedBounds = true
    }

    animationState.currentIndex = 0

    animationState.progress = 0

    animationState.isComplete = false

    animationState.isPaused = false

    const delay = !hasInitiallyFittedBounds
      ? HIGHLIGHT_CONFIG.FLIGHT_DURATION + 350
      : HIGHLIGHT_CONFIG.FLIGHT_DURATION + 100

    setTimeout(() => {
      startAnimation()
    }, delay)
  }

  function stopAnimation() {
    if (animationIntervalId) {
      clearInterval(animationIntervalId)

      animationIntervalId = null
    }

    hasInitiallyFittedBounds = false

    pendingBoundsFit = false

    if (tractorMarker) {
      try {
        tractorMarker.remove()
      } catch (error) {
        console.warn("Error removing tractor marker:", error)
      }

      tractorMarker = null
    }

    const currentTrail = getCurrentTrail()

    if (currentTrail && map) {
      try {
        // Guard: map.getStyle() throws if the map has been destroyed (e.g. {#key} remount)
        if (!map.getStyle()) return
      } catch {
        return
      }

      const animationSourceId = `animation-source-${currentTrail.id}`

      const animationLayerId = `animation-layer-${currentTrail.id}`

      const animationBorderSourceId = `animation-border-source-${currentTrail.id}`

      const animationBorderLayerId = `animation-border-layer-${currentTrail.id}`

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

        const { layerId } = generateTrailIds(currentTrail.id)

        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", "visible")
        }
      } catch (error) {
        console.warn("Error cleaning up animation layers:", error)
      }
    }

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

    if (map.getSource(markersSourceId)) {
      if (map.getLayer(markersLayerId)) {
        map.removeLayer(markersLayerId)
      }

      if (map.getLayer(markersTextLayerId)) {
        map.removeLayer(markersTextLayerId)
      }

      map.removeSource(markersSourceId)
    }

    let coordinates: [number, number][] = []

    if (animationState.isReady && animationState.trailId === trail.id) {
      coordinates = animationState.coordinates
    } else {
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

    map.addLayer({
      id: markersLayerId,

      type: "circle",

      source: markersSourceId,

      paint: {
        "circle-radius": 15,

        "circle-color": [
          "case",

          ["==", ["get", "type"], "start"],

          "#22c55e",

          "#ef4444",
        ],

        "circle-stroke-width": 2,

        "circle-stroke-color": "white",

        "circle-opacity": 0.9,
      },
    })

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
    // Sync selection with toolbox trail menu
    selectedTrailIdStore.set(trail.id)

    const { sourceId, highlightLayerId } = generateTrailIds(trail.id)

    // Guard: source must exist on map before we can add highlight layers
    if (!map.getSource(sourceId)) {
      console.warn(
        `[TrailHighlighter] selectTrail: source "${sourceId}" not found — trail not yet rendered on map`,
      )
      return
    }

    const baseWidth = trail.trail_width || 3

    // Dim all other trails for contrast

    $historicalTrailStore.forEach((t) => {
      if (t.id !== trail.id) {
        const { layerId } = generateTrailIds(t.id)

        if (map.getLayer(layerId)) {
          map.setPaintProperty(
            layerId,

            "line-opacity",

            HIGHLIGHT_CONFIG.DIMMED_OPACITY,
          )
        }
      }
    })

    // Add outer glow layer (will pulse)

    const glowLayerId = `${highlightLayerId}-glow`

    map.addLayer({
      type: "line",

      source: sourceId,

      id: glowLayerId,

      paint: {
        "line-color": "white",

        "line-width": calculateZoomDependentWidth(
          baseWidth,

          HIGHLIGHT_CONFIG.GLOW_WIDTH_MULTIPLIER,
        ),

        "line-opacity": 0.6,

        "line-blur": 8,
      },

      layout: {
        "line-cap": "round",

        "line-join": "round",
      },
    })

    // Add bright white border

    map.addLayer({
      type: "line",

      source: sourceId,

      id: highlightLayerId,

      paint: {
        "line-color": "white",

        "line-width": calculateZoomDependentWidth(
          baseWidth,

          HIGHLIGHT_CONFIG.BORDER_WIDTH_MULTIPLIER,
        ),

        "line-opacity": 1.0,
      },

      layout: {
        "line-cap": "round",

        "line-join": "round",
      },
    })

    // Add the trail itself with enhanced color and width

    const innerLayerId = `${highlightLayerId}-inner`

    map.addLayer({
      type: "line",

      source: sourceId,

      id: innerLayerId,

      paint: {
        "line-color": trail.trail_color,

        "line-width": calculateZoomDependentWidth(
          baseWidth,

          HIGHLIGHT_CONFIG.INNER_WIDTH_MULTIPLIER,
        ),

        "line-opacity": 1.0,
      },

      layout: {
        "line-cap": "round",

        "line-join": "round",
      },
    })

    // Start pulsing the glow
    currentlySelectedTrailId = trail.id

    startPulsingGlow(trail.id)
  }

  function handleDeleteTrail() {
    const trail = $historicalTrailStore[currentTrailIndex]
    if (!trail) {
      console.warn(
        "handleDeleteTrail: no trail at index",
        currentTrailIndex,
        "store length:",
        $historicalTrailStore.length,
      )
      toast.error("No trail selected to delete")
      return
    }
    trailToDelete = trail
    showDeleteModal = true
  }

  function closeReplayPanel() {
    showReplayPanel = false

    showNavigationUI = false

    stopAnimation()

    stopPulsingGlow()

    currentlySelectedTrailId = null

    $historicalTrailStore.forEach((t) => {
      removeHighlight(t.id)

      removeStartEndMarkers(t.id)
    })
  }

  async function handleDeleteConfirm() {
    if (trailToDelete) {
      try {
        const trailIdToDelete = trailToDelete.id

        removeHighlight(trailIdToDelete)

        removeStartEndMarkers(trailIdToDelete)

        if (animationState.trailId === trailIdToDelete) {
          stopAnimation()
        }

        if (currentlySelectedTrailId === trailIdToDelete) {
          stopPulsingGlow()

          currentlySelectedTrailId = null
        }

        const success = await deleteTrail(trailIdToDelete)

        if (success) {
          showDeleteModal = false

          trailToDelete = null

          if ($historicalTrailStore.length === 0) {
            showNavigationUI = false

            showReplayPanel = false

            isExpanded = false
          } else {
            if (currentTrailIndex >= $historicalTrailStore.length) {
              currentTrailIndex = Math.max(0, $historicalTrailStore.length - 1)
            }

            await navigateToTrail(currentTrailIndex)
          }
        } else {
          showDeleteModal = false

          trailToDelete = null

          toast.error("Failed to delete trail. Please try again.")
        }
      } catch (err) {
        console.error("handleDeleteConfirm error:", err)
        showDeleteModal = false
        trailToDelete = null
        toast.error("Error deleting trail. Please try again.")
      }
    }
  }

  function toggleNavigationUI(forceOpen = false) {
    if (!$historicalTrailStore.length) {
      toast.error("No trails available. Create some trails first!")

      return
    }

    // If forceOpen is true, only open (don't toggle off)
    if (forceOpen) {
      if (showNavigationUI) return // already open, do nothing
      showNavigationUI = true
    } else {
      showNavigationUI = !showNavigationUI
    }

    if (!showNavigationUI) {
      $historicalTrailStore.forEach((t) => {
        removeHighlight(t.id)

        removeStartEndMarkers(t.id)
      })

      stopAnimation()

      stopPulsingGlow()

      showDropdownMenu = false

      showReplayPanel = false

      isExpanded = false

      currentlySelectedTrailId = null
    } else {
      if ($historicalTrailStore.length > 0) {
        const currentTrail = $historicalTrailStore[currentTrailIndex]

        flyToTrail(currentTrail)

        selectTrail(currentTrail)

        showReplayPanel = true

        isExpanded = false
      }
    }
  }

  function flyToTrail(trail: Trail) {
    let coordinates: [number, number][] = []

    if (animationState.isReady && animationState.trailId === trail.id) {
      coordinates = animationState.coordinates
    } else if (trail.path && trail.path.coordinates) {
      coordinates = trail.path.coordinates
    }

    if (coordinates.length > 0) {
      fitTrailBounds(coordinates, true, true)
    }
  }

  function removeHighlight(trailId: string) {
    const { highlightLayerId } = generateTrailIds(trailId)

    const innerLayerId = `${highlightLayerId}-inner`

    const glowLayerId = `${highlightLayerId}-glow`

    try {
      if (map && map.getLayer(glowLayerId)) {
        map.removeLayer(glowLayerId)
      }

      if (map && map.getLayer(highlightLayerId)) {
        map.removeLayer(highlightLayerId)
      }

      if (map && map.getLayer(innerLayerId)) {
        map.removeLayer(innerLayerId)
      }

      // Restore all trails to normal opacity

      $historicalTrailStore.forEach((t) => {
        const { layerId } = generateTrailIds(t.id)

        if (map.getLayer(layerId)) {
          map.setPaintProperty(
            layerId,

            "line-opacity",

            HIGHLIGHT_CONFIG.NORMAL_OPACITY,
          )
        }
      })
    } catch (error) {
      console.log("Error removing highlight layers:", error)
    }
  }

  async function navigateToTrail(index: number) {
    if ($historicalTrailStore.length === 0) return

    stopAnimation()

    stopPulsingGlow()

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

  function formatDate(dateString: string): string {
    const date = new Date(dateString)

    return date.toLocaleDateString("en-US", {
      month: "short",

      day: "numeric",
    })
  }

  function formatPercentage(percentage: number): string {
    if (!percentage) return "0.0%"

    return `${percentage.toFixed(1)}%`
  }

  function playTrail(trailIndex: number) {
    // Clean up previous trail state efficiently
    stopAnimation()
    stopPulsingGlow()
    if (showReplayPanel) {
      // Only remove previous trail's highlight, not all trails
      const prevTrail = $historicalTrailStore[currentTrailIndex]
      if (prevTrail) {
        removeHighlight(prevTrail.id)
        removeStartEndMarkers(prevTrail.id)
      }
    }

    currentTrailIndex = trailIndex

    showReplayPanel = true

    showNavigationUI = true

    isExpanded = false

    const trail = $historicalTrailStore[currentTrailIndex]

    if (trail) {
      flyToTrail(trail)

      selectTrail(trail)

      const checkReady = setInterval(() => {
        if (animationState.isReady && animationState.trailId === trail.id) {
          clearInterval(checkReady)

          setTimeout(() => {
            animateTrailCreation(trail)
          }, 300)
        }
      }, 50)
    }
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

    closeReplayPanel,
  }

  onMount(() => {
    const cleanup = () => {
      stopPulsingGlow()

      if (map && map.getStyle()) {
        stopAnimation()
      } else {
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

<!-- Trail Replay Panel -->
{#if showReplayPanel}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="ve" on:click|stopPropagation on:mousedown|stopPropagation>
    <!-- Header: accent + info + centered transport + actions -->
    <div class="ve-header">
      <div
        class="ve-accent"
        style="background-color: {currentTrail?.trail_color || '#888'}"
      ></div>
      <span class="ve-title"
        >Trail {currentTrailIndex + 1}
        <span class="ve-of">of {$historicalTrailStore.length}</span></span
      >
      <div class="ve-transport">
        <button
          class="ve-skip"
          on:click={handlePrevious}
          disabled={$historicalTrailStore.length <= 1}
          ><SkipBack size={20} /></button
        >
        <button
          class="ve-play"
          class:playing={animationState.isPlaying}
          class:paused={animationState.isPaused}
          class:loading={animationState.isLoading}
          disabled={animationState.isLoading || !animationState.isReady}
          on:click={togglePlayPause}
        >
          {#if animationState.isLoading}<Loader2
              size={24}
              class="animate-spin"
            />
          {:else if animationState.isPlaying}<Pause size={24} />
          {:else}<Play size={24} />{/if}
        </button>
        <button
          class="ve-skip"
          on:click={handleNext}
          disabled={$historicalTrailStore.length <= 1}
          ><SkipForward size={20} /></button
        >
      </div>
      <div class="ve-actions">
        <button class="icon-btn del" on:click={handleDeleteTrail}
          ><Trash2 size={16} /></button
        >
      </div>
    </div>
    <!-- Progress bar with percentage -->
    <div class="ve-prog-row">
      {#if animationState.isReady}
        <div
          class="ve-prog"
          bind:this={progressContainer}
          on:click={handleProgressClick}
          on:keydown={() => {}}
          role="slider"
          tabindex="0"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(animationState.progress * 100)}
        >
          <div class="ve-track">
            <div
              class="fill"
              style="width: {animationState.progress * 100}%"
            ></div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              bind:value={animationState.progress}
              on:pointerdown={handleSliderStart}
              on:change={handleSliderEnd}
              on:click|stopPropagation
              on:input={(e) => {
                if (isSliderActive) {
                  const v = parseFloat(e.target.value)
                  animationState.progress = v
                  seekToProgress(v)
                }
              }}
              class="range-input ve-slider"
              disabled={!animationState.isReady}
            />
          </div>
        </div>
        <span class="ve-pct">{Math.round(animationState.progress * 100)}%</span>
      {:else}
        <div class="ve-prog">
          <div class="ve-track"><div class="fill" style="width: 0%"></div></div>
        </div>
        <span class="ve-pct">0%</span>
      {/if}
    </div>
  </div>
{/if}

<!-- Delete Modal -->
{#if showDeleteModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="delete-overlay" on:click={() => (showDeleteModal = false)}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="delete-modal" on:click|stopPropagation>
      <h3 class="text-lg font-bold">Delete Trail?</h3>
      <p class="py-4">
        Are you sure you want to delete this trail? This action cannot be
        undone.
      </p>
      <div class="delete-modal-actions">
        <button class="btn btn-ghost" on:click={() => (showDeleteModal = false)}
          >Cancel</button
        >
        <button class="btn btn-error" on:click={handleDeleteConfirm}
          >Delete</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  /* ═══ SHARED ═══ */

  /* Shared icon button (36px min for touch) */
  .icon-btn {
    background: none;
    border: none;
    border-radius: 50%;
    min-width: 36px;
    min-height: 36px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.12s;
    padding: 0;
    flex-shrink: 0;
  }
  .icon-btn:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }
  .icon-btn.del {
    color: rgba(239, 68, 68, 0.6);
  }
  .icon-btn.del:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.12);
  }

  /* Shared fill/input styles */
  .fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, #22c55e, #60a5fa);
    border-radius: 2px;
    transition: width 0.05s linear;
    pointer-events: none;
  }
  .range-input {
    position: absolute;
    top: -4px;
    left: 0;
    width: 100%;
    height: 12px;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    outline: none;
    margin: 0;
    padding: 0;
  }
  .range-input:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .range-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    border: 2px solid #22c55e;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  .range-input::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    border: 2px solid #22c55e;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* ═══ TRAIL REPLAY PANEL ═══ */
  .ve {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(8, 8, 8, 0.94);
    backdrop-filter: blur(20px);
    color: white;
    z-index: 1000;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    animation: slideUp 0.25s ease-out;
    display: flex;
    flex-direction: column;
  }
  .ve-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 4px 0;
  }
  .ve-accent {
    width: 5px;
    align-self: stretch;
    border-radius: 0 4px 4px 0;
    flex-shrink: 0;
  }
  .ve-title {
    font-size: 14px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .ve-of {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
  }
  .ve-transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1;
  }
  .ve-play {
    background: rgba(34, 197, 94, 0.18);
    border: none;
    border-radius: 50%;
    min-width: 46px;
    min-height: 46px;
    width: 46px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #22c55e;
    cursor: pointer;
    transition: all 0.12s;
    flex-shrink: 0;
  }
  .ve-play:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.28);
    transform: scale(1.06);
  }
  .ve-play:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .ve-play.playing {
    background: rgba(234, 179, 8, 0.18);
    color: #eab308;
  }
  .ve-play.paused {
    background: rgba(96, 165, 250, 0.18);
    color: #60a5fa;
  }
  .ve-play.loading {
    background: rgba(156, 163, 175, 0.1);
    color: #6b7280;
  }
  .ve-skip {
    background: none;
    border: none;
    border-radius: 50%;
    min-width: 40px;
    min-height: 40px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    transition: all 0.12s;
    padding: 0;
    flex-shrink: 0;
  }
  .ve-skip:hover:not(:disabled) {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }
  .ve-skip:disabled {
    opacity: 0.25;
    cursor: default;
  }
  .ve-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .ve-prog-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 14px 10px;
  }
  .ve-prog {
    flex: 1;
    cursor: pointer;
    padding: 6px 0;
    position: relative;
  }
  .ve-track {
    position: relative;
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    overflow: visible;
  }
  .ve-track .fill {
    border-radius: 3px;
  }
  .ve-slider {
    top: -5px;
    height: 16px;
  }
  .ve-pct {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.5);
    min-width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ═══ MOBILE ═══ */
  @media (max-width: 480px) {
    .ve-play {
      min-width: 42px;
      min-height: 42px;
      width: 42px;
      height: 42px;
    }
    .ve-skip {
      min-width: 36px;
      min-height: 36px;
      width: 36px;
      height: 36px;
    }
  }

  /* ═══ DELETE MODAL ═══ */
  .delete-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease-out;
  }
  .delete-modal {
    background: #1d232a;
    color: white;
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: calc(100% - 32px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    animation: scaleIn 0.15s ease-out;
  }
  .delete-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes scaleIn {
    from {
      transform: scale(0.95);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
