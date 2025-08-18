<script lang="ts">
  import type { Map } from "mapbox-gl"
  import type { Trail } from "$lib/types/trail"
  import { historicalTrailStore } from "$lib/stores/otherTrailStore"
  import * as mapboxgl from "mapbox-gl"
  import { onMount } from "svelte"
  import { toast } from "svelte-sonner"
  import {
    X,
    Route,
    ArrowLeft,
    ArrowRight,
    Trash2,
    Play,
    Square,
    MoreHorizontal,
    ChevronUp,
    ChevronDown,
    SkipBack,
    SkipForward,
  } from "lucide-svelte"

  interface TrailIdentifiers {
    sourceId: string
    layerId: string
    highlightLayerId: string
    highlightBackgroundLayerId: string
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
  let isExpanded = false // Changed from isMinimized to isExpanded
  let trailToDelete: Trail | null = null
  let isPlayingAnimation = false
  let animationIntervalId: number | null = null
  let animationComplete = false
  let tractorMarker: mapboxgl.Marker | null = null

  const HIGHLIGHT_CONFIG = {
    TRAIL_HIGHLIGHT_DELAY: 3000,
    FLIGHT_DURATION: 2000,
    HIGHLIGHT_WIDTH_MULTIPLIER: 1.2,
    MAX_FLIGHT_ZOOM: 19,
    ANIMATION_SPEED: 25, // Faster animation
  }

  function getCurrentTrail(): Trail | null {
    return $historicalTrailStore[currentTrailIndex] || null
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

  function fitTrailBounds(coordinates: [number, number][]) {
    if (coordinates.length === 0) return

    const bounds = coordinates.reduce(
      (bounds, coord) => {
        return bounds.extend(coord)
      },
      new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
    )

    map.fitBounds(bounds, {
      padding: 100, // More padding to ensure full trail is visible
      duration: HIGHLIGHT_CONFIG.FLIGHT_DURATION,
      maxZoom: HIGHLIGHT_CONFIG.MAX_FLIGHT_ZOOM,
    })
  }

  function animateTrailCreation(trail: Trail) {
    if (isPlayingAnimation) {
      stopAnimation()
      return
    }

    // Don't auto-collapse when animation starts - let user control visibility
    // isExpanded = false

    // Handle different path formats
    let coordinates: [number, number][]

    if (trail.path && typeof trail.path === "object") {
      if ("type" in trail.path && trail.path.type === "LineString") {
        // trail.path is a LineString object
        coordinates = trail.path.coordinates
      } else if (Array.isArray(trail.path)) {
        // trail.path is an array of TrailCoordinate objects
        const sortedCoords = [...trail.path].sort(
          (a, b) => a.timestamp - b.timestamp,
        )
        coordinates = sortedCoords.map((coord) => [
          coord.coordinates.longitude,
          coord.coordinates.latitude,
        ])
      } else {
        console.error("Unknown trail.path format:", trail.path)
        toast.error("Trail has invalid coordinate format")
        return
      }
    } else {
      console.error("trail.path is not valid:", trail.path)
      toast.error("Trail has no valid path data")
      return
    }

    if (coordinates.length === 0) {
      toast.error("Trail has no coordinates to animate")
      return
    }

    isPlayingAnimation = true
    animationComplete = false
    const animationSourceId = createAnimationSource(trail)
    const animationBorderSourceId = `animation-border-source-${trail.id}`
    let currentPointIndex = 0

    // Hide the original trail during animation
    const { layerId } = generateTrailIds(trail.id)
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none")
    }

    // Create tractor marker
    tractorMarker = new mapboxgl.Marker({
      element: createTractorIcon(),
      anchor: "center",
    })
      .setLngLat(coordinates[0])
      .addTo(map)

    // Zoom out to fit the entire trail first
    fitTrailBounds(coordinates)

    // Wait for the camera movement to complete before starting animation
    setTimeout(() => {
      animationIntervalId = setInterval(() => {
        if (currentPointIndex >= coordinates.length) {
          // Animation completed - stop interval but keep overlay visible
          if (animationIntervalId) {
            clearInterval(animationIntervalId)
            animationIntervalId = null
          }
          isPlayingAnimation = false
          animationComplete = true

          // Remove tractor marker when animation completes
          if (tractorMarker) {
            tractorMarker.remove()
            tractorMarker = null
          }

          return
        }

        // Get coordinates up to current point
        const currentCoordinates = coordinates.slice(0, currentPointIndex + 1)

        // Update both the border and main animation sources
        const source = map.getSource(
          animationSourceId,
        ) as mapboxgl.GeoJSONSource
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

        // Move tractor marker to current position
        if (tractorMarker && currentPointIndex < coordinates.length) {
          tractorMarker.setLngLat(coordinates[currentPointIndex])
        }

        currentPointIndex++
      }, HIGHLIGHT_CONFIG.ANIMATION_SPEED)
    }, HIGHLIGHT_CONFIG.FLIGHT_DURATION + 200) // Wait for camera movement + small buffer
  }

  function stopAnimation() {
    if (animationIntervalId) {
      clearInterval(animationIntervalId)
      animationIntervalId = null
    }

    isPlayingAnimation = false
    animationComplete = false

    // Remove tractor marker
    if (tractorMarker) {
      tractorMarker.remove()
      tractorMarker = null
    }

    const currentTrail = getCurrentTrail()
    if (currentTrail && map && map.getStyle()) {
      // Add map check here
      // Remove animation layers
      const animationSourceId = `animation-source-${currentTrail.id}`
      const animationLayerId = `animation-layer-${currentTrail.id}`
      const animationBorderSourceId = `animation-border-source-${currentTrail.id}`
      const animationBorderLayerId = `animation-border-layer-${currentTrail.id}`

      // Remove all animation layers and sources
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

    // Get trail coordinates
    let coordinates: [number, number][]
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
      } else {
        return
      }
    } else {
      return
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
        "line-opacity": 0.6, // Reduced opacity
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
        "line-opacity": 0.9, // Slightly reduced from full opacity
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
    stopAnimation()
    isExpanded = false
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
        showReplayPanel = true // Auto-open replay panel
        isExpanded = false // Start collapsed
      }
    }
  }

  function flyToTrail(trail: Trail) {
    const coordinates = trail.path.coordinates
    const bounds = coordinates.reduce(
      (bounds, coord) => {
        return bounds.extend(coord)
      },
      new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
    )

    map.fitBounds(bounds, {
      padding: 50,
      duration: HIGHLIGHT_CONFIG.FLIGHT_DURATION,
      maxZoom: HIGHLIGHT_CONFIG.MAX_FLIGHT_ZOOM,
    })
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

    flyToTrail(trail)
    selectTrail(trail)

    await new Promise((resolve) =>
      setTimeout(resolve, HIGHLIGHT_CONFIG.FLIGHT_DURATION),
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

  // Calculate estimated time (stub)
  function getEstimatedTime(): string {
    return "2h 45m" // Stub data
  }

  // Calculate hectares covered (stub)
  function getHectaresCovered(): number {
    return 12.5 // Stub data
  }

  // Calculate overlap area (stub)
  function getOverlapArea(): number {
    return 0.8 // Stub data
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
  }

  onMount(() => {
    const cleanup = () => {
      if (map && map.getStyle()) {
        // Add map check here too
        stopAnimation()
      } else {
        // Just clean up non-map resources if map is already destroyed
        if (animationIntervalId) {
          clearInterval(animationIntervalId)
          animationIntervalId = null
        }
        if (tractorMarker) {
          tractorMarker.remove()
          tractorMarker = null
        }
      }
    }

    return cleanup
  })
</script>

<!-- Main navigation button -->
<button
  class="fixed left-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border-none bg-black/70 text-white backdrop-blur transition-all hover:scale-110 hover:bg-black/90"
  style="background: {showNavigationUI
    ? 'rgba(255, 255, 255, 0.9)'
    : ''};bottom: 0.5rem;"
  class:text-black={showNavigationUI}
  on:click={toggleNavigationUI}
  aria-label={showNavigationUI
    ? "Close trail navigation"
    : "Open trail navigation"}
>
  {#if showNavigationUI}
    <X size={20} color="black" />
  {:else}
    <Route size={20} />
  {/if}
</button>

<!-- Trail Replay Panel -->
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
                getCurrentTrail()?.created_at || new Date().toISOString(),
              )}</span
            >
          </div>

          <!-- Start/Finish Timeline -->
          <div class="timeline-section">
            <div class="point-compact start">
              <div class="point-marker">🚜</div>
              <div class="point-info">
                <span class="point-label">Start</span>
                <span class="point-time">9:15 AM</span>
              </div>
            </div>

            <div class="trail-line"></div>

            <div class="point-compact end">
              <div class="point-marker">🏁</div>
              <div class="point-info">
                <span class="point-label">Finish</span>
                <span class="point-time">12:00 PM</span>
              </div>
            </div>
          </div>

          <!-- Delete Button -->
          <button class="delete-btn" on:click={handleDeleteTrail}>
            <Trash2 size={16} />
          </button>
        </div>

        <!-- Compact Stats Grid -->
        <div class="compact-stats">
          <div class="stat-compact">
            <div class="stat-icon">🚜</div>
            <div class="stat-info">
              <span class="stat-value">{getHectaresCovered()}</span>
              <span class="stat-label">hectares</span>
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
            <div class="stat-icon">🔄</div>
            <div class="stat-info">
              <span class="stat-value">{getOverlapArea()}</span>
              <span class="stat-label">overlap</span>
            </div>
          </div>

          <div class="stat-compact">
            <div class="stat-icon">📍</div>
            <div class="stat-info">
              <span class="stat-value">GPS</span>
              <span class="stat-label">tracked</span>
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
          class:playing={isPlayingAnimation}
          class:completed={animationComplete}
          on:click={() => {
            const currentTrail = getCurrentTrail()
            if (currentTrail) {
              if (animationComplete || isPlayingAnimation) {
                stopAnimation()
              } else {
                animateTrailCreation(currentTrail)
              }
            }
          }}
        >
          {#if isPlayingAnimation}
            <Square size={20} />
          {:else if animationComplete}
            <X size={20} />
          {:else}
            <Play size={20} />
          {/if}
        </button>
      </div>

      <!-- Action Controls -->
      <div class="action-controls">
        <button class="control-btn" on:click={() => (isExpanded = !isExpanded)}>
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
    max-height: 30vh;
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

  /* Timeline Section */
  .timeline-section {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .point-compact {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .point-marker {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
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
    font-size: 9px;
    font-weight: 500;
    color: white;
    line-height: 1;
  }

  .point-time {
    font-size: 8px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1;
  }

  .trail-line {
    height: 1px;
    background: linear-gradient(to right, #22c55e, #ef4444);
    flex: 1;
    margin: 0 4px;
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
    margin-bottom: 8px;
  }

  .stat-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    padding: 8px 10px;
    border-radius: 6px;
    border-left: 2px solid #60a5fa;
  }

  .stat-icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
  }

  .stat-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .stat-value {
    font-size: 12px;
    font-weight: 600;
    color: #60a5fa;
    line-height: 1;
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

  .play-btn:hover {
    background: rgba(34, 197, 94, 0.3);
    transform: scale(1.1);
  }

  .play-btn.playing {
    background: rgba(234, 179, 8, 0.2);
    color: #eab308;
  }

  .play-btn.playing:hover {
    background: rgba(234, 179, 8, 0.3);
  }

  .play-btn.completed {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .play-btn.completed:hover {
    background: rgba(239, 68, 68, 0.3);
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
      max-height: 25vh;
      padding: 12px 16px 0;
    }

    .compact-stats {
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .stat-compact {
      padding: 6px 8px;
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
  }

  @media (max-width: 480px) {
    .info-section {
      max-height: 20vh;
    }

    .trail-header {
      margin-bottom: 12px;
    }

    .compact-stats {
      margin-bottom: 8px;
    }

    .nav-controls,
    .action-controls {
      gap: 6px;
    }

    .point-marker {
      width: 18px;
      height: 18px;
      font-size: 9px;
    }

    .point-label {
      font-size: 8px;
    }

    .point-time {
      font-size: 7px;
    }
  }
</style>
