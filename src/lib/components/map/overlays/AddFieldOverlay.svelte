<!-- src/lib/components/map/overlays/AddFieldOverlay.svelte -->
<script>
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import * as turf from "@turf/turf"
  import { Check, LandPlot, Plus, Trash2, Undo, X } from "lucide-svelte"

  export let map
  export let farm = null
  export let saving = false

  const dispatch = createEventDispatcher()

  const sourceId = "add-field-draft-source"
  const layerIds = {
    fill: "add-field-draft-fill",
    lineCasing: "add-field-draft-line-casing",
    line: "add-field-draft-line",
    latestPreview: "add-field-draft-latest-preview",
    startPreview: "add-field-draft-start-preview",
    points: "add-field-draft-points",
  }

  let mode = "draw"
  let fieldName = ""
  let fieldNameTouched = false
  let points = []
  let currentArea = { hectares: 0, squareMeters: 0 }
  let draftPolygons = []

  $: farmName = farm?.farmName || "Farm"
  $: canUndo = points.length > 0
  $: hasEnoughPoints = points.length >= 3
  $: hasFieldName = fieldName.trim().length > 0
  $: totalArea = calculateTotalArea(draftPolygons)
  $: canCompletePolygon = mode === "draw" && hasEnoughPoints && !saving
  $: showNameRequired = fieldNameTouched && !hasFieldName
  $: canSave = mode === "review" && draftPolygons.length > 0 && hasFieldName && !saving

  function calculateTotalArea(polygons) {
    const squareMeters = polygons.reduce(
      (total, polygon) => total + (polygon.area?.squareMeters || 0),
      0,
    )

    return {
      squareMeters,
      hectares: Math.round((squareMeters / 10000) * 100) / 100,
    }
  }

  function formatArea(hectares) {
    return `${Math.round((hectares || 0) * 100) / 100} ha`
  }

  function getPolygonArea(polygonBoundary) {
    try {
      const squareMeters = turf.area(polygonBoundary)
      return {
        squareMeters: Math.round(squareMeters),
        hectares: Math.round((squareMeters / 10000) * 100) / 100,
      }
    } catch (error) {
      return { hectares: 0, squareMeters: 0 }
    }
  }

  function buildPolygonBoundary() {
    return {
      type: "Polygon",
      coordinates: [[...points, points[0]]],
    }
  }

  function initializeLayers() {
    if (!map || !map.isStyleLoaded()) return false

    try {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        })
      }

      if (!map.getLayer(layerIds.fill)) {
        map.addLayer({
          id: layerIds.fill,
          type: "fill",
          source: sourceId,
          filter: ["==", "$type", "Polygon"],
          paint: {
            "fill-color": "#0ea5e9",
            "fill-opacity": 0.28,
          },
        })
      }

      if (!map.getLayer(layerIds.lineCasing)) {
        map.addLayer({
          id: layerIds.lineCasing,
          type: "line",
          source: sourceId,
          filter: [
            "all",
            ["==", "$type", "LineString"],
            ["==", "draftRole", "main"],
          ],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 8,
            "line-opacity": 0.86,
          },
        })
      }

      if (!map.getLayer(layerIds.line)) {
        map.addLayer({
          id: layerIds.line,
          type: "line",
          source: sourceId,
          filter: [
            "all",
            ["==", "$type", "LineString"],
            ["==", "draftRole", "main"],
          ],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#0ea5e9",
            "line-width": 5.5,
          },
        })
      }

      if (!map.getLayer(layerIds.latestPreview)) {
        map.addLayer({
          id: layerIds.latestPreview,
          type: "line",
          source: sourceId,
          filter: [
            "all",
            ["==", "$type", "LineString"],
            ["==", "draftRole", "latestPreview"],
          ],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#f8fafc",
            "line-width": 4.8,
            "line-opacity": 0.62,
          },
        })
      }

      if (!map.getLayer(layerIds.startPreview)) {
        map.addLayer({
          id: layerIds.startPreview,
          type: "line",
          source: sourceId,
          filter: [
            "all",
            ["==", "$type", "LineString"],
            ["==", "draftRole", "startPreview"],
          ],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": 4.2,
            "line-opacity": 0.56,
            "line-dasharray": [2, 2],
          },
        })
      }

      if (!map.getLayer(layerIds.points)) {
        map.addLayer({
          id: layerIds.points,
          type: "circle",
          source: sourceId,
          filter: ["==", "$type", "Point"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#0ea5e9",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2.2,
          },
        })
      }

      return true
    } catch (error) {
      console.error("Error initializing add field overlay layers:", error)
      return false
    }
  }

  function updateDisplay() {
    if (!map || !map.getSource(sourceId)) return

    const features = []

    draftPolygons.forEach((polygon, index) => {
      const coordinates = polygon.boundary.coordinates[0]
      features.push({
        type: "Feature",
        geometry: polygon.boundary,
        properties: { draftRole: "completedFill", index },
      })
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { draftRole: "main", index },
      })
    })

    points.forEach((point, index) => {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: point },
        properties: { index },
      })
    })

    const center = map.getCenter()

    if (points.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: points,
        },
        properties: { draftRole: "main" },
      })
    }

    if (mode === "draw" && points.length >= 1) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [points[points.length - 1], [center.lng, center.lat]],
        },
        properties: { draftRole: "latestPreview" },
      })
    }

    if (points.length >= 3) {
      const polygonBoundary = buildPolygonBoundary()
      features.push({
        type: "Feature",
        geometry: polygonBoundary,
        properties: { draftRole: "fill" },
      })

      if (mode === "draw") {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [points[0], [center.lng, center.lat]],
          },
          properties: { draftRole: "startPreview" },
        })
      }

      currentArea = getPolygonArea(polygonBoundary)
    } else {
      currentArea = { hectares: 0, squareMeters: 0 }
    }

    try {
      map.getSource(sourceId).setData({
        type: "FeatureCollection",
        features,
      })
    } catch (error) {
      console.error("Error updating add field overlay:", error)
    }
  }

  function addPoint() {
    if (!map || saving || mode !== "draw") return
    const center = map.getCenter()
    points = [...points, [center.lng, center.lat]]
  }

  function undoPoint() {
    if (!canUndo || saving || mode !== "draw") return
    points = points.slice(0, -1)
  }

  function cancel() {
    if (saving) return
    dispatch("cancel")
  }

  function completePolygon() {
    if (!canCompletePolygon) return
    const boundary = buildPolygonBoundary()
    draftPolygons = [
      ...draftPolygons,
      {
        boundary,
        area: getPolygonArea(boundary),
      },
    ]
    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    mode = "review"
  }

  function addAnotherPolygon() {
    if (saving) return
    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    mode = "draw"
  }

  function removePolygon(indexToRemove) {
    if (saving) return
    draftPolygons = draftPolygons.filter((_, index) => index !== indexToRemove)
    if (draftPolygons.length === 0) {
      mode = "draw"
      fieldNameTouched = false
    }
  }

  function saveField() {
    fieldNameTouched = true
    if (!canSave) return

    const individualAreas = draftPolygons.map((polygon) => polygon.area.hectares)
    const boundary =
      draftPolygons.length === 1
        ? draftPolygons[0].boundary
        : {
            type: "MultiPolygon",
            coordinates: draftPolygons.map(
              (polygon) => polygon.boundary.coordinates,
            ),
          }

    dispatch("complete", {
      farmId: farm?.farmId,
      farmName,
      fieldName: fieldName.trim(),
      boundary,
      area: totalArea,
      polygonAreas:
        draftPolygons.length > 1
          ? {
              individual_areas: individualAreas,
              total_area: totalArea.hectares,
            }
          : null,
      partCount: draftPolygons.length,
    })
  }

  function cleanupLayers() {
    if (!map || !map.getLayer || !map.getSource) return

    try {
      Object.values(layerIds).forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId)
        }
      })

      if (map.getSource(sourceId)) {
        map.removeSource(sourceId)
      }
    } catch (error) {
      console.warn("Error cleaning up add field overlay layers:", error)
    }
  }

  function handleStyleData() {
    if (initializeLayers()) {
      updateDisplay()
    }
  }

  function handleMapMove() {
    if (mode === "draw" && points.length > 0) {
      updateDisplay()
    }
  }

  onMount(() => {
    if (!map) return

    if (map.isStyleLoaded()) {
      initializeLayers()
    } else {
      map.on("styledata", handleStyleData)
    }

    map.on("move", handleMapMove)
  })

  onDestroy(() => {
    if (map?.off) {
      map.off("styledata", handleStyleData)
      map.off("move", handleMapMove)
    }
    cleanupLayers()
  })

  $: if (map && (points || draftPolygons || mode)) {
    initializeLayers()
    updateDisplay()
  }
