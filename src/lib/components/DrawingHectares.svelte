<!-- src/lib/components/DrawingHectares.svelte -->
<script>
  import { onMount, onDestroy } from "svelte"
  import { drawingModeEnabled } from "$lib/stores/controlStore"
  import * as turf from "@turf/turf"
  import { Ruler, Plus, X, Undo } from "lucide-svelte"

  export let map
  let area = { hectares: 0, squareMeters: 0 }
  let currentPoints = []
  let sourceId = "drawing-hectares-source"
  let layerIds = {
    line: "drawing-hectares-line",
    fill: "drawing-hectares-fill",
    points: "drawing-hectares-points",
  }

  $: canUndo = currentPoints.length > 0

  function formatArea(areaInSquareMeters) {
    return {
      squareMeters: Math.round(areaInSquareMeters),
      hectares: Math.round((areaInSquareMeters / 10000) * 100) / 100,
    }
  }

  function initializeMapLayers() {
    if (!map || !map.isStyleLoaded()) {
      console.log("Map not ready for layer initialization")
      return false
    }

    try {
      // Add source for our drawing
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        })
      }

      // Add fill layer
      if (!map.getLayer(layerIds.fill)) {
        map.addLayer({
          id: layerIds.fill,
          type: "fill",
          source: sourceId,
          filter: ["==", "$type", "Polygon"],
          paint: {
            "fill-color": "#0ea5e9",
            "fill-opacity": 0.3,
          },
        })
      }

      // Add line layer
      if (!map.getLayer(layerIds.line)) {
        map.addLayer({
          id: layerIds.line,
          type: "line",
          source: sourceId,
          filter: ["in", "$type", "LineString", "Polygon"],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#0ea5e9",
            "line-width": 3,
            "line-dasharray": [2, 2],
          },
        })
      }

      // Add points layer
      if (!map.getLayer(layerIds.points)) {
        map.addLayer({
          id: layerIds.points,
          type: "circle",
          source: sourceId,
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 6,
            "circle-color": "#fff",
            "circle-stroke-color": "#0ea5e9",
            "circle-stroke-width": 2,
          },
        })
      }

      return true
    } catch (error) {
      console.error("Error initializing map layers:", error)
      return false
    }
  }

  function updateMapDisplay() {
    if (!map || !map.getSource || !map.getSource(sourceId)) {
      console.log("Map source not available for update")
      return
    }

    try {
      const features = []

      // Add points
      currentPoints.forEach((point, index) => {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: point,
          },
          properties: {
            index: index,
          },
        })
      })

      if (currentPoints.length === 2) {
        // Show line between first two points
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: currentPoints,
          },
          properties: {},
        })
      } else if (currentPoints.length >= 3) {
        // Show polygon
        const polygonCoords = [...currentPoints, currentPoints[0]] // Close the polygon
        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [polygonCoords],
          },
          properties: {},
        })

        // Calculate area
        try {
          const polygon = turf.polygon([polygonCoords])
          area = formatArea(turf.area(polygon))
        } catch (error) {
          console.error("Error calculating area:", error)
          area = { hectares: 0, squareMeters: 0 }
        }
      } else {
        // Reset area if less than 3 points
        area = { hectares: 0, squareMeters: 0 }
      }

      // Update the source
      map.getSource(sourceId).setData({
        type: "FeatureCollection",
        features: features,
      })
    } catch (error) {
      console.error("Error updating map display:", error)
    }
  }

  function addPoint() {
    if (!map || !$drawingModeEnabled) return

    // Get the center of the screen (where crosshair is)
    const center = map.getCenter()
    const point = [center.lng, center.lat]

    // Use assignment instead of push to trigger reactivity
    currentPoints = [...currentPoints, point]
    console.log("Added point:", point, "Total points:", currentPoints.length)

    updateMapDisplay()
  }

  function undoLastPoint() {
    if (currentPoints.length === 0) return

    // Remove last point
    currentPoints = currentPoints.slice(0, -1)
    console.log("Undid last point. Remaining points:", currentPoints.length)

    updateMapDisplay()
  }

  function cancelDrawing() {
    console.log("Cancelled drawing")
    resetDrawing()
    $drawingModeEnabled = false
  }

  function resetDrawing() {
    currentPoints = [] // Reassignment instead of mutation
    area = { hectares: 0, squareMeters: 0 }
    updateMapDisplay()
  }

  function cleanupLayers() {
    if (!map || !map.getLayer || !map.getSource) {
      console.log("Map not available for cleanup")
      return
    }

    try {
      // Remove layers safely
      Object.values(layerIds).forEach((layerId) => {
        try {
          if (map.getLayer && map.getLayer(layerId)) {
            map.removeLayer(layerId)
            console.log(`Removed layer: ${layerId}`)
          }
        } catch (error) {
          console.warn(`Could not remove layer ${layerId}:`, error)
        }
      })

      // Remove source safely
      try {
        if (map.getSource && map.getSource(sourceId)) {
          map.removeSource(sourceId)
          console.log(`Removed source: ${sourceId}`)
        }
      } catch (error) {
        console.warn(`Could not remove source ${sourceId}:`, error)
      }
    } catch (error) {
      console.error("Error during cleanup:", error)
    }
  }

  onMount(() => {
    if (map) {
      // Wait for map to be ready before initializing
      if (map.isStyleLoaded()) {
        initializeMapLayers()
      } else {
        map.on("styledata", () => {
          if (map.isStyleLoaded()) {
            initializeMapLayers()
          }
        })
      }
    }
  })

  onDestroy(() => {
    console.log("DrawingHectares component destroying")
    cleanupLayers()
  })

  $: if (map && $drawingModeEnabled !== undefined) {
    if ($drawingModeEnabled) {
      // Reset state when enabling drawing mode
      resetDrawing()

      // Initialize layers when ready
      if (map.isStyleLoaded()) {
        initializeMapLayers()
      } else {
        // Wait for style to load
        const handleStyleLoad = () => {
          if (map.isStyleLoaded()) {
            initializeMapLayers()
            map.off("styledata", handleStyleLoad)
          }
        }
        map.on("styledata", handleStyleLoad)
      }

      console.log("Drawing mode enabled")
    } else {
      // Clean up when disabling drawing mode
      resetDrawing()
      console.log("Drawing mode disabled")
    }
  }
