<script>
  import { onMount } from "svelte"
  import { Sliders, Check, X } from "lucide-svelte"
  import * as mapboxgl from "mapbox-gl"

  export let drawing
  export let map
  export let onSave = () => {}
  export let onCancel = () => {}

  // Style state - use exact values from drawing
  let fillOpacity = drawing.style?.fillOpacity ?? 0.3
  let strokeWidth = drawing.style?.strokeWidth ?? 3
  let strokeStyle = drawing.style?.strokeStyle ?? "dashed"
  let fillColor = drawing.style?.fillColor ?? "#0ea5e9"
  let strokeColor = drawing.style?.strokeColor ?? "#0ea5e9"

  // Preview layer IDs
  let previewSourceId = `preview-${drawing.id}`
  let previewFillLayerId = `preview-fill-${drawing.id}`
  let previewLineLayerId = `preview-line-${drawing.id}`

  // Store original layer visibility states
  let originalLayerStates = {
    fill: null,
    lineSolid: null,
    lineDashed: null,
  }

  onMount(() => {
    // Hide original drawing layers
    hideOriginalDrawingLayers()

    // Zoom to drawing
    zoomToDrawing()

    // Add preview layer
    addPreviewLayer()

    return () => {
      // Restore original layers and cleanup preview
      restoreOriginalDrawingLayers()
      removePreviewLayer()
    }
  })

  function hideOriginalDrawingLayers() {
    if (!map) return

    try {
      // Store original visibility and hide layers
      const layers = [
        { id: "marker-drawings-fill", key: "fill" },
        { id: "marker-drawings-line-solid", key: "lineSolid" },
        { id: "marker-drawings-line-dashed", key: "lineDashed" },
      ]

      layers.forEach(({ id, key }) => {
        if (map.getLayer(id)) {
          originalLayerStates[key] =
            map.getLayoutProperty(id, "visibility") || "visible"
          map.setLayoutProperty(id, "visibility", "none")
        }
      })
    } catch (error) {
      console.error("Error hiding original layers:", error)
    }
  }

  function restoreOriginalDrawingLayers() {
    if (!map) return

    try {
      const layers = [
        { id: "marker-drawings-fill", key: "fill" },
        { id: "marker-drawings-line-solid", key: "lineSolid" },
        { id: "marker-drawings-line-dashed", key: "lineDashed" },
      ]

      layers.forEach(({ id, key }) => {
        if (map.getLayer(id) && originalLayerStates[key]) {
          map.setLayoutProperty(id, "visibility", originalLayerStates[key])
        }
      })
    } catch (error) {
      console.error("Error restoring original layers:", error)
    }
  }

  function zoomToDrawing() {
    if (!map || !drawing.geometry) return

    try {
      const bounds = new mapboxgl.LngLatBounds()

      if (drawing.geometry.type === "Polygon") {
        drawing.geometry.coordinates[0].forEach((coord) => {
          bounds.extend(coord)
        })
      } else if (drawing.geometry.type === "LineString") {
        drawing.geometry.coordinates.forEach((coord) => {
          bounds.extend(coord)
        })
      }

      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 400, left: 50, right: 50 },
        duration: 800,
      })
    } catch (error) {
      console.error("Error zooming to drawing:", error)
    }
  }

  function addPreviewLayer() {
    if (!map) return

    try {
      // Add source
      if (!map.getSource(previewSourceId)) {
        map.addSource(previewSourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: drawing.geometry,
            properties: {},
          },
        })
      }

      // Add fill layer for polygons
      if (
        drawing.drawing_type === "polygon" &&
        !map.getLayer(previewFillLayerId)
      ) {
        map.addLayer({
          id: previewFillLayerId,
          type: "fill",
          source: previewSourceId,
          paint: {
            "fill-color": fillColor,
            "fill-opacity": fillOpacity,
          },
        })
      }

      // Add line layer - with zoom-dependent width
      if (!map.getLayer(previewLineLayerId)) {
        map.addLayer({
          id: previewLineLayerId,
          type: "line",
          source: previewSourceId,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": strokeColor,
            "line-width": [
              "interpolate",
              ["exponential", 2],
              ["zoom"],
              10,
              ["*", strokeWidth, ["^", 2, -6]],
              24,
              ["*", strokeWidth, ["^", 2, 8]],
            ],
            "line-opacity": 1.0,
            "line-dasharray": strokeStyle === "dashed" ? [2, 2] : [1, 0],
          },
        })
      }
    } catch (error) {
      console.error("Error adding preview layer:", error)
    }
  }

  function removePreviewLayer() {
    if (!map) return

    try {
      if (map.getLayer(previewFillLayerId)) {
        map.removeLayer(previewFillLayerId)
      }
      if (map.getLayer(previewLineLayerId)) {
        map.removeLayer(previewLineLayerId)
      }
      if (map.getSource(previewSourceId)) {
        map.removeSource(previewSourceId)
      }
    } catch (error) {
      console.error("Error removing preview layer:", error)
    }
  }

  function updatePreview() {
    if (!map) return

    try {
      // Update fill layer
      if (map.getLayer(previewFillLayerId)) {
        map.setPaintProperty(previewFillLayerId, "fill-color", fillColor)
        map.setPaintProperty(previewFillLayerId, "fill-opacity", fillOpacity)
      }

      // Update line layer - with zoom-dependent width
      if (map.getLayer(previewLineLayerId)) {
        map.setPaintProperty(previewLineLayerId, "line-color", strokeColor)
        map.setPaintProperty(previewLineLayerId, "line-width", [
          "interpolate",
          ["exponential", 2],
          ["zoom"],
          10,
          ["*", strokeWidth, ["^", 2, -6]],
          24,
          ["*", strokeWidth, ["^", 2, 8]],
        ])
        map.setPaintProperty(previewLineLayerId, "line-opacity", 1.0)
        map.setPaintProperty(
          previewLineLayerId,
          "line-dasharray",
          strokeStyle === "dashed" ? [2, 2] : [1, 0],
        )
      }
    } catch (error) {
      console.error("Error updating preview:", error)
    }
  }

  // Update preview whenever style changes
  $: {
    fillOpacity
    strokeWidth
    strokeStyle
    fillColor
    strokeColor
    updatePreview()
  }

  function handleSave() {
    restoreOriginalDrawingLayers()
    removePreviewLayer()
    onSave({
      fillColor,
      strokeColor,
      fillOpacity,
      strokeWidth,
      strokeStyle,
    })
  }

  function handleCancel() {
    restoreOriginalDrawingLayers()
    removePreviewLayer()
    onCancel()
  }

  const colorPresets = [
    { name: "Blue", value: "#0ea5e9" },
    { name: "Green", value: "#10b981" },
    { name: "Red", value: "#ef4444" },
    { name: "Yellow", value: "#f59e0b" },
    { name: "Purple", value: "#a855f7" },
    { name: "Pink", value: "#ec4899" },
  ]
