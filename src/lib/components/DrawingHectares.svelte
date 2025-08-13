<script>
  import { onMount, onDestroy } from "svelte"
  import { drawingModeEnabled } from "$lib/stores/controlStore"
  import * as turf from "@turf/turf"
  import { Ruler, Plus, X } from "lucide-svelte"
  // ✅ Import MapboxDraw synchronously, just like the working version
  import MapboxDraw from "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.js"

  export let map
  let area = { hectares: 0, squareMeters: 0 }
  let currentPoints = []
  let sourceId = "drawing-hectares-source"
  let layerIds = {
    line: "drawing-hectares-line",
    fill: "drawing-hectares-fill",
    points: "drawing-hectares-points",
  }

  // ✅ Remove async, make it synchronous like the working version
  let eventInterceptor = null

  function formatArea(areaInSquareMeters) {
    return {
      squareMeters: Math.round(areaInSquareMeters),
      hectares: Math.round((areaInSquareMeters / 10000) * 100) / 100,
    }
  }

  function initializeMapLayers() {
    if (!map) return

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
  }

  // ✅ Make synchronous like the working version
  function initializeEventInterceptor() {
    if (!map || eventInterceptor) return

    try {
      eventInterceptor = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: "simple_select", // Non-drawing mode
        clickBuffer: 6,
        touchBuffer: 6,
        touchEnabled: true,
        boxSelect: false,
        translateEnabled: false,
        rotateEnabled: false,
      })

      // ✅ This is the key - add it to the map to intercept events
      map.addControl(eventInterceptor)
      console.log("✅ Event interceptor (MapboxDraw) added")
    } catch (error) {
      console.warn("Could not initialize event interceptor:", error)
    }
  }

  function updateMapDisplay() {
    if (!map || !map.getSource(sourceId)) return

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
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: currentPoints,
        },
        properties: {},
      })
    } else if (currentPoints.length >= 3) {
      const polygonCoords = [...currentPoints, currentPoints[0]]
      features.push({
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [polygonCoords],
        },
        properties: {},
      })

      try {
        const polygon = turf.polygon([polygonCoords])
        area = formatArea(turf.area(polygon))
      } catch (error) {
        console.error("Error calculating area:", error)
        area = { hectares: 0, squareMeters: 0 }
      }
    }

    map.getSource(sourceId).setData({
      type: "FeatureCollection",
      features: features,
    })
  }

  function addPoint() {
    if (!map || !$drawingModeEnabled) return

    const center = map.getCenter()
    const point = [center.lng, center.lat]

    currentPoints.push(point)
    console.log("Added point:", point, "Total points:", currentPoints.length)

    updateMapDisplay()
  }

  function cancelDrawing() {
    console.log("Cancelled drawing")
    resetDrawing()
    $drawingModeEnabled = false
  }

  function resetDrawing() {
    currentPoints = []
    area = { hectares: 0, squareMeters: 0 }
    updateMapDisplay()
  }

  function cleanupLayers() {
    if (!map) return

    Object.values(layerIds).forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId)
      }
    })

    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }
  }

  function cleanupEventInterceptor() {
    if (eventInterceptor && map) {
      try {
        map.removeControl(eventInterceptor)
        eventInterceptor = null
        console.log("✅ Event interceptor removed")
      } catch (error) {
        console.warn("Error removing event interceptor:", error)
      }
    }
  }

  onMount(() => {
    if (map) {
      // ✅ Initialize event interceptor FIRST, synchronously
      initializeEventInterceptor()
      // Then initialize layers
      initializeMapLayers()
    }
  })

  onDestroy(() => {
    cleanupLayers()
    cleanupEventInterceptor()
  })

  $: if (map && $drawingModeEnabled !== undefined) {
    if ($drawingModeEnabled) {
      resetDrawing()
      initializeMapLayers()
      console.log("Drawing mode enabled")
    } else {
      resetDrawing()
      console.log("Drawing mode disabled")
    }
  }
</script>

<!-- Rest of your template remains the same -->
{#if $drawingModeEnabled}
  <!-- Crosshair overlay -->
  <div
    class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
  >
    <div class="crosshair">
      <!-- Horizontal line -->
      <div class="absolute h-0.5 w-8 bg-white shadow-lg"></div>
      <!-- Vertical line -->
      <div class="absolute h-8 w-0.5 bg-white shadow-lg"></div>
      <!-- Center dot -->
      <div class="absolute h-2 w-2 rounded-full bg-white shadow-lg"></div>
    </div>
  </div>

  <!-- Info panel -->
  <div class="absolute left-1/2 top-3 z-10 -translate-x-1/2 transform">
    <div
      class="relative min-w-[200px] rounded-lg border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm"
    >
      <button
        class="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50"
        on:click={cancelDrawing}
      >
        <X class="h-3 w-3" />
      </button>

      <div class="flex flex-col items-center gap-3">
        <div
          class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-gray-600"
        >
          <Ruler class="h-4 w-4" />
          <span>Area Measurement</span>
        </div>

        {#if currentPoints.length === 0}
          <div class="text-center">
            <div class="mb-2 text-sm text-gray-600">
              Position crosshair and tap + to start
            </div>
            <div class="text-xs text-gray-500">
              Need at least 3 points to create an area
            </div>
          </div>
        {:else if currentPoints.length < 3}
          <div class="text-center">
            <div class="text-sm text-gray-600">
              Point {currentPoints.length} placed
            </div>
            <div class="text-xs text-gray-500">
              {3 - currentPoints.length} more point{3 - currentPoints.length !==
              1
                ? "s"
                : ""} needed
            </div>
          </div>
        {:else}
          <div class="flex flex-col items-center">
            <div
              class="flex items-baseline gap-1 text-2xl font-bold text-gray-800"
            >
              {area.hectares}
              <span class="text-xs font-normal">ha</span>
            </div>
            <div class="mb-2 text-xs text-gray-500">
              {area.squareMeters.toLocaleString()} m²
            </div>
            <div class="text-xs text-gray-600">
              {currentPoints.length} points placed
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Control buttons -->
  <div class="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 transform">
    <div class="relative flex items-center justify-center">
      <!-- Add Point Button (always centered) -->
      <button
        class="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition-all duration-150 hover:bg-blue-600 active:scale-95"
        on:click={addPoint}
      >
        <Plus class="h-6 w-6" />
      </button>

      <!-- Close Button (appears to the right, doesn't affect + button position) -->
      {#if currentPoints.length > 0}
        <button
          class="absolute left-full ml-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-all duration-150 hover:bg-red-600 active:scale-95"
          on:click={cancelDrawing}
        >
          <X class="h-5 w-5" />
        </button>
      {/if}
    </div>
  </div>

  <!-- Instructions -->
  <div class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 transform">
    <div class="rounded-lg bg-black/75 px-3 py-2 text-xs text-white">
      {#if currentPoints.length === 0}
        Move map to position crosshair, then tap + to place points
      {:else if currentPoints.length < 3}
        Continue placing points to form a shape
      {:else}
        Keep adding points or tap × to close drawing mode
      {/if}
    </div>
  </div>
{/if}

<style>
  .crosshair {
    position: relative;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crosshair > div {
    position: absolute;
  }

  .crosshair > div:nth-child(1) {
    /* Horizontal line */
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .crosshair > div:nth-child(2) {
    /* Vertical line */
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .crosshair > div:nth-child(3) {
    /* Center dot */
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }
</style>