</script>

{#if $drawingModeEnabled}
  <!-- Crosshair overlay -->
  <div class="crosshair-overlay">
    <div class="crosshair">
      <!-- Horizontal line -->
      <div class="crosshair-line horizontal"></div>
      <!-- Vertical line -->
      <div class="crosshair-line vertical"></div>
      <!-- Center dot -->
      <div class="crosshair-center"></div>
    </div>
  </div>

  <!-- Mobile-first status display -->
  {#if currentPoints.length >= 3}
    <div class="area-display">
      <div class="area-value">
        {area.hectares}<span class="area-unit">ha</span>
      </div>
      <div class="area-detail">
        {area.squareMeters.toLocaleString()} m² • {currentPoints.length} points
      </div>
    </div>
  {:else}
    <div class="progress-indicator">
      <div class="progress-dots">
        {#each Array(3) as _, i}
          <div
            class="progress-dot"
            class:active={i < currentPoints.length}
          ></div>
        {/each}
      </div>
      <div class="progress-text">
        {currentPoints.length}/3 points • {3 - currentPoints.length} more needed
      </div>
    </div>
  {/if}

  <!-- Control buttons - bottom center -->
  <div class="button-container">
    <div class="button-group">
      <!-- Undo button -->
      <button
        class="undo-btn"
        class:disabled={!canUndo}
        on:click={undoLastPoint}
        disabled={!canUndo}
      >
        <Undo size={20} />
      </button>

      <!-- Main add point button -->
      <button class="add-point-btn" on:click={addPoint}>
        <Plus class="h-6 w-6" />
        <span class="btn-label">Add Point</span>
      </button>

      <!-- Cancel button -->
      <button class="cancel-btn" on:click={cancelDrawing}>
        <X class="h-5 w-5" />
      </button>
    </div>
  </div>

  <!-- Bottom instructions -->
  <div class="bottom-instructions">
    Move map to position crosshair, then tap + to place points
  </div>
{/if}

<style>
  /* Crosshair overlay */
  .crosshair-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crosshair {
    position: relative;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crosshair-line {
    position: absolute;
    background: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .crosshair-line.horizontal {
    width: 2rem;
    height: 2px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .crosshair-line.vertical {
    width: 2px;
    height: 2rem;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .crosshair-center {
    position: absolute;
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  /* Mobile-first area display */
  .area-display {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 12px 20px;
    border-radius: 16px;
    text-align: center;
    z-index: 10;
    backdrop-filter: blur(8px);
  }

  .area-value {
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
    color: #0ea5e9;
  }

  .area-unit {
    font-size: 14px;
    font-weight: 500;
    margin-left: 2px;
  }

  .area-detail {
    font-size: 11px;
    opacity: 0.8;
    margin-top: 4px;
  }

  /* Progress indicator for initial points */
  .progress-indicator {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 16px;
    border-radius: 16px;
    text-align: center;
    z-index: 10;
    backdrop-filter: blur(8px);
  }

  .progress-dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .progress-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transition: all 0.2s ease;
  }

  .progress-dot.active {
    background: #0ea5e9;
    transform: scale(1.2);
  }

  .progress-text {
    font-size: 11px;
    opacity: 0.9;
  }

  /* Button container - bottom center */
  .button-container {
    position: fixed;
    bottom: 5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
  }

  .button-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .undo-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(234, 179, 8, 0.9);
    color: white;
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(234, 179, 8, 0.3);
  }

  .undo-btn:hover:not(.disabled) {
    background: #ca8a04;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(234, 179, 8, 0.4);
  }

  .undo-btn:active:not(.disabled) {
    transform: scale(0.95);
  }

  .undo-btn.disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background: rgba(234, 179, 8, 0.5);
  }

  .add-point-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: #0ea5e9;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 16px 24px;
    box-shadow: 0 6px 20px rgba(14, 165, 233, 0.4);
    transition: all 0.2s ease;
    min-width: 80px;
    cursor: pointer;
  }

  .add-point-btn:hover {
    background: #0284c7;
    box-shadow: 0 8px 24px rgba(14, 165, 233, 0.5);
    transform: translateY(-2px);
  }

  .add-point-btn:active {
    transform: translateY(0) scale(0.95);
    box-shadow: 0 4px 12px rgba(14, 165, 233, 0.6);
  }

  .btn-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .cancel-btn:hover {
    background: #dc2626;
    box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
  }

  .cancel-btn:active {
    transform: scale(0.95);
  }

  /* Bottom instructions */
  .bottom-instructions {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 12px;
    text-align: center;
    z-index: 10;
    max-width: 90%;
    backdrop-filter: blur(4px);
  }

  /* Mobile responsive adjustments */
  @media (max-width: 768px) {
    .button-container {
      bottom: 4rem;
    }

    .add-point-btn {
      padding: 14px 20px;
      min-width: 70px;
    }

    .add-point-btn .h-6 {
      width: 1.25rem;
      height: 1.25rem;
    }

    .btn-label {
      font-size: 9px;
    }

    .undo-btn,
    .cancel-btn {
      width: 44px;
      height: 44px;
    }

    .area-value {
      font-size: 20px;
    }

    .area-unit {
      font-size: 12px;
    }

    .area-detail {
      font-size: 10px;
    }
  }

  @media (max-width: 480px) {
    .button-container {
      bottom: 3.5rem;
    }

    .add-point-btn {
      padding: 12px 18px;
      min-width: 60px;
      border-radius: 16px;
    }

    .btn-label {
      font-size: 8px;
    }

    .undo-btn,
    .cancel-btn {
      width: 40px;
      height: 40px;
    }

    .area-display,
    .progress-indicator {
      padding: 10px 16px;
    }

    .area-value {
      font-size: 18px;
    }

    .progress-text,
    .bottom-instructions {
      font-size: 10px;
    }
  }

  /* Very small screens */
  @media (max-width: 360px) {
    .crosshair {
      width: 1.5rem;
      height: 1.5rem;
    }

    .crosshair-line.horizontal {
      width: 1.5rem;
    }

    .crosshair-line.vertical {
      height: 1.5rem;
    }

    .crosshair-center {
      width: 6px;
      height: 6px;
    }

    .button-container {
      bottom: 3rem;
    }

    .add-point-btn {
      padding: 10px 16px;
      min-width: 55px;
    }
  }

  /* Landscape mobile optimization */
  @media (max-height: 500px) and (orientation: landscape) {
    .button-container {
      bottom: 2rem;
    }

    .bottom-instructions {
      bottom: 0.5rem;
    }

    .area-display,
    .progress-indicator {
      top: 0.5rem;
    }
  }

  /* Handle safe areas for modern mobile devices */
  @supports (padding: max(0px)) {
    .button-container {
      bottom: max(5rem, env(safe-area-inset-bottom) + 3rem);
    }

    .bottom-instructions {
      bottom: max(1rem, env(safe-area-inset-bottom) + 0.5rem);
    }
  }
</style>