</script>

{#if mode === "draw"}
  <div class="crosshair-overlay">
    <div class="crosshair">
      <div class="crosshair-line horizontal"></div>
      <div class="crosshair-line vertical"></div>
      <div class="crosshair-center"></div>
    </div>
  </div>
{/if}

<div class="field-draft-panel">
  <button class="close-badge" on:click={cancel} title="Cancel" disabled={saving}>
    <X size={18} />
  </button>

  <div class="field-draft-header">
    <div class="field-draft-title-group">
      <div class="field-draft-icon">
        <LandPlot size={22} />
      </div>
      <div class="field-draft-title-text">
        <span class="field-draft-title">
          {mode === "draw" ? "Draw Field" : "Name Field"}
        </span>
        <span class="field-draft-farm">{farmName}</span>
      </div>
    </div>

    <div class="field-draft-stats">
      {#if mode === "draw" && hasEnoughPoints}
        <span class="area-value">{formatArea(currentArea.hectares)}</span>
      {:else if mode === "review"}
        <span class="area-value">{formatArea(totalArea.hectares)}</span>
      {/if}
    </div>
  </div>

  {#if mode === "draw"}
    {#if draftPolygons.length > 0}
      <div class="field-summary-strip">
        <span>{draftPolygons.length} part{draftPolygons.length === 1 ? "" : "s"}</span>
        <strong>{formatArea(totalArea.hectares)}</strong>
      </div>
    {/if}

    <div class="point-actions">
      <button
        class="remove-point-btn"
        class:disabled={!canUndo || saving}
        on:click={undoPoint}
        disabled={!canUndo || saving}
        title="Remove point"
      >
        <Undo size={18} />
        <span>Remove Point</span>
      </button>
      <button
        class="add-point-btn"
        class:disabled={saving}
        on:click={addPoint}
        disabled={saving}
        title="Add point"
      >
        <Plus size={22} />
        <span>Add Point</span>
      </button>
    </div>

    <button
      class="complete-paddock-btn"
      class:disabled={!canCompletePolygon}
      on:click={completePolygon}
      disabled={!canCompletePolygon}
      title="Complete paddock outline"
    >
      <Check size={18} />
      <span>Next</span>
    </button>
  {:else}
    <div class="field-name-row">
      <input
        class="field-name-input"
        class:invalid={showNameRequired}
        bind:value={fieldName}
        on:blur={() => (fieldNameTouched = true)}
        placeholder="Field name"
        maxlength="40"
        disabled={saving}
      />
      {#if showNameRequired}
        <span class="field-name-required">Required</span>
      {/if}
    </div>

    <div class="field-parts-list">
      {#each draftPolygons as polygon, index}
        <div class="field-part-row">
          <div class="field-part-marker">{index + 1}</div>
          <div class="field-part-copy">
            <span>Area {index + 1}</span>
            <strong>{formatArea(polygon.area.hectares)}</strong>
          </div>
          <button
            class="remove-area-btn"
            on:click={() => removePolygon(index)}
            disabled={saving}
            title="Remove area"
          >
            <Trash2 size={15} />
          </button>
        </div>
      {/each}
    </div>

    <div class="review-actions">
      <button
        class="add-area-btn"
        on:click={addAnotherPolygon}
        disabled={saving}
        title="Add another area"
      >
        <Plus size={18} />
        <span>Add Another Area</span>
      </button>
      <button
        class="save-field-btn"
        class:disabled={!canSave}
        on:click={saveField}
        disabled={!canSave}
        title={hasFieldName ? "Save field" : "Field name required"}
      >
        <Check size={18} />
        <span>{saving ? "Saving Field" : "Save Field"}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .crosshair-overlay {
    position: fixed;
    inset: 0;
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
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
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
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
  }

  .field-draft-panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1002;
    width: 100%;
    background: rgba(8, 12, 18, 0.92);
    border-top: 1px solid rgba(34, 197, 94, 0.34);
    border-radius: 0;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
    color: white;
    padding: 14px 14px max(14px, env(safe-area-inset-bottom));
    backdrop-filter: blur(14px);
    animation: slideUp 0.22s ease-out;
  }

  .close-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(12, 16, 24, 0.96);
    color: rgba(255, 255, 255, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.42);
    transition:
      background 0.15s ease,
      color 0.15s ease,
      transform 0.15s ease;
  }

  .close-badge:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.92);
    color: white;
    transform: translateY(-1px);
  }

  .close-badge:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .field-draft-header {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: center;
    padding-right: 44px;
  }

  .field-draft-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .field-draft-icon {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: rgba(34, 197, 94, 0.18);
    color: #86efac;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .field-draft-title-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .field-draft-title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
  }

  .field-draft-farm {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.62);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-draft-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .area-value,
  .field-summary-strip {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border-radius: 8px;
    padding: 4px 9px;
    font-size: 12px;
    font-weight: 700;
    background: rgba(14, 165, 233, 0.18);
    color: #7dd3fc;
  }

  .field-summary-strip {
    justify-content: space-between;
    width: 100%;
    margin-top: 12px;
    color: rgba(255, 255, 255, 0.82);
  }

  .field-summary-strip strong {
    color: #7dd3fc;
  }

  .field-name-row {
    margin-top: 12px;
    position: relative;
  }

  .field-name-input {
    width: 100%;
    min-height: 42px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    color: white;
    padding: 0 12px;
    font-size: 15px;
    outline: none;
  }

  .field-name-input:focus {
    border-color: rgba(14, 165, 233, 0.68);
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.14);
  }

  .field-name-input.invalid {
    border-color: rgba(248, 113, 113, 0.72);
    box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12);
  }

  .field-name-input:disabled {
    opacity: 0.72;
  }

  .field-name-input::placeholder {
    color: rgba(255, 255, 255, 0.42);
  }

  .field-name-required {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #fecaca;
    font-size: 11px;
    font-weight: 700;
    pointer-events: none;
  }

  .field-parts-list {
    display: grid;
    gap: 8px;
    margin-top: 12px;
    max-height: 184px;
    overflow-y: auto;
  }

  .field-part-row {
    display: grid;
    grid-template-columns: 30px 1fr 36px;
    gap: 10px;
    align-items: center;
    min-height: 46px;
    padding: 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .field-part-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: rgba(14, 165, 233, 0.18);
    color: #7dd3fc;
    font-size: 12px;
    font-weight: 800;
  }

  .field-part-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .field-part-copy span {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.72);
  }

  .field-part-copy strong {
    font-size: 14px;
    color: white;
  }

  .point-actions,
  .review-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: center;
    margin-top: 12px;
  }

  .add-point-btn,
  .remove-point-btn,
  .complete-paddock-btn,
  .add-area-btn,
  .save-field-btn,
  .remove-area-btn {
    border: none;
    border-radius: 10px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease,
      opacity 0.15s ease;
  }

  .add-point-btn:hover:not(.disabled),
  .remove-point-btn:hover:not(.disabled),
  .complete-paddock-btn:hover:not(.disabled),
  .add-area-btn:hover:not(:disabled),
  .save-field-btn:hover:not(.disabled),
  .remove-area-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .remove-point-btn,
  .remove-area-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.82);
  }

  .remove-area-btn {
    min-height: 34px;
    height: 34px;
    width: 34px;
    border-radius: 8px;
  }

  .remove-point-btn:hover:not(.disabled),
  .remove-area-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
  }

  .add-point-btn,
  .add-area-btn {
    background: rgba(14, 165, 233, 0.88);
    color: white;
    box-shadow: 0 8px 22px rgba(14, 165, 233, 0.24);
  }

  .add-point-btn:hover:not(.disabled),
  .add-area-btn:hover:not(:disabled) {
    background: #0284c7;
  }

  .complete-paddock-btn,
  .save-field-btn {
    width: 100%;
    background: rgba(34, 197, 94, 0.92);
    border: 1px solid rgba(134, 239, 172, 0.48);
    color: white;
    box-shadow: 0 8px 22px rgba(34, 197, 94, 0.22);
  }

  .complete-paddock-btn {
    margin-top: 10px;
  }

  .complete-paddock-btn:hover:not(.disabled),
  .save-field-btn:hover:not(.disabled) {
    background: #16a34a;
  }

  .complete-paddock-btn.disabled,
  .save-field-btn.disabled {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.38);
    box-shadow: none;
    cursor: not-allowed;
    transform: none;
  }

  .add-point-btn.disabled,
  .remove-point-btn.disabled,
  .add-area-btn:disabled,
  .remove-area-btn:disabled {
    opacity: 0.34;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 640px) {
    .field-draft-panel {
      padding: 12px;
    }

    .field-draft-header {
      align-items: flex-start;
    }

    .field-draft-icon {
      width: 38px;
      height: 38px;
    }

    .field-draft-stats {
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
    }

    .add-point-btn span,
    .remove-point-btn span,
    .complete-paddock-btn span,
    .add-area-btn span,
    .save-field-btn span {
      font-size: 13px;
    }
  }
</style>
