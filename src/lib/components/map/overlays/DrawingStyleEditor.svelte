<!-- src/lib/components/map/overlays/DrawingStyleEditor.svelte -->
<script>
  import { onMount } from "svelte"
  import { Sliders, Check, X } from "lucide-svelte"
  import * as mapboxgl from "mapbox-gl"

  export let drawing
  export let map
  export let onSave = () => {}
  export let onCancel = () => {}

  // Style state - use exact values from drawing
  let fillOpacity = drawing.style?.fillOpacity ?? 0.5
  let strokeWidth = drawing.style?.strokeWidth ?? 3
  let strokeStyle = drawing.style?.strokeStyle ?? "solid"
  let fillColor = drawing.style?.fillColor ?? "#0ea5e9"
  let strokeColor = drawing.style?.strokeColor ?? "#0ea5e9"

  // Preview layer IDs
  let previewSourceId = `preview-${drawing.id}`
  let previewFillLayerId = `preview-fill-${drawing.id}`
  let previewLineLayerId = `preview-line-${drawing.id}`

  // Fine adjustments for the sliders — dragging a thumb in a cab with gloves
  // is fiddly, so each slider also has − / + buttons.
  /** @param {number} dir */
  function nudgeFill(dir) {
    fillOpacity = Math.min(
      1,
      Math.max(0, Math.round((fillOpacity + dir * 0.05) * 100) / 100),
    )
  }

  /** @param {number} dir */
  function nudgeWidth(dir) {
    strokeWidth = Math.min(16, Math.max(1, strokeWidth + dir))
  }

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
        <label class="section-label" for="fill-opacity-slider">
          Fill Opacity
          <span class="value-display">{Math.round(fillOpacity * 100)}%</span>
        </label>
        <div class="slider-row">
          <button
            type="button"
            class="step-btn"
            on:click={() => nudgeFill(-1)}
            aria-label="Decrease fill opacity"
            >−</button
          >
          <input
            id="fill-opacity-slider"
            type="range"
            min="0"
            max="1"
            step="0.05"
            bind:value={fillOpacity}
            class="slider"
            style="--fill: {Math.round(fillOpacity * 100)}%"
          />
          <button
            type="button"
            class="step-btn"
            on:click={() => nudgeFill(1)}
            aria-label="Increase fill opacity"
            >+</button
          >
        </div>
      </div>
    {/if}

    <!-- Stroke Width -->
    <div class="style-section">
      <label class="section-label" for="stroke-width-slider">
        Line Width
        <span class="value-display">{strokeWidth}px</span>
      </label>
      <div class="slider-row">
        <button
          type="button"
          class="step-btn"
          on:click={() => nudgeWidth(-1)}
          aria-label="Decrease line width">−</button
        >
        <input
          id="stroke-width-slider"
          type="range"
          min="1"
          max="16"
          step="1"
          bind:value={strokeWidth}
          class="slider"
          style="--fill: {((strokeWidth - 1) / 15) * 100}%"
        />
        <button
          type="button"
          class="step-btn"
          on:click={() => nudgeWidth(1)}
          aria-label="Increase line width">+</button
        >
      </div>
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
    padding-bottom: env(safe-area-inset-bottom);
    animation: agskan-slideUp 0.3s ease-out;
  }

  @keyframes agskan-slideUp {
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
    padding: 14px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon {
    width: 40px;
    height: 40px;
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
    font-size: 16px;
    font-weight: 600;
    color: white;
  }

  .header-subtitle {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 14px;
    border-radius: 10px;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 800;
    touch-action: manipulation;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.06s ease;
  }

  .action-btn:active {
    transform: scale(0.98);
  }

  .action-btn.cancel {
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(248, 113, 113, 0.75);
    color: #fecaca;
  }

  .action-btn.cancel:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(252, 165, 165, 0.95);
    color: white;
  }

  .action-btn.save {
    background: #16a34a;
    border: 1px solid #86efac;
    color: white;
  }

  .action-btn.save:hover {
    background: #15803d;
    border-color: #bbf7d0;
  }

  .style-editor-content {
    padding: 14px 20px 16px;
    max-height: 46vh;
    overflow-y: auto;
  }

  .style-section {
    margin-bottom: 14px;
  }

  .style-section:last-child {
    margin-bottom: 0;
  }

  .section-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 8px;
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
    grid-template-columns: repeat(6, 36px);
    justify-content: center;
    gap: 8px;
    width: auto;
  }

  .color-option {
    width: 36px;
    height: 36px;
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

  /* Slider row: − / + buttons either side of the track for precise nudging;
     the range input itself is a 44px touch target with a fat thumb. */
  .slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .step-btn {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: white;
    font-family: inherit;
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.06s ease;
  }

  .step-btn:hover {
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(168, 85, 247, 0.6);
  }

  .step-btn:active {
    transform: scale(0.96);
  }

  .slider {
    -webkit-appearance: none;
    appearance: none;
    flex: 1;
    min-width: 0;
    height: 44px;
    margin: 0;
    background: transparent;
    outline: none;
    cursor: pointer;
    touch-action: pan-y;
  }

  .slider::-webkit-slider-runnable-track {
    height: 12px;
    border-radius: 999px;
    background: linear-gradient(
      to right,
      #a855f7 0 var(--fill, 0%),
      rgba(255, 255, 255, 0.14) var(--fill, 0%) 100%
    );
  }

  .slider::-moz-range-track {
    height: 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
  }

  .slider::-moz-range-progress {
    height: 12px;
    border-radius: 999px;
    background: #a855f7;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 26px;
    height: 26px;
    margin-top: -7px;
    border-radius: 50%;
    background: white;
    border: 3px solid #a855f7;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
    cursor: grab;
  }

  .slider::-moz-range-thumb {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: white;
    border: 3px solid #a855f7;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
    cursor: grab;
  }

  .slider:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.35);
  }

  .style-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .toggle-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
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
    width: 42px;
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
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      padding: 12px 16px;
    }

    .header-icon {
      width: 36px;
      height: 36px;
    }

    .header-title {
      font-size: 16px;
    }

    .header-actions {
      gap: 10px;
    }

    /* Full-width, labelled, thumb-sized actions — no more icon-only pills. */
    .action-btn {
      flex: 1;
      min-height: 52px;
      padding: 0 14px;
      font-size: 15px;
      gap: 8px;
    }

    .style-editor-content {
      padding: 12px 16px 14px;
      max-height: 56vh;
    }

    .style-section {
      margin-bottom: 16px;
    }

    .color-grid {
      grid-template-columns: repeat(6, 40px);
      gap: 8px;
    }

    .color-option {
      width: 40px;
      height: 40px;
    }

    .step-btn {
      width: 48px;
      height: 48px;
      font-size: 22px;
    }

    .section-label {
      font-size: 13px;
    }
  }

  @media (min-width: 769px) and (max-width: 1100px) {
    .style-editor-header {
      padding: 12px 18px;
    }

    .style-editor-content {
      padding: 12px 18px 14px;
      max-height: 44vh;
    }

    .color-grid {
      grid-template-columns: repeat(6, 34px);
    }

    .color-option {
      width: 34px;
      height: 34px;
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
