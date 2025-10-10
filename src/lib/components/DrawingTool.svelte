<script>
  import { onMount, onDestroy } from "svelte"
  import { Plus, Undo } from "lucide-svelte"
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"

  export let map

  let sourceId = null
  let layerIds = {
    fill: null,
    line: null,
    points: null,
  }

  const colorOptions = [
    { name: "Blue", value: "#0ea5e9" },
    { name: "Green", value: "#22c55e" },
    { name: "Red", value: "#ef4444" },
    { name: "Yellow", value: "#eab308" },
    { name: "Purple", value: "#a855f7" },
    { name: "Orange", value: "#f97316" },
  ]

  // Reactive values from store
  $: isActive = $markerDrawingStore.isActive
  $: mode = $markerDrawingStore.mode
  $: points = $markerDrawingStore.points
  $: selectedColor = $markerDrawingStore.color
  $: canUndo = points.length > 0

  // Initialize/cleanup layers when active state changes
  $: if (isActive && map) {
    initializeLayers()
  }

  // Update display when points or color change
  $: if (isActive && map && (points || selectedColor)) {
    updateDisplay()
    updateLayerColors()
  }

  // Cleanup when deactivated
  $: if (!isActive && sourceId) {
    cleanupLayers()
  }

  function initializeLayers() {
    if (!map || !map.isStyleLoaded()) return

    // Generate unique IDs
    sourceId = `drawing-tool-${Date.now()}`
    layerIds = {
      fill: `${sourceId}-fill`,
      line: `${sourceId}-line`,
      points: `${sourceId}-points`,
    }

    try {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        })
      }

      // Fill layer (for areas only)
      if (mode === "area" && !map.getLayer(layerIds.fill)) {
        map.addLayer({
          id: layerIds.fill,
          type: "fill",
          source: sourceId,
          filter: ["==", "$type", "Polygon"],
          paint: {
            "fill-color": selectedColor,
            "fill-opacity": 0.3,
          },
        })
      }

      // Line layer
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
            "line-color": selectedColor,
            "line-width": 3,
            "line-dasharray": [2, 2],
          },
        })
      }

      // Points layer
      if (!map.getLayer(layerIds.points)) {
        map.addLayer({
          id: layerIds.points,
          type: "circle",
          source: sourceId,
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 6,
            "circle-color": "#fff",
            "circle-stroke-color": selectedColor,
            "circle-stroke-width": 2,
          },
        })
      }
    } catch (error) {
      console.error("Error initializing drawing layers:", error)
    }
  }

  function updateLayerColors() {
    if (!map || !sourceId) return

    try {
      if (map.getLayer(layerIds.fill)) {
        map.setPaintProperty(layerIds.fill, "fill-color", selectedColor)
      }
      if (map.getLayer(layerIds.line)) {
        map.setPaintProperty(layerIds.line, "line-color", selectedColor)
      }
      if (map.getLayer(layerIds.points)) {
        map.setPaintProperty(
          layerIds.points,
          "circle-stroke-color",
          selectedColor,
        )
      }
    } catch (error) {
      console.warn("Error updating layer colors:", error)
    }
  }

  function addPoint() {
    if (!map) return
    const center = map.getCenter()
    markerDrawingStore.addPoint([center.lng, center.lat])
  }

  function undoLastPoint() {
    markerDrawingStore.undoPoint()
  }

  function changeColor(color) {
    markerDrawingStore.setColor(color)
  }

  function updateDisplay() {
    if (!map || !map.getSource(sourceId)) return

    try {
      const features = []

      // Add points
      points.forEach((point, index) => {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: point },
          properties: { index },
        })
      })

      if (mode === "area" && points.length >= 3) {
        // Show polygon
        const closedPoints = [...points, points[0]]
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [closedPoints] },
          properties: {},
        })
      } else if (points.length >= 2) {
        // Show line
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: points },
          properties: {},
        })
      }

      map.getSource(sourceId).setData({
        type: "FeatureCollection",
        features,
      })
    } catch (error) {
      console.error("Error updating display:", error)
    }
  }

  function cleanupLayers() {
    if (!map || !sourceId) return

    try {
      Object.values(layerIds).forEach((layerId) => {
        if (layerId && map.getLayer && map.getLayer(layerId)) {
          map.removeLayer(layerId)
        }
      })

      if (map.getSource && map.getSource(sourceId)) {
        map.removeSource(sourceId)
      }

      sourceId = null
      layerIds = { fill: null, line: null, points: null }
    } catch (error) {
      console.warn("Error cleaning up layers:", error)
    }
  }

  onDestroy(() => {
    cleanupLayers()
  })
