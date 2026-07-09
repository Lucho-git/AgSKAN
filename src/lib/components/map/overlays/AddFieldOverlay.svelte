<!-- src/lib/components/map/overlays/AddFieldOverlay.svelte -->
<script>
  // @ts-nocheck
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import * as turf from "@turf/turf"
  import {
    ArrowLeft,
    Check,
    LandPlot,
    Pencil,
    Plus,
    Search,
    Trash2,
    Undo,
    X,
  } from "lucide-svelte"
  import { mapFieldsStore } from "$lib/stores/mapFieldsStore"

  export let map
  export let farm = null
  export let existingField = null
  export let seedField = null
  export let saving = false
  export let hidden = false

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
  let attemptedReviewSave = false
  let points = []
  let currentArea = { hectares: 0, squareMeters: 0 }
  let draftPolygons = []
  let deletedPolygons = []
  let userTouchedDraft = false
  let editingPolygonIndex = null
  let editingPolygonPersisted = false
  let editingInnerRings = []
  /** Snapshot of the polygon we entered Edit Boundary on, used to restore on cancel. */
  let originalEditingPolygon = null
  let initializedFieldKey = null
  let originalFieldName = ""
  let originalPolygonSignatures = []
  let selectedReviewIndex = -1
  let showAreaSourceChoice = false

  $: isEditingField = !!existingField
  $: sourceField = existingField || seedField
  $: existingProperties = normalizeProperties(sourceField?.properties)
  $: farmName = farm?.farmName || existingProperties.FARM_NAME || "Farm"
  // Owning farm id we'll submit with the field.
  $: effectiveFarmId =
    sourceField?.farm_id || existingProperties.farm_id || farm?.farmId || null
  // Block save when another field on the same farm already uses this name.
  $: duplicateFieldName = (() => {
    const name = (fieldName || "").trim().toLowerCase()
    if (!name) return false
    const currentId = existingField?.field_id
    return ($mapFieldsStore || []).some((field) => {
      if (!field) return false
      if (currentId && field.field_id === currentId) return false
      if (effectiveFarmId && field.farm_id !== effectiveFarmId) return false
      if (!effectiveFarmId && field.farm_id) return false
      return (field.name || "").trim().toLowerCase() === name
    })
  })()
  $: hasEnoughPoints = points.length >= 3
  // Live area of the polygon currently being drawn; recomputes on every point change.
  $: {
    currentArea =
      points.length >= 3
        ? getPolygonArea(buildPolygonBoundary())
        : { hectares: 0, squareMeters: 0 }
  }
  $: totalArea = calculateTotalArea(draftPolygons)
  $: console.log("[AddField] derived", {
    mode,
    draftPolygonsLength: draftPolygons.length,
    pointsLength: points.length,
    totalHa: totalArea.hectares,
    currentHa: currentArea.hectares,
    initializedFieldKey,
  })
  $: effectiveFieldName = fieldName.trim()
  $: fieldHasChanges =
    !isEditingField ||
    userTouchedDraft ||
    deletedPolygons.length > 0 ||
    effectiveFieldName !== originalFieldName ||
    draftPolygons.length !== originalPolygonSignatures.length ||
    draftPolygons.some(
      (polygon, index) =>
        getPolygonSignature(polygon.boundary) !==
        originalPolygonSignatures[index],
    )
  $: fieldNameMissing = mode === "review" && !effectiveFieldName
  $: fieldNameRequired =
    fieldNameMissing && (attemptedReviewSave || !isEditingField)
  $: canCompleteCurrentPolygon =
    mode === "draw" && points.length >= 3 && !saving
  $: canSaveBase =
    draftPolygons.length > 0 && !!effectiveFieldName && !duplicateFieldName
  // For new fields the save button only requires content + name.
  // For edits also require at least one change vs. the loaded state
  // (name, boundaries, deletions, or any new draw activity).
  $: canSaveCurrentField =
    canSaveBase && !saving && (!isEditingField || fieldHasChanges)
  $: canFinishCurrentWithoutSaving = false
  // When editing an existing field and the user has deleted every polygon,
  // the primary review action becomes "Delete Field" instead of "Update Field".
  $: isDeleteAction = isEditingField && draftPolygons.length === 0
  $: canUseCurrentReviewAction = isDeleteAction ? !saving : canSaveCurrentField
  $: reviewActionTitle = isDeleteAction
    ? "Delete field"
    : effectiveFieldName
      ? isEditingField
        ? "Update field"
        : "Save field"
      : "Field name required"
  $: reviewActionLabel = saving
    ? isDeleteAction
      ? "Deleting Field"
      : isEditingField
        ? "Updating Field"
        : "Saving Field"
    : isDeleteAction
      ? "Delete Field"
      : isEditingField
        ? "Update Field"
        : "Save Field"

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
    return effectiveFieldName
  }

  function canSaveField() {
    return canSaveCurrentField
  }

  function getPolygonSignature(boundary) {
    const normalizedBoundary = normalizeBoundary(boundary)
    if (!normalizedBoundary) return "null"

    return JSON.stringify({
      type: normalizedBoundary.type,
      coordinates: normalizedBoundary.coordinates || [],
    })
  }

  function canFinishWithoutSaving() {
    return canFinishCurrentWithoutSaving
  }

  function canCompletePolygon() {
    return canCompleteCurrentPolygon
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

  function closeRing(coordinates) {
    if (!coordinates?.length) return []
    const ring = [...coordinates]
    if (!sameCoordinate(ring[0], ring[ring.length - 1])) {
      ring.push(ring[0])
    }
    return ring
  }

  function normalizePolygonBoundary(boundary) {
    const normalizedBoundary = normalizeBoundary(boundary)
    if (normalizedBoundary?.type !== "Polygon") return null

    return {
      type: "Polygon",
      coordinates: normalizedBoundary.coordinates
        .filter((ring) => Array.isArray(ring) && ring.length >= 3)
        .map(closeRing),
    }
  }

  function buildPolygonBoundary() {
    return {
      type: "Polygon",
      coordinates: [closeRing(points), ...editingInnerRings.map(closeRing)],
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
      const polygon = normalizePolygonBoundary(normalizedBoundary)
      return polygon ? [polygon] : []
    }

    if (normalizedBoundary.type === "MultiPolygon") {
      return normalizedBoundary.coordinates
        .map((coordinates) =>
          normalizePolygonBoundary({
            type: "Polygon",
            coordinates,
          }),
        )
        .filter(Boolean)
    }

    return []
  }

  export function addSeedArea(seedField) {
    if (saving) return

    const normalizedBoundary = normalizeBoundary(seedField?.boundary)
    const polygons = getBoundaryPolygons(normalizedBoundary)
    if (!polygons.length) return

    const mappedPolygons = polygons.map((boundary) => ({
      boundary,
      area: getPolygonArea(boundary),
      persisted: false,
    }))

    draftPolygons = [...draftPolygons, ...mappedPolygons]
    userTouchedDraft = true
    selectedReviewIndex = -1
    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    editingPolygonIndex = null
    editingPolygonPersisted = false
    editingInnerRings = []
    mode = "review"
    showAreaSourceChoice = false

    if (!fieldName.trim() && seedField?.name) {
      fieldName = seedField.name
    }
    applyDefaultFieldNameIfEmpty()
  }

  function initializeExistingField() {
    const fieldKey = sourceField?.field_id || sourceField?.id
    const boundarySignature = getPolygonSignature(sourceField?.boundary)
    // When there is no stable id (e.g. a freshly drawn seedField), key on the
    // boundary signature alone so the first reactive run still initializes.
    const sourceKey = fieldKey
      ? `${fieldKey}:${boundarySignature}`
      : boundarySignature
        ? `draft:${boundarySignature}`
        : null
    if (!sourceField?.boundary || initializedFieldKey === sourceKey) return

    const normalizedBoundary = normalizeBoundary(sourceField.boundary)
    const polygons = getBoundaryPolygons(normalizedBoundary)
    const properties = normalizeProperties(sourceField.properties)
    const existingFieldName = sourceField.name || properties.FIELD_NAME || ""

    const mappedPolygons = polygons.map((boundary) => ({
      boundary,
      area: getPolygonArea(boundary),
      persisted: true,
    }))

    const totalHa = mappedPolygons.reduce(
      (sum, polygon) => sum + (polygon.area?.hectares || 0),
      0,
    )
    console.log("[AddField] initializeExistingField", {
      mode: existingField ? "edit" : "seed",
      sourceKey,
      polygons: mappedPolygons.length,
      totalHa: Math.round(totalHa * 100) / 100,
      name: existingFieldName,
    })

    fieldName = existingFieldName
    originalFieldName = existingFieldName.trim()
    originalPolygonSignatures = existingField
      ? mappedPolygons.map((polygon) => getPolygonSignature(polygon.boundary))
      : []
    attemptedReviewSave = false
    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    draftPolygons = mappedPolygons
    deletedPolygons = []
    userTouchedDraft = false
    editingPolygonIndex = null
    editingPolygonPersisted = false
    editingInnerRings = []
    selectedReviewIndex = -1
    showAreaSourceChoice = false
    mode = mappedPolygons.length > 0 || existingField ? "review" : "draw"
    initializedFieldKey = sourceKey
    if (mode === "review") applyDefaultFieldNameIfEmpty()
  }

  function initializeLayers() {
    if (!map) return false

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

    function addPolygonDisplayFeatures(polygon, index, selected, lineRole) {
      features.push({
        type: "Feature",
        geometry: polygon.boundary,
        properties: { draftRole: `${lineRole}Fill`, index, selected },
      })

      polygon.boundary.coordinates.forEach((coordinates, ringIndex) => {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: {
            draftRole: lineRole === "deleted" ? "deletedLine" : "main",
            index,
            ringIndex,
            selected,
          },
        })
      })
    }

    draftPolygons.forEach((polygon, index) => {
      const selected = selectedReviewIndex === index
      addPolygonDisplayFeatures(polygon, index, selected, "completed")
    })

    deletedPolygons.forEach((polygon, index) => {
      addPolygonDisplayFeatures(polygon, index, false, "deleted")
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

  /**
   * Generate the next unused "Field N" name. We scope to the currently
   * selected farm so each farm gets its own numbering, falling back to all
   * fields when no farm is chosen.
   */
  function getDefaultFieldName() {
    const allFields = $mapFieldsStore || []
    const scoped = effectiveFarmId
      ? allFields.filter((field) => field?.farm_id === effectiveFarmId)
      : allFields
    const used = new Set(
      scoped.map((field) => (field?.name || "").trim().toLowerCase()),
    )
    let n = 1
    while (used.has(`field ${n}`)) n += 1
    return `Field ${n}`
  }

  function applyDefaultFieldNameIfEmpty() {
    if (isEditingField) return
    if (fieldName.trim()) return
    fieldName = getDefaultFieldName()
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
    userTouchedDraft = true

    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    editingPolygonIndex = null
    editingPolygonPersisted = false
    editingInnerRings = []
    originalEditingPolygon = null
    mode = "review"
    applyDefaultFieldNameIfEmpty()
  }

  function addAnotherPolygon() {
    if (saving) return
    points = []
    currentArea = { hectares: 0, squareMeters: 0 }
    editingPolygonIndex = null
    editingPolygonPersisted = false
    editingInnerRings = []
    selectedReviewIndex = -1
    showAreaSourceChoice = false
    mode = "draw"
  }

  function addArea() {
    if (saving) return
    dispatch("selectArea")
  }

  function openAreaSourceChoice() {
    if (saving) return
    showAreaSourceChoice = true
  }

  function cancelAreaSourceChoice() {
    if (saving) return
    showAreaSourceChoice = false
  }

  function selectAnotherPolygon() {
    if (saving) return
    showAreaSourceChoice = false
    dispatch("selectArea")
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

    originalEditingPolygon = polygon
    points = getOpenRingCoordinates(polygon.boundary)
    currentArea = polygon.area || getPolygonArea(polygon.boundary)
    editingInnerRings = polygon.boundary.coordinates.slice(1)
    draftPolygons = draftPolygons.filter((_, index) => index !== indexToEdit)
    userTouchedDraft = true
    editingPolygonIndex = indexToEdit
    editingPolygonPersisted = !!polygon.persisted
    selectedReviewIndex = -1
    showAreaSourceChoice = false
    mode = "draw"
  }

  /** Cancel the in-progress Edit Boundary and return to review unchanged. */
  function cancelEditingPolygon() {
    if (saving || editingPolygonIndex === null) return
    if (originalEditingPolygon) {
      const nextPolygons = [...draftPolygons]
      const insertIndex = Math.min(editingPolygonIndex, nextPolygons.length)
      nextPolygons.splice(insertIndex, 0, originalEditingPolygon)
      draftPolygons = nextPolygons
      selectedReviewIndex = insertIndex
    }
    originalEditingPolygon = null
    points = []
    editingPolygonIndex = null
    editingPolygonPersisted = false
    editingInnerRings = []
    mode = "review"
  }

  function removePolygon(indexToRemove) {
    if (saving) return
    const polygonToRemove = draftPolygons[indexToRemove]
    draftPolygons = draftPolygons.filter((_, index) => index !== indexToRemove)
    userTouchedDraft = true
    if (polygonToRemove?.persisted) {
      deletedPolygons = [...deletedPolygons, polygonToRemove]
    }

    if (selectedReviewIndex === indexToRemove) {
      selectedReviewIndex = -1
    } else if (selectedReviewIndex > indexToRemove) {
      selectedReviewIndex -= 1
    }

    if (draftPolygons.length === 0) selectedReviewIndex = -1
  }

  function saveField() {
    attemptedReviewSave = true
    if (saving) return
    if (!canSaveBase) return

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
      farmId: effectiveFarmId,
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
    attemptedReviewSave = true

    if (isDeleteAction) {
      deleteField()
      return
    }

    if (canFinishWithoutSaving()) {
      cancel()
      return
    }

    saveField()
  }

  function deleteField() {
    if (!isEditingField || saving) return
    dispatch("delete", { field: existingField })
  }

  function cleanupLayers() {
    if (!map || !map.getLayer || !map.getSource) return

    Object.values(layerIds).forEach((layerId) => {
      try {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId)
        }
      } catch (error) {
        console.warn(
          `Error removing add field overlay layer ${layerId}:`,
          error,
        )
      }
    })

    try {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId)
      }
    } catch (error) {
      console.warn("Error removing add field overlay source:", error)
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

  $: if (sourceField) {
    initializeExistingField()
    // Force dependents (totalArea, renderDraft etc.) to re-evaluate even when
    // Svelte's static analyzer can't see the writes through the function call.
    draftPolygons = draftPolygons
    points = points
    mode = mode
  }

  $: if (map && (points || draftPolygons || deletedPolygons || mode)) {
    renderDraft()
  }
</script>

{#if mode === "draw" && !hidden}
  <div class="crosshair-overlay">
    <div class="crosshair">
      <div class="crosshair-line horizontal"></div>
      <div class="crosshair-line vertical"></div>
      <div class="crosshair-center"></div>
    </div>
  </div>
{/if}

<div class="field-draft-panel" class:panel-hidden={hidden}>
  {#if mode === "draw" && editingPolygonIndex !== null}
    <button
      class="close-badge"
      on:click={cancelEditingPolygon}
      title="Back to review (discard changes)"
      aria-label="Back to review"
      disabled={saving}
    >
      <ArrowLeft size={18} />
    </button>
  {:else}
    <button
      class="close-badge"
      on:click={cancel}
      title="Cancel"
      disabled={saving}
    >
      <X size={18} />
    </button>
  {/if}

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
    <div class="point-actions">
      <button
        class="remove-point-btn"
        class:disabled={mode !== "draw" || points.length < 2 || saving}
        on:click={undoPoint}
        disabled={mode !== "draw" || points.length < 2 || saving}
        title="Remove point"
      >
        <Undo size={18} />
        <span>Undo</span>
      </button>
      <button
        class="add-point-btn"
        class:disabled={saving}
        on:click={addPoint}
        disabled={saving}
        title={points.length === 0 ? "Place starting point" : "Add point"}
      >
        <Plus size={22} />
        <span>{points.length === 0 ? "Start" : "Add"}</span>
      </button>
    </div>

    <button
      class="complete-paddock-btn"
      class:disabled={!canCompleteCurrentPolygon}
      on:click={completePolygon}
      disabled={!canCompleteCurrentPolygon}
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
        class:invalid={fieldNameRequired || duplicateFieldName}
        bind:value={fieldName}
        on:input={() => (fieldName = fieldName)}
        placeholder="Enter field name"
        maxlength="40"
        disabled={saving}
      />
      {#if duplicateFieldName}
        <span class="field-name-required">Name already used</span>
      {:else if fieldNameMissing}
        <span class="field-name-required">Field name required</span>
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
        on:click={addArea}
        disabled={saving}
        title="Add another area"
      >
        <Plus size={18} />
        <span>Add Area</span>
      </button>
      <button
        class="save-field-btn"
        class:disabled={!canUseCurrentReviewAction}
        class:delete-mode={isDeleteAction}
        on:click={handleReviewAction}
        disabled={!canUseCurrentReviewAction}
        title={reviewActionTitle}
      >
        {#if isDeleteAction}
          <Trash2 size={18} />
        {:else}
          <Check size={18} />
        {/if}
        <span>{reviewActionLabel}</span>
      </button>
    </div>
  {/if}
</div>

{#if showAreaSourceChoice}
  <!-- legacy modal removed -->
{/if}

<style>
  .field-draft-panel.panel-hidden {
    display: none !important;
  }

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
    animation: agskan-slideUp 0.22s ease-out;
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

  @keyframes agskan-slideUp {
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
    gap: 10px;
    align-items: center;
    margin-top: 12px;
  }

  .point-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .review-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .save-field-btn.delete-mode {
    background: rgba(239, 68, 68, 0.92);
    border-color: rgba(252, 165, 165, 0.5);
    box-shadow: 0 8px 22px rgba(239, 68, 68, 0.25);
  }

  .save-field-btn.delete-mode:hover:not(.disabled) {
    background: #dc2626;
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

  .area-source-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1203;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(4px);
  }

  .area-source-modal {
    width: min(440px, 100%);
    background: rgba(10, 14, 22, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.48);
    color: white;
    padding: 16px;
  }

  .area-source-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 14px;
  }

  .area-source-modal h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
  }

  .area-source-modal p {
    margin: 3px 0 0;
    color: rgba(255, 255, 255, 0.58);
    font-size: 13px;
  }

  .area-source-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
  }

  .area-source-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .area-source-action {
    display: flex;
    min-height: 88px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: white;
    cursor: pointer;
    font-weight: 800;
  }

  .area-source-action:hover:not(:disabled) {
    border-color: rgba(125, 211, 252, 0.58);
    background: rgba(14, 165, 233, 0.18);
  }

  @media (max-width: 520px) {
    .area-source-backdrop {
      padding: 0;
    }

    .area-source-modal {
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
    }
  }
</style>