</script>

<!-- Rest of the component HTML remains the same -->
<div class="style-editor-panel">
  <div class="style-editor-header">
    <div class="header-info">
      <div class="header-icon">
        <Sliders size={24} />
      </div>
      <div class="header-text">
        <span class="header-title">Customize Drawing</span>
        <span class="header-subtitle"
          >{drawing.drawing_type === "polygon" ? "Area" : "Line"} Style</span
        >
      </div>
    </div>

    <div class="header-actions">
      <button class="action-btn cancel" on:click={handleCancel}>
        <X size={18} />
        <span class="btn-text">Cancel</span>
      </button>
      <button class="action-btn save" on:click={handleSave}>
        <Check size={18} />
        <span class="btn-text">Save</span>
      </button>
    </div>
  </div>

  <div class="style-editor-content">
    <!-- Color Selection -->
    <div class="style-section">
      <label class="section-label">Color</label>
      <div class="color-grid-container">
        <div class="color-grid">
          {#each colorPresets as preset}
            <button
              class="color-option"
              class:active={fillColor === preset.value}
              style="background-color: {preset.value}"
              on:click={() => {
                fillColor = preset.value
                strokeColor = preset.value
              }}
            >
              {#if fillColor === preset.value}
                <Check size={14} color="white" />
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Opacity Slider (for polygons) -->
    {#if drawing.drawing_type === "polygon"}
      <div class="style-section">
        <label class="section-label">
          Fill Opacity
          <span class="value-display">{Math.round(fillOpacity * 100)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={fillOpacity}
          class="slider"
        />
      </div>
    {/if}

    <!-- Stroke Width -->
    <div class="style-section">
      <label class="section-label">
        Line Width
        <span class="value-display">{strokeWidth}px</span>
      </label>
      <input
        type="range"
        min="1"
        max="16"
        step="1"
        bind:value={strokeWidth}
        class="slider"
      />
    </div>

    <!-- Stroke Style -->
    <div class="style-section">
      <label class="section-label">Line Style</label>
      <div class="style-toggle">
        <button
          class="toggle-option"
          class:active={strokeStyle === "solid"}
          on:click={() => (strokeStyle = "solid")}
        >
          <div class="line-preview solid"></div>
          <span>Solid</span>
        </button>
        <button
          class="toggle-option"
          class:active={strokeStyle === "dashed"}
          on:click={() => (strokeStyle = "dashed")}
        >
          <div class="line-preview dashed"></div>
          <span>Dashed</span>
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .style-editor-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(16px);
    color: white;
    z-index: 1000;
    border-top: 1px solid rgba(168, 85, 247, 0.5);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .style-editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(168, 85, 247, 0.2);
    border-radius: 50%;
    color: #a855f7;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-title {
    font-size: 18px;
    font-weight: 600;
    color: white;
  }

  .header-subtitle {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
  }

  .header-actions {
    display: flex;
    gap: 10px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 14px;
    font-weight: 500;
  }

  .action-btn.cancel {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }

  .action-btn.cancel:hover {
    background: rgba(239, 68, 68, 0.3);
    color: white;
  }

  .action-btn.save {
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }

  .action-btn.save:hover {
    background: rgba(34, 197, 94, 0.3);
    color: white;
  }

  .style-editor-content {
    padding: 20px 24px;
    max-height: 40vh;
    overflow-y: auto;
  }

  .style-section {
    margin-bottom: 20px;
  }

  .style-section:last-child {
    margin-bottom: 0;
  }

  .section-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 10px;
  }

  .value-display {
    color: #a855f7;
    font-weight: 600;
  }

  .color-grid-container {
    display: flex;
    justify-content: center;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    max-width: 320px;
    width: 100%;
  }

  .color-option {
    width: 100%;
    aspect-ratio: 1;
    max-width: 48px;
    max-height: 48px;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .color-option:hover {
    border-color: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }

  .color-option.active {
    border-color: white;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
  }

  .slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.1);
    outline: none;
    -webkit-appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #a855f7;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(168, 85, 247, 0.5);
  }

  .slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #a855f7;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 6px rgba(168, 85, 247, 0.5);
  }

  .style-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .toggle-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }

  .toggle-option:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .toggle-option.active {
    background: rgba(168, 85, 247, 0.2);
    border-color: #a855f7;
    color: white;
  }

  .line-preview {
    width: 50px;
    height: 3px;
    background: currentColor;
  }

  .line-preview.dashed {
    background: repeating-linear-gradient(
      to right,
      currentColor 0,
      currentColor 6px,
      transparent 6px,
      transparent 12px
    );
  }

  @media (max-width: 768px) {
    .style-editor-header {
      padding: 16px 20px;
    }

    .header-icon {
      width: 44px;
      height: 44px;
    }

    .header-title {
      font-size: 16px;
    }

    .btn-text {
      display: none;
    }

    .action-btn {
      padding: 10px;
      width: 44px;
      height: 44px;
      justify-content: center;
    }

    .style-editor-content {
      padding: 16px 20px;
      max-height: 50vh;
    }

    .color-grid {
      max-width: 100%;
    }

    .color-option {
      max-width: none;
      max-height: none;
    }

    .style-section {
      margin-bottom: 16px;
    }
  }

  .style-editor-content::-webkit-scrollbar {
    width: 4px;
  }

  .style-editor-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .style-editor-content::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }
</style>
