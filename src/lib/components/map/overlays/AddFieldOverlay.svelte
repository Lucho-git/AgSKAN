<!-- src/lib/components/map/overlays/AddFieldOverlay.svelte -->
<script>
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import * as turf from "@turf/turf"
  import { Check, LandPlot, Pencil, Plus, Trash2, Undo, X } from "lucide-svelte"

  export let map
  export let farm = null
  export let existingField = null
  export let saving = false

  const dispatch = createEventDispatcher()

  const sourceId = "add-field-draft-source"
  const layerIds = {
    fill: "add-field-draft-fill",
    lineCasing: "add-field-draft-line-casing",
    line: "add-field-draft-line",
    deletedLineCasing: "add-field-draft-deleted-line-casing",
    deletedLine: "add-field-draft-deleted-line",
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
  let deletedPolygons = []
  let editingPolygonIndex = null
  let editingPolygonPersisted = false
  let initializedFieldKey = null
  let savedFieldName = ""
  let originalFieldName = ""
  let originalPolygonSignatures = []
  let selectedReviewIndex = -1

  $: isEditingField = !!existingField
  $: existingProperties = normalizeProperties(existingField?.properties)
  $: farmName = farm?.farmName || existingProperties.FARM_NAME || "Farm"
  $: hasEnoughPoints = points.length >= 3
  $: totalArea = calculateTotalArea(draftPolygons)

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

  function getEffectiveFieldName() {
    return fieldName.trim() || savedFieldName.trim()
  }

  function isFieldNameRequired() {
    return mode === "review" && !getEffectiveFieldName()
  }

  function canSaveField() {
    return (
      mode === "review" &&
      draftPolygons.length > 0 &&
      !!getEffectiveFieldName() &&
      !saving
    )
  }

  function getPolygonSignature(boundary) {
    const normalizedBoundary = normalizeBoundary(boundary)
    if (!normalizedBoundary) return "null"

    return JSON.stringify({
      type: normalizedBoundary.type,
      coordinates: normalizedBoundary.coordinates || [],
    })
  }

  function hasFieldChanges() {
    if (!isEditingField) return true
    if (deletedPolygons.length > 0) return true
    if (getEffectiveFieldName() !== originalFieldName) return true
    if (draftPolygons.length !== originalPolygonSignatures.length) return true

    return draftPolygons.some(
      (polygon, index) =>
        getPolygonSignature(polygon.boundary) !==
        originalPolygonSignatures[index],
    )
  }

  function canFinishWithoutSaving() {
    return mode === "review" && isEditingField && !hasFieldChanges() && !saving
  }

  function canUseReviewAction() {
    return canFinishWithoutSaving() || canSaveField()
  }

  function getReviewActionTitle() {
    if (canFinishWithoutSaving()) return "Finish reviewing field"
    return getEffectiveFieldName() ? "Save field" : "Field name required"
  }

  function getReviewActionLabel() {
    if (canFinishWithoutSaving()) return "Finish"
    if (saving) return isEditingField ? "Updating Field" : "Saving Field"
    return isEditingField ? "Update Field" : "Save Field"
  }

  function canCompletePolygon() {
    return mode === "draw" && points.length >= 3 && !saving
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

  function sameCoordinate(first, second) {
    return first?.[0] === second?.[0] && first?.[1] === second?.[1]
  }

  function getOpenRingCoordinates(boundary) {
    const normalizedBoundary = normalizeBoundary(boundary)
    const ring = normalizedBoundary?.coordinates?.[0] || []
    if (ring.length > 1 && sameCoordinate(ring[0], ring[ring.length - 1])) {
      return ring.slice(0, -1)
    }
    return [...ring]
  }

  function normalizeBoundary(boundary) {
    if (!boundary) return null

    if (typeof boundary === "string") {
      try {
        return normalizeBoundary(JSON.parse(boundary))
      } catch (error) {
        return null
      }
    }

    if (boundary.type === "Feature") {
      return normalizeBoundary(boundary.geometry)
    }

    return boundary
  }

  function normalizeProperties(properties) {
    if (!properties) return {}

    if (typeof properties === "string") {
      try {
        return JSON.parse(properties) || {}
      } catch (error) {
        return {}
      }
    }

    return properties
  }

  function getBoundaryPolygons(boundary) {
    const normalizedBoundary = normalizeBoundary(boundary)
    if (!normalizedBoundary) return []

    if (normalizedBoundary.type === "Polygon") {
      return [normalizedBoundary]
    }

    if (normalizedBoundary.type === "MultiPolygon") {
      return normalizedBoundary.coordinates.map((coordinates) => ({
        type: "Polygon",
        coordinates,
      }))
    }

    return []
  }

  function initializeExistingField() {
    const fieldKey = existingField?.field_id || existingField?.id
    if (!existingField?.boundary || initializedFieldKey === fieldKey) return

    const normalizedBoundary = normalizeBoundary(existingField.boundary)
    const polygons = getBoundaryPolygons(normalizedBoundary)
    const properties = normalizeProperties(existingField.properties)
    const existingFieldName = existingField.name || properties.FIELD_NAME || ""

    const mappedPolygons = polygons.map((boundary) => ({
      boundary,
      area: getPolygonArea(boundary),
      persisted: true,
    }))

    fieldName = existingFieldName
    savedFieldName = existingFieldName
    originalFieldName = existingFieldName.trim()
    originalPolygonSignatures = mappedPolygons.map((polygon) =>
      getPolygonSignature(polygon.boundary),
    )
    fieldNameTouched = false
    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    draftPolygons = mappedPolygons
    deletedPolygons = []
    editingPolygonIndex = null
    editingPolygonPersisted = false
    selectedReviewIndex = -1
    mode = draftPolygons.length > 0 ? "review" : "draw"
    initializedFieldKey = fieldKey

    if (normalizedBoundary?.type === "Polygon" && mappedPolygons.length === 1) {
      const polygon = mappedPolygons[0]
      points = getOpenRingCoordinates(polygon.boundary)
      currentArea = polygon.area || getPolygonArea(polygon.boundary)
      draftPolygons = []
      editingPolygonIndex = 0
      editingPolygonPersisted = true
      mode = "draw"
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
            "fill-color": [
              "case",
              ["==", ["get", "draftRole"], "deletedFill"],
              "#94a3b8",
              ["==", ["get", "selected"], true],
              "#facc15",
              "#0ea5e9",
            ],
            "fill-opacity": [
              "case",
              ["==", ["get", "draftRole"], "deletedFill"],
              0.2,
              ["==", ["get", "selected"], true],
              0.4,
              0.28,
            ],
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
            "line-width": ["case", ["==", ["get", "selected"], true], 10, 8],
            "line-opacity": [
              "case",
              ["==", ["get", "selected"], true],
              0.94,
              0.86,
            ],
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
            "line-color": [
              "case",
              ["==", ["get", "selected"], true],
              "#facc15",
              "#0ea5e9",
            ],
            "line-width": ["case", ["==", ["get", "selected"], true], 7, 5.5],
          },
        })
      }

      if (!map.getLayer(layerIds.deletedLineCasing)) {
        map.addLayer({
          id: layerIds.deletedLineCasing,
          type: "line",
          source: sourceId,
          filter: [
            "all",
            ["==", "$type", "LineString"],
            ["==", "draftRole", "deletedLine"],
          ],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#020617",
            "line-width": 8,
            "line-opacity": 0.42,
          },
        })
      }

      if (!map.getLayer(layerIds.deletedLine)) {
        map.addLayer({
          id: layerIds.deletedLine,
          type: "line",
          source: sourceId,
          filter: [
            "all",
            ["==", "$type", "LineString"],
            ["==", "draftRole", "deletedLine"],
          ],
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#cbd5e1",
            "line-width": 4.5,
            "line-opacity": 0.72,
            "line-dasharray": [1.4, 1.4],
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

  function renderDraft() {
    if (initializeLayers()) {
      updateDisplay()
    }
  }

  function updateDisplay() {
    if (!map || !map.getSource(sourceId)) return

    const features = []

    draftPolygons.forEach((polygon, index) => {
      const coordinates = polygon.boundary.coordinates[0]
      const selected = selectedReviewIndex === index
      features.push({
        type: "Feature",
        geometry: polygon.boundary,
        properties: { draftRole: "completedFill", index, selected },
      })
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { draftRole: "main", index, selected },
      })
    })

    deletedPolygons.forEach((polygon, index) => {
      const coordinates = polygon.boundary.coordinates[0]
      features.push({
        type: "Feature",
        geometry: polygon.boundary,
        properties: { draftRole: "deletedFill", index },
      })
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { draftRole: "deletedLine", index },
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

      currentArea = getPolygonArea(polygonBoundary)
    } else {
      currentArea = { hectares: 0, squareMeters: 0 }
    }

    if (mode === "draw" && points.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [points[0], [center.lng, center.lat]],
        },
        properties: { draftRole: "startPreview" },
      })
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
    if (mode !== "draw" || points.length < 2 || saving) return
    points = points.slice(0, -1)
  }

  function cancel() {
    if (saving) return
    dispatch("cancel")
  }

  function completePolygon() {
    if (!canCompletePolygon()) return
    const boundary = buildPolygonBoundary()
    const polygon = {
      boundary,
      area: getPolygonArea(boundary),
      persisted: editingPolygonPersisted,
    }

    if (editingPolygonIndex !== null) {
      const nextPolygons = [...draftPolygons]
      const insertIndex = Math.min(editingPolygonIndex, nextPolygons.length)
      nextPolygons.splice(insertIndex, 0, polygon)
      draftPolygons = nextPolygons
      selectedReviewIndex = insertIndex
    } else {
      draftPolygons = [...draftPolygons, polygon]
      selectedReviewIndex = draftPolygons.length - 1
    }

    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    editingPolygonIndex = null
    editingPolygonPersisted = false
    mode = "review"
  }

  function addAnotherPolygon() {
    if (saving) return
    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    editingPolygonIndex = null
    editingPolygonPersisted = false
    selectedReviewIndex = -1
    mode = "draw"
  }

  function focusPolygon(indexToFocus) {
    const polygon = draftPolygons[indexToFocus]
    if (!polygon?.boundary) return

    selectedReviewIndex = indexToFocus
    renderDraft()

    if (!map?.fitBounds) return

    try {
      const [minLng, minLat, maxLng, maxLat] = turf.bbox(polygon.boundary)
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: { top: 80, right: 60, bottom: 260, left: 60 },
          maxZoom: 17,
          duration: 650,
        },
      )
    } catch (error) {
      console.warn("Error focusing field area:", error)
    }
  }

  function editPolygon(indexToEdit) {
    if (saving) return
    const polygon = draftPolygons[indexToEdit]
    if (!polygon?.boundary) return

    points = getOpenRingCoordinates(polygon.boundary)
    currentArea = polygon.area || getPolygonArea(polygon.boundary)
    draftPolygons = draftPolygons.filter((_, index) => index !== indexToEdit)
    editingPolygonIndex = indexToEdit
    editingPolygonPersisted = !!polygon.persisted
    selectedReviewIndex = -1
    mode = "draw"
  }

  function removePolygon(indexToRemove) {
    if (saving) return
    const polygonToRemove = draftPolygons[indexToRemove]
    draftPolygons = draftPolygons.filter((_, index) => index !== indexToRemove)
    if (polygonToRemove?.persisted) {
      deletedPolygons = [...deletedPolygons, polygonToRemove]
    }

    if (selectedReviewIndex === indexToRemove) {
      selectedReviewIndex = -1
    } else if (selectedReviewIndex > indexToRemove) {
      selectedReviewIndex -= 1
    }

    if (draftPolygons.length === 0) {
      mode = "draw"
      fieldNameTouched = false
    }
  }

  function saveField() {
    fieldNameTouched = true
    if (!canSaveField()) return

    const effectiveFieldName = getEffectiveFieldName()

    const individualAreas = draftPolygons.map(
      (polygon) => polygon.area.hectares,
    )
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
      fieldId: existingField?.field_id,
      farmId: farm?.farmId,
      farmName,
      fieldName: effectiveFieldName,
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

  function handleReviewAction() {
    if (canFinishWithoutSaving()) {
      cancel()
      return
    }

    saveField()
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
    renderDraft()
  }

  function handleMapMove() {
    if (mode === "draw" && points.length > 0) {
      renderDraft()
    }
  }

  onMount(() => {
    if (!map) return

    if (map.isStyleLoaded()) {
      renderDraft()
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

  $: if (existingField) {
    initializeExistingField()
  }

  $: if (map && (points || draftPolygons || deletedPolygons || mode)) {
    renderDraft()
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
  <button
    class="close-badge"
    on:click={cancel}
    title="Cancel"
    disabled={saving}
  >
    <X size={18} />
  </button>

  <div class="field-draft-header">
    <div class="field-draft-title-group">
      <div class="field-draft-icon">
        <LandPlot size={22} />
      </div>
      <div class="field-draft-title-text">
        <span class="field-draft-title">
          {mode === "draw"
            ? editingPolygonIndex !== null
              ? "Edit Boundary"
              : isEditingField
                ? "Draw Boundary"
                : "Draw Field"
            : isEditingField
              ? "Review Field"
              : "Name Field"}
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
        <span>
          {editingPolygonIndex !== null
            ? `Editing area ${editingPolygonIndex + 1}`
            : `${draftPolygons.length} part${draftPolygons.length === 1 ? "" : "s"}`}
        </span>
        <strong>{formatArea(totalArea.hectares)}</strong>
      </div>
    {/if}

    <div class="point-actions">
      <button
        class="remove-point-btn"
        class:disabled={mode !== "draw" || points.length < 2 || saving}
        on:click={undoPoint}
        disabled={mode !== "draw" || points.length < 2 || saving}
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
      class:disabled={!canCompletePolygon()}
      on:click={completePolygon}
      disabled={!canCompletePolygon()}
      title={editingPolygonIndex !== null
        ? "Review field areas"
        : "Complete paddock outline"}
    >
      <Check size={18} />
      <span>{editingPolygonIndex !== null ? "Review" : "Next"}</span>
    </button>
  {:else}
    <div class="field-name-row">
      <input
        class="field-name-input"
        class:invalid={isFieldNameRequired()}
        bind:value={fieldName}
        on:blur={() => (fieldNameTouched = true)}
        placeholder="Field name"
        maxlength="40"
        disabled={saving}
      />
      {#if isFieldNameRequired()}
        <span class="field-name-required">Required</span>
      {/if}
    </div>

    <div class="field-parts-list">
      {#each draftPolygons as polygon, index}
        <div
          class:selected-area={selectedReviewIndex === index}
          class="field-part-row"
        >
          <button
            type="button"
            class="field-part-focus"
            on:click={() => focusPolygon(index)}
            disabled={saving}
            title={`Show area ${index + 1}`}
          >
            <div class="field-part-marker">{index + 1}</div>
            <div class="field-part-copy">
              <span>Area {index + 1}</span>
              <strong>{formatArea(polygon.area.hectares)}</strong>
            </div>
          </button>
          <button
            class="edit-area-btn"
            on:click={() => editPolygon(index)}
            disabled={saving}
            title="Edit area"
          >
            <Pencil size={15} />
          </button>
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
        class:disabled={!canUseReviewAction()}
        on:click={handleReviewAction}
        disabled={!canUseReviewAction()}
        title={getReviewActionTitle()}
      >
        <Check size={18} />
        <span>{getReviewActionLabel()}</span>
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
    grid-template-columns: minmax(0, 1fr) 36px 36px;
    gap: 10px;
    align-items: center;
    min-height: 46px;
    padding: 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .field-part-row.selected-area {
    background: rgba(250, 204, 21, 0.12);
    border-color: rgba(250, 204, 21, 0.64);
    box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.18);
  }

  .field-part-focus {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-width: 0;
    min-height: 34px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .field-part-focus:disabled {
    cursor: not-allowed;
    opacity: 0.62;
  }

  .field-part-focus:focus-visible {
    outline: 2px solid rgba(125, 211, 252, 0.86);
    outline-offset: 3px;
    border-radius: 8px;
  }

  .field-part-row:hover .field-part-focus:not(:disabled) .field-part-marker {
    background: rgba(14, 165, 233, 0.28);
  }

  .field-part-row.selected-area .field-part-marker {
    background: rgba(250, 204, 21, 0.22);
    color: #fde68a;
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
  .edit-area-btn,
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
  .edit-area-btn:hover:not(:disabled),
  .remove-area-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .edit-area-btn,
  .remove-area-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.82);
  }

  .remove-point-btn {
    background: rgba(220, 38, 38, 0.9);
    border: 1px solid rgba(252, 165, 165, 0.5);
    color: white;
    box-shadow: 0 8px 22px rgba(220, 38, 38, 0.22);
  }

  .remove-area-btn {
    min-height: 34px;
    height: 34px;
    width: 34px;
    border-radius: 8px;
  }

  .edit-area-btn {
    min-height: 34px;
    height: 34px;
    width: 34px;
    border-radius: 8px;
    color: #7dd3fc;
  }

  .edit-area-btn:hover:not(:disabled),
  .remove-area-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
  }

  .remove-point-btn:hover:not(.disabled) {
    background: #b91c1c;
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
  .edit-area-btn:disabled,
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