</script>

{#if isActive}
  <!-- Crosshair Overlay -->
  <div class="crosshair-overlay">
    <div class="crosshair">
      <div class="crosshair-line horizontal"></div>
      <div class="crosshair-line vertical"></div>
      <div class="crosshair-center"></div>
    </div>
  </div>

  <!-- Color Picker (Top) -->
  <div class="color-picker-overlay">
    <div class="color-picker">
      {#each colorOptions as color}
        <button
          class="color-btn"
          class:selected={selectedColor === color.value}
          style="background-color: {color.value}"
          on:click={() => changeColor(color.value)}
          title={color.name}
        ></button>
      {/each}
    </div>
  </div>

  <!-- Control Buttons (Bottom Center) -->
  <div class="button-container">
    <div class="button-group">
      <button
        class="undo-btn"
        class:disabled={!canUndo}
        on:click={undoLastPoint}
        disabled={!canUndo}
      >
        <Undo size={20} />
      </button>

      <button class="add-point-btn" on:click={addPoint}>
        <Plus size={24} />
        <span class="btn-label">Add Point</span>
      </button>
    </div>
  </div>
{/if}

<style>
  /* Crosshair */
  .crosshair-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1001;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .crosshair {
    position: relative;
    width: 2rem;
    height: 2rem;
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

  /* Color Picker */
  .color-picker-overlay {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
  }

  .color-picker {
    display: flex;
    gap: 8px;
    background: rgba(0, 0, 0, 0.85);
    padding: 8px 12px;
    border-radius: 16px;
    backdrop-filter: blur(8px);
  }

  .color-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .color-btn:hover {
    transform: scale(1.1);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .color-btn.selected {
    border-color: white;
    box-shadow:
      0 0 0 2px rgba(0, 0, 0, 0.9),
      0 0 0 4px white;
    transform: scale(1.15);
  }

  /* Control Buttons */
  .button-container {
    position: fixed;
    bottom: 6rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
  }

  .button-group {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .add-point-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: #a855f7;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 16px 24px;
    box-shadow: 0 6px 20px rgba(168, 85, 247, 0.4);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-point-btn:hover {
    background: #9333ea;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(168, 85, 247, 0.5);
  }

  .add-point-btn:active {
    transform: scale(0.95);
  }

  .btn-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
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

  /* Mobile */
  @media (max-width: 768px) {
    .button-container {
      bottom: 5rem;
    }

    .add-point-btn {
      padding: 14px 20px;
    }

    .undo-btn {
      width: 44px;
      height: 44px;
    }

    .color-btn {
      width: 32px;
      height: 32px;
    }

    .btn-label {
      font-size: 10px;
    }
  }

  @media (max-width: 480px) {
    .color-picker {
      gap: 6px;
      padding: 6px 10px;
    }

    .color-btn {
      width: 28px;
      height: 28px;
    }

    .add-point-btn {
      padding: 12px 18px;
    }

    .undo-btn {
      width: 40px;
      height: 40px;
    }
  }

  /* Handle safe areas */
  @supports (padding: max(0px)) {
    .button-container {
      bottom: max(6rem, env(safe-area-inset-bottom) + 4rem);
    }
  }
</style>
