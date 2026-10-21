<!-- src/lib/components/map/overlays/DrawingTool.svelte -->
<script>
  import { onDestroy } from "svelte"
  import { Plus, Undo } from "lucide-svelte"
  import { markerDrawingStore } from "$lib/stores/markerDrawingStore"

  /** @type {any} */
  export let map

  /** @type {string | null} */
  let sourceId = null
  /** @type {{ fill: string | null, line: string | null, points: string | null }} */
  let layerIds = {
    fill: null,
    line: null,
    points: null,
  }
  // One stale-layer sweep per drawing session (map.getStyle() serialises the
  // whole style, so it must not run on every point that's added).
  let sweptStaleLayers = false

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

  // Keep the draft layers in sync. Everything the drawing needs is passed in
  // as arguments so this re-runs on point/colour/mode changes too — the old
  // version only created the layers when `isActive` flipped, so if the first
  // attempt failed (the style is still busy right after the previous drawing
  // is torn down) the new draft stayed invisible until some other component
  // happened to redraw it.
  $: if (map) {
    if (isActive) {
      ensureLayers(mode, selectedColor)
      updateDisplay(points, mode)
      updateLayerColors(selectedColor)
    } else if (sourceId) {
      cleanupLayers()
    }
  }

  /** @type {any} */
  let listenedMap = null

  // A style (re)load wipes custom sources/layers — rebuild them the moment the
  // style settles, otherwise the in-progress draft silently vanishes.
  $: if (map && map !== listenedMap) {
    listenedMap?.off("styledata", handleStyleData)
    map.on("styledata", handleStyleData)
    listenedMap = map
  }

  onDestroy(() => {
    listenedMap?.off("styledata", handleStyleData)
    listenedMap = null
  })

  function handleStyleData() {
    if (!isActive || !map) return
    if (!sourceId || !map.getLayer(layerIds.line)) {
      ensureLayers(mode, selectedColor)
      updateDisplay(points, mode)
      updateLayerColors(selectedColor)
    }
  }

  /**
   * @param {string} drawMode
   * @param {string} color
   */
  function ensureLayers(drawMode, color) {
    if (!map) return

    if (!sourceId) {
      sourceId = `drawing-tool-${Date.now()}`
      layerIds = {
        fill: `${sourceId}-fill`,
        line: `${sourceId}-line`,
        points: `${sourceId}-points`,
      }
    }

    try {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        })
      }

      // Fill layer (for areas only)
      if (drawMode === "area" && !map.getLayer(layerIds.fill)) {
        map.addLayer({
          id: layerIds.fill,
          type: "fill",
          source: sourceId,
          filter: ["==", "$type", "Polygon"],
          paint: {
            "fill-color": color,
            "fill-opacity": 0.5,
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
            "line-color": color,
            "line-width": 3,
            "line-dasharray": [1, 0],
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
            "circle-stroke-color": color,
            "circle-stroke-width": 2,
          },
        })
      }

      sweepStaleDraftLayers()
    } catch {
      // Style is still loading — handleStyleData() retries on the next
      // `styledata` event.
    }
  }

  // Removes draft layers left behind by a session whose teardown was
  // interrupted, so old geometry can't linger under a fresh draft.
  function sweepStaleDraftLayers() {
    if (!map || sweptStaleLayers) return
    try {
      const style = map.getStyle?.()
      if (!style) return
      const ours = Object.values(layerIds)
      style.layers?.forEach((layer) => {
        if (layer.id.startsWith("drawing-tool-") && !ours.includes(layer.id)) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id)
        }
      })
      Object.keys(style.sources || {}).forEach((id) => {
        if (id.startsWith("drawing-tool-") && id !== sourceId) {
          if (map.getSource(id)) map.removeSource(id)
        }
      })
      sweptStaleLayers = true
    } catch {
      // Style not ready — retry on the next ensure pass.
    }
  }

  /** @param {string} color */
  function updateLayerColors(color) {
    if (!map || !sourceId) return

    try {
      if (map.getLayer(layerIds.fill)) {
        map.setPaintProperty(layerIds.fill, "fill-color", color)
      }
      if (map.getLayer(layerIds.line)) {
        map.setPaintProperty(layerIds.line, "line-color", color)
      }
      if (map.getLayer(layerIds.points)) {
        map.setPaintProperty(layerIds.points, "circle-stroke-color", color)
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

  /**
   * @param {any[]} pts
   * @param {string} drawMode
   */
  function updateDisplay(pts, drawMode) {
    if (!map || !sourceId) return

    /** @type {any} */
    let source = map.getSource(sourceId)
    if (!source) {
      // The layer set went missing (style reload / interrupted teardown):
      // rebuild it, then write the geometry into it.
      ensureLayers(drawMode, selectedColor)
      source = map.getSource(sourceId)
      if (!source) return
    }

    try {
      const features = []

      // Add points
      pts.forEach((point, index) => {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: point },
          properties: { index },
        })
      })

      if (drawMode === "area" && pts.length >= 3) {
        // Show polygon
        const closedPoints = [...pts, pts[0]]
        features.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [closedPoints] },
          properties: {},
        })
      } else if (pts.length >= 2) {
        // Show line
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: pts },
          properties: {},
        })
      }

      source.setData({
        type: "FeatureCollection",
        features,
      })
    } catch (error) {
      console.error("Error updating display:", error)
    }
  }

  function cleanupLayers() {
    if (!map || !sourceId) return

    const ids = layerIds
    const src = sourceId
    // Drop our handles first: if a removal throws (style mid-swap) the next
    // session must not keep pointing at a dead source. Any leftovers are
    // swept by sweepStaleDraftLayers() when the next draft is created.
    sourceId = null
    layerIds = { fill: null, line: null, points: null }
    sweptStaleLayers = false

    try {
      Object.values(ids).forEach((layerId) => {
        if (layerId && map.getLayer && map.getLayer(layerId)) {
          map.removeLayer(layerId)
        }
      })

      if (map.getSource && map.getSource(src)) {
        map.removeSource(src)
      }
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

  <!-- Control Buttons (Bottom Center) -->
  <div class="button-container">
    <div class="drawing-control-stack">
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
  .color-picker {
    display: flex;
    gap: 7px;
    background: rgba(0, 0, 0, 0.85);
    padding: 7px 10px;
    border-radius: 14px;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .color-btn {
    width: 30px;
    height: 30px;
    border-radius: 7px;
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
    bottom: 6.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
  }

  .drawing-control-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
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
      bottom: 6rem;
    }

    .add-point-btn {
      padding: 14px 20px;
    }

    .undo-btn {
      width: 44px;
      height: 44px;
    }

    .color-btn {
      width: 28px;
      height: 28px;
    }

    .btn-label {
      font-size: 10px;
    }
  }

  @media (max-width: 480px) {
    .color-picker {
      gap: 5px;
      padding: 6px 8px;
    }

    .color-btn {
      width: 25px;
      height: 25px;
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
      bottom: max(6.75rem, env(safe-area-inset-bottom) + 4.75rem);
    }
  }
</style>
