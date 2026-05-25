<!-- src/lib/components/map/overlays/FtwPmtilesOverlay.svelte -->
<script>
  import { createEventDispatcher, onDestroy } from "svelte"
  import { toast } from "svelte-sonner"
  import * as turf from "@turf/turf"
  import { FTW_FIELD_SELECTION_MIN_ZOOM } from "./fieldSelectionConstants.js"

  export let map
  export let visible = false
  export let year = 2025

  const dispatch = createEventDispatcher()
  const MAX_SELECTABLE_AREA_HECTARES = 2500
  const ftwPmtilesUrl =
    "https://data.source.coop/ftw/global-data/predictions/vectors/alpha/global.pmtiles"
  const clientPmtilesTilePath = "/ftw-client-pmtiles"
  const selectFieldsLoadToastId = "ftw-select-fields-load"
  const serviceWorkerReadyTimeoutMs = 5000
  const sourceId = "ftw-pmtiles-source"
  const loadingSourceId = "ftw-selection-loading-source"
  const loadingProgressSourceId = "ftw-selection-loading-progress-source"
  const layerIds = {
    fill: "ftw-pmtiles-fill",
    lineCasing: "ftw-pmtiles-line-casing",
    line: "ftw-pmtiles-line",
    loadingTrack: "ftw-selection-loading-track",
    loadingProgress: "ftw-selection-loading-progress",
    loadingHalo: "ftw-selection-loading-halo",
    loadingCore: "ftw-selection-loading-core",
  }

  let listeningForStyleLoad = false
  let listeningForLayerEvents = false
  let listeningForMapErrors = false
  // Manual tap tracking — Mapbox's layer-scoped `click` event is unreliable
  // on touch devices (a tap often doesn't trigger it after pinch/drag
  // settles). We mirror the pattern used in MapEventManager: capture a
  // touchstart, then on touchend if movement was small, queryRenderedFeatures
  // ourselves and dispatch a synthetic select.
  let touchStart = null
  let touchMoved = false
  const TAP_MOVE_THRESHOLD_PX = 10
  const PREMERGE_QUERY_RADIUS_PX = 56
  const PREMERGE_BOX_PADDING_PX = 18
  const PREMERGE_FEATURE_LIMIT = 96
  const premergeCache = new Map()
  let boundaryResolverWorker = null
  let resolverRequestId = 0
  let selectionLoadingToken = 0
  let selectionLoadingAnimationFrame = null
  let selectionLoadingState = null
  const pendingSelectionResolutions = new Map()
  let clientPmtilesServiceWorkerReady = false
  let clientPmtilesServiceWorkerPromise = null
  let selectFieldsLoadStarted = false
  let selectFieldsLoadToastActive = false
  let selectFieldsReadyNotified = false
  let lastSelectFieldsErrorKey = ""
  let activeFtwSourceConfig = null

  const emptyFeatureCollection = {
    type: "FeatureCollection",
    features: [],
  }

  function getPmtilesArchiveUrl(url) {
    if (!url) return null
    if (url.startsWith("pmtiles://")) return url.replace(/^pmtiles:\/\//, "")
    if (/^https?:\/\/.+\.pmtiles(?:[?#].*)?$/i.test(url)) return url
    return null
  }

  function getClientPmtilesTileTemplate(archiveUrl = ftwPmtilesUrl) {
    const tileBaseUrl =
      typeof window === "undefined"
        ? clientPmtilesTilePath
        : new URL(clientPmtilesTilePath, window.location.origin).href
    const archiveQuery =
      archiveUrl === ftwPmtilesUrl
        ? ""
        : `?archive=${encodeURIComponent(archiveUrl)}`
    return `${tileBaseUrl}/{z}/{x}/{y}.mvt${archiveQuery}`
  }

  function getErrorMessage(error) {
    if (!error) return "Unknown error"
    if (typeof error === "string") return error
    if (error.message) return error.message
    if (error.error?.message) return error.error.message

    try {
      return JSON.stringify(error)
    } catch (jsonError) {
      return String(error)
    }
  }

  function getServiceWorkerDiagnostics(sourceConfig = null, details = "") {
    const hasWindow = typeof window !== "undefined"
    const hasServiceWorker =
      typeof navigator !== "undefined" && "serviceWorker" in navigator
    const controllerActive = Boolean(
      hasServiceWorker && navigator.serviceWorker.controller,
    )
    const tileUrl = sourceConfig?.tileUrlTemplate
      ? sourceConfig.tileUrlTemplate.replace(
          hasWindow ? window.location.origin : "",
          "",
        )
      : ""

    return [
      details,
      hasWindow ? `origin ${window.location.origin}` : null,
      `serviceWorker ${hasServiceWorker ? "available" : "unavailable"}`,
      `controller ${controllerActive ? "yes" : "no"}`,
      sourceConfig?.mode ? `mode ${sourceConfig.mode}` : null,
      tileUrl ? `tiles ${tileUrl}` : null,
    ]
      .filter(Boolean)
      .join(" | ")
  }

  function showSelectFieldsLoadingToast(sourceConfig = null) {
    if (!visible || selectFieldsLoadToastActive || selectFieldsReadyNotified) {
      return
    }

    selectFieldsLoadStarted = true
    selectFieldsLoadToastActive = true
    toast.loading("Loading selectable fields", {
      id: selectFieldsLoadToastId,
      duration: Number.POSITIVE_INFINITY,
      description: getServiceWorkerDiagnostics(
        sourceConfig,
        "Preparing Fields of The World tiles",
      ),
    })
  }

  function dismissSelectFieldsLoadingToast() {
    if (!selectFieldsLoadToastActive) return
    toast.dismiss(selectFieldsLoadToastId)
    selectFieldsLoadToastActive = false
  }

  function showSelectFieldsReadyToast() {
    if (!visible) {
      dismissSelectFieldsLoadingToast()
      return
    }
    if (selectFieldsReadyNotified) return

    selectFieldsLoadToastActive = false
    selectFieldsReadyNotified = true
    toast.success("Selectable fields loaded", {
      id: selectFieldsLoadToastId,
      description: "Tap a highlighted field to select it.",
      duration: 2500,
    })
  }

  function showSelectFieldsErrorToast(message, sourceConfig = null, details = "") {
    const description = getServiceWorkerDiagnostics(sourceConfig, details)
    const errorKey = `${message}|${description}`
    if (errorKey === lastSelectFieldsErrorKey && !selectFieldsLoadToastActive) {
      return
    }

    selectFieldsLoadStarted = true
    selectFieldsLoadToastActive = false
    lastSelectFieldsErrorKey = errorKey
    toast.error(message, {
      id: selectFieldsLoadToastId,
      description,
      duration: 9000,
    })
  }

  function waitForServiceWorkerReady(timeoutMs = serviceWorkerReadyTimeoutMs) {
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), timeoutMs)

      navigator.serviceWorker.ready
        .then(() => resolve(true))
        .catch(() => resolve(false))
        .finally(() => window.clearTimeout(timeout))
    })
  }

  function waitForServiceWorkerController(timeoutMs = 3500) {
    if (navigator.serviceWorker.controller) return Promise.resolve(true)

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        )
        resolve(Boolean(navigator.serviceWorker.controller))
      }, timeoutMs)

      function handleControllerChange() {
        window.clearTimeout(timeout)
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        )
        resolve(true)
      }

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      )
    })
  }

  async function prepareClientPmtilesServiceWorker(sourceConfig = null) {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      console.warn("[FTW PMTiles] Service workers are unavailable")
      showSelectFieldsErrorToast(
        "Select fields cannot load",
        sourceConfig,
        "Service workers are unavailable in this WebView",
      )
      return false
    }

    if (navigator.serviceWorker.controller) return true

    try {
      await navigator.serviceWorker.register("/service-worker.js")
      const serviceWorkerReady = await waitForServiceWorkerReady()
      if (!serviceWorkerReady) {
        showSelectFieldsErrorToast(
          "Select fields tile service is not ready",
          sourceConfig,
          `navigator.serviceWorker.ready timed out after ${serviceWorkerReadyTimeoutMs}ms`,
        )
        return false
      }

      const controlled = await waitForServiceWorkerController()
      if (!controlled) {
        showSelectFieldsErrorToast(
          "Select fields are waiting for the tile service",
          sourceConfig,
          "Service worker registered but is not controlling this page yet",
        )
      }
      return controlled
    } catch (error) {
      console.warn(
        "[FTW PMTiles] Could not prepare client PMTiles service worker",
        error,
      )
      showSelectFieldsErrorToast(
        "Select fields tile service failed",
        sourceConfig,
        getErrorMessage(error),
      )
      return false
    }
  }

  function ensureClientPmtilesServiceWorkerReady(sourceConfig = null) {
    if (clientPmtilesServiceWorkerReady) return true
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      showSelectFieldsErrorToast(
        "Select fields cannot load",
        sourceConfig,
        "Service workers are unavailable in this WebView",
      )
      return false
    }
    if (navigator.serviceWorker.controller) {
      clientPmtilesServiceWorkerReady = true
      return true
    }

    if (!clientPmtilesServiceWorkerPromise) {
      clientPmtilesServiceWorkerPromise = prepareClientPmtilesServiceWorker(
        sourceConfig,
      )
        .then((ready) => {
          clientPmtilesServiceWorkerReady = ready
          if (ready && visible) renderOverlay()
          if (!ready) {
            console.warn(
              "[FTW PMTiles] Client PMTiles service worker is not controlling the page yet",
            )
          }
          return ready
        })
        .finally(() => {
          clientPmtilesServiceWorkerPromise = null
        })
    }

    return false
  }

  function normalizeStoredTileUrl(storedUrl) {
    if (!storedUrl) return null

    if (
      storedUrl.includes("127.0.0.1") ||
      storedUrl.includes("localhost:8787") ||
      storedUrl.includes("localhost:5178")
    ) {
      window.localStorage.removeItem("agskan-ftw-tile-base-url")
      console.info(
        "[FTW PMTiles] Cleared local proxy tile URL from localStorage:",
        storedUrl,
      )
      return null
    }

    if (storedUrl === ftwPmtilesUrl) return null
    return storedUrl
  }

  function getFtwSourceConfig() {
    if (typeof window === "undefined") {
      return {
        mode: "client-pmtiles",
        tileUrlTemplate: getClientPmtilesTileTemplate(),
        archiveUrl: ftwPmtilesUrl,
      }
    }

    const storedUrl = normalizeStoredTileUrl(
      window.localStorage.getItem("agskan-ftw-tile-base-url"),
    )

    const archiveUrl = getPmtilesArchiveUrl(storedUrl)
    if (archiveUrl) {
      return {
        mode: "client-pmtiles",
        tileUrlTemplate: getClientPmtilesTileTemplate(archiveUrl),
        archiveUrl,
      }
    }

    if (storedUrl?.startsWith("http")) {
      return {
        mode: "http-tiles",
        tileUrlTemplate: `${storedUrl}/{z}/{x}/{y}.mvt`,
      }
    }

    return {
      mode: "client-pmtiles",
      tileUrlTemplate: getClientPmtilesTileTemplate(),
      archiveUrl: ftwPmtilesUrl,
    }
  }

  function summarizeFeature(feature, index) {
    const properties = feature?.properties || {}
    const propertyKeys = Object.keys(properties).sort()
    const scoreLikeKeys = propertyKeys.filter((key) =>
      /confidence|score|prob|certainty|quality/i.test(key),
    )

    return {
      index,
      id: feature?.id ?? properties.id ?? properties.ftw_id ?? null,
      geometryType: feature?.geometry?.type || null,
      propertyKeys,
      scoreLikeKeys,
      scoreLikeValues: scoreLikeKeys.reduce((values, key) => {
        values[key] = properties[key]
        return values
      }, {}),
      properties,
    }
  }

  function getRenderedFieldFeatures(point) {
    if (!point || !map?.getLayer || !map.getLayer(layerIds.fill)) return []
    return map.queryRenderedFeatures(point, { layers: [layerIds.fill] }) || []
  }

  function getSelectionAreaFilter() {
    return { maxHectares: MAX_SELECTABLE_AREA_HECTARES }
  }

  function getFeatureAreaHa(feature) {
    const propertyArea = Number(
      feature?.properties?.premerged_area_ha || feature?.properties?.area_ha,
    )
    if (Number.isFinite(propertyArea) && propertyArea > 0) return propertyArea

    try {
      if (!feature?.geometry) return null
      return Math.round((turf.area(feature) / 10000) * 100) / 100
    } catch (error) {
      return null
    }
  }

  function getAreaRejection(areaHa, filter = getSelectionAreaFilter()) {
    if (!Number.isFinite(areaHa)) return null
    if (filter.maxHectares && areaHa > filter.maxHectares) {
      return { reason: "too_large", limitHa: filter.maxHectares }
    }
    return null
  }

  function rejectSelection({ reason, areaHa, limitHa, stage, lngLat, point, source }) {
    dispatch("reject", {
      reason,
      areaHa,
      limitHa,
      stage,
      lngLat,
      point,
      source,
      filter: getSelectionAreaFilter(),
    })
  }

  function getBoundaryResolverWorker() {
    if (typeof Worker === "undefined") return null
    if (boundaryResolverWorker) return boundaryResolverWorker

    boundaryResolverWorker = new Worker(
      new URL(
        "../../../workers/ftwBoundaryResolver.worker.js",
        import.meta.url,
      ),
      { type: "module" },
    )
    boundaryResolverWorker.onmessage = (event) => {
      handleBoundaryResolverMessage(event.data || {})
    }
    boundaryResolverWorker.onerror = (error) => {
      console.warn("[FTW PMTiles] Boundary resolver worker error", error)
      const pendingContexts = [...pendingSelectionResolutions.values()]
      pendingSelectionResolutions.clear()
      pendingContexts.forEach((context) => {
        handleResolvedSelection(
          { feature: context.seedFeature, features: [context.seedFeature] },
          context,
        )
        clearSelectionLoading(context.token)
      })
    }

    return boundaryResolverWorker
  }

  function shouldLogFtwDiagnostics() {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("agskan-ftw-debug") === "true"
  }

  function getNearbyFieldFeatures(point) {
    if (!map?.getLayer || !map.getLayer(layerIds.fill)) return []
    if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
      return []
    }

    const radius = PREMERGE_QUERY_RADIUS_PX

    return (
      map.queryRenderedFeatures(
        [
          [point.x - radius, point.y - radius],
          [point.x + radius, point.y + radius],
        ],
        { layers: [layerIds.fill] },
      ) || []
    )
  }

  function getFieldFeaturesInScreenBox(screenBox) {
    if (!map?.getLayer || !map.getLayer(layerIds.fill) || !screenBox) return []
    return (
      map.queryRenderedFeatures(
        [
          [screenBox.minX, screenBox.minY],
          [screenBox.maxX, screenBox.maxY],
        ],
        { layers: [layerIds.fill] },
      ) || []
    )
  }

  function cloneGeometry(geometry) {
    if (!geometry?.type || !geometry?.coordinates) return null

    try {
      return JSON.parse(JSON.stringify(geometry))
    } catch (error) {
      return null
    }
  }

  function getFeatureGeometryKey(feature) {
    try {
      const coordinates = collectCoordinates(feature?.geometry?.coordinates)
      const first = coordinates[0]
      const last = coordinates[coordinates.length - 1]
      const bbox = getGeometryBoundsFromCoordinates(coordinates)
      return [
        feature?.geometry?.type || "unknown",
        coordinates.length,
        roundCoordinate(bbox?.minLng),
        roundCoordinate(bbox?.minLat),
        roundCoordinate(bbox?.maxLng),
        roundCoordinate(bbox?.maxLat),
        roundCoordinate(first?.[0]),
        roundCoordinate(first?.[1]),
        roundCoordinate(last?.[0]),
        roundCoordinate(last?.[1]),
      ].join(":")
    } catch (error) {
      return null
    }
  }

  function roundCoordinate(value) {
    return Number.isFinite(value) ? Number(value).toFixed(6) : "na"
  }

  function getGeometryBoundsFromCoordinates(coordinates) {
    if (!coordinates?.length) return null
    return coordinates.reduce(
      (bounds, coordinate) => ({
        minLng: Math.min(bounds.minLng, coordinate[0]),
        minLat: Math.min(bounds.minLat, coordinate[1]),
        maxLng: Math.max(bounds.maxLng, coordinate[0]),
        maxLat: Math.max(bounds.maxLat, coordinate[1]),
      }),
      {
        minLng: Infinity,
        minLat: Infinity,
        maxLng: -Infinity,
        maxLat: -Infinity,
      },
    )
  }

  function getCachedPremerge(key) {
    if (!key) return null
    return premergeCache.get(key) || null
  }

  function setCachedPremerge(key, selection) {
    if (!key || !selection?.feature) return selection
    if (premergeCache.size > 120) premergeCache.clear()
    premergeCache.set(key, selection)
    return selection
  }

  function getPlainFeature(feature) {
    const geometry = cloneGeometry(feature?.geometry)
    if (!["Polygon", "MultiPolygon"].includes(geometry?.type)) return null

    return {
      type: "Feature",
      geometry,
      properties: feature?.properties || {},
    }
  }

  function setCachedPremergeForGroup(group, selection) {
    ;(group || []).forEach((feature) => {
      setCachedPremerge(getFeatureGeometryKey(feature), selection)
    })
    return selection
  }

  function dedupeFeatures(features) {
    const seen = new Set()
    return (features || []).filter((feature) => {
      const key = getFeatureGeometryKey(feature)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function collectCoordinates(coordinates, points = []) {
    if (!Array.isArray(coordinates)) return points
    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      points.push(coordinates)
      return points
    }
    coordinates.forEach((child) => collectCoordinates(child, points))
    return points
  }

  function getFeatureScreenBox(feature, fallbackPoint = null) {
    const coordinates = collectCoordinates(feature?.geometry?.coordinates)
    const projected = coordinates
      .map((coordinate) => map?.project?.(coordinate))
      .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))

    if (!projected.length && fallbackPoint) {
      return expandScreenBox(
        {
          minX: fallbackPoint.x,
          minY: fallbackPoint.y,
          maxX: fallbackPoint.x,
          maxY: fallbackPoint.y,
        },
        PREMERGE_QUERY_RADIUS_PX,
      )
    }
    if (!projected.length) return null

    const box = projected.reduce(
      (bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
      }),
      {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      },
    )

    return expandScreenBox(box, PREMERGE_BOX_PADDING_PX)
  }

  function expandScreenBox(box, padding) {
    if (!box) return null
    return clampScreenBox({
      minX: box.minX - padding,
      minY: box.minY - padding,
      maxX: box.maxX + padding,
      maxY: box.maxY + padding,
    })
  }

  function combineScreenBoxes(boxA, boxB) {
    if (!boxA) return boxB
    if (!boxB) return boxA
    return clampScreenBox({
      minX: Math.min(boxA.minX, boxB.minX),
      minY: Math.min(boxA.minY, boxB.minY),
      maxX: Math.max(boxA.maxX, boxB.maxX),
      maxY: Math.max(boxA.maxY, boxB.maxY),
    })
  }

  function clampScreenBox(box) {
    const canvas = map?.getCanvas?.()
    const bounds = canvas?.getBoundingClientRect?.()
    if (!bounds?.width || !bounds?.height) return box
    return {
      minX: Math.max(0, Math.min(bounds.width, box.minX)),
      minY: Math.max(0, Math.min(bounds.height, box.minY)),
      maxX: Math.max(0, Math.min(bounds.width, box.maxX)),
      maxY: Math.max(0, Math.min(bounds.height, box.maxY)),
    }
  }

  function collectResolverCandidateFeatures(
    seedFeature,
    pointFeatures = [],
    point = null,
  ) {
    const seedBox = getFeatureScreenBox(seedFeature, point)
    const clickBox = point
      ? expandScreenBox(
          {
            minX: point.x,
            minY: point.y,
            maxX: point.x,
            maxY: point.y,
          },
          PREMERGE_QUERY_RADIUS_PX,
        )
      : null
    const searchBox = expandScreenBox(
      combineScreenBoxes(seedBox, clickBox),
      PREMERGE_QUERY_RADIUS_PX,
    )

    return dedupeFeatures([
      seedFeature,
      ...(pointFeatures || []),
      ...getFieldFeaturesInScreenBox(searchBox),
    ])
      .slice(0, PREMERGE_FEATURE_LIMIT)
      .map((candidate) => ({
        type: "Feature",
        geometry: cloneGeometry(candidate?.geometry),
        properties: candidate?.properties || {},
      }))
      .filter((candidate) =>
        ["Polygon", "MultiPolygon"].includes(candidate?.geometry?.type),
      )
  }

  function getCachedExactSelection(feature) {
    return getCachedPremerge(getFeatureGeometryKey(feature))
  }

  function handleResolvedSelection(selection, context) {
    if (!selection?.feature || !context) return

    const areaHa = getFeatureAreaHa(selection.feature)
    const rejection = getAreaRejection(areaHa)
    if (rejection) {
      rejectSelection({
        ...rejection,
        areaHa,
        stage: "resolved",
        lngLat: context.lngLat,
        point: context.point,
        source: context.source,
      })
      return
    }

    setCachedPremergeForGroup(
      selection.features || [selection.feature],
      selection,
    )
    logFtwSelection(
      selection.features || [selection.feature],
      selection.feature,
      context.lngLat,
      context.source,
    )

    dispatch("select", {
      feature: selection.feature,
      features: selection.features || [selection.feature],
      lngLat: context.lngLat,
      point: context.point,
    })
  }

  function handleBoundaryResolverMessage(detail) {
    if (detail?.type === "progress") {
      if (pendingSelectionResolutions.has(detail.requestId)) {
        updateLoadingProgress(detail.progress)
      }
      return
    }

    const context = pendingSelectionResolutions.get(detail.requestId)
    if (!context) return

    pendingSelectionResolutions.delete(detail.requestId)

    try {
      if (!detail.ok || !detail.feature) {
        if (detail.rejected) {
          rejectSelection({
            reason: detail.reason,
            areaHa: detail.areaHa,
            limitHa: detail.limitHa,
            stage: detail.stage || "worker",
            lngLat: context.lngLat,
            point: context.point,
            source: context.source,
          })
          return
        }
        console.warn("[FTW PMTiles] Boundary resolve failed", detail)
        handleResolvedSelection(
          { feature: context.seedFeature, features: [context.seedFeature] },
          context,
        )
        return
      }

      handleResolvedSelection(
        {
          feature: detail.feature,
          features: detail.features || [detail.feature],
        },
        context,
      )
      updateLoadingProgress(0.98)
    } finally {
      clearSelectionLoading(context.token)
    }
  }

  function logFtwSelection(features, selectedFeature, lngLat, source) {
    if (!shouldLogFtwDiagnostics()) {
      const count =
        selectedFeature?.properties?.premerged_from_visible_count || 1
      if (count > 1) {
        console.info("[FTW PMTiles] Premerged clicked selection", {
          source,
          count,
          areaHa: selectedFeature?.properties?.premerged_area_ha,
          overlapRemovedHa:
            selectedFeature?.properties?.premerged_overlap_removed_ha,
        })
      }
      return
    }

    const summaries = features.map(summarizeFeature)
    const allKeys = [...new Set(summaries.flatMap((item) => item.propertyKeys))]
    const scoreLikeKeys = [
      ...new Set(summaries.flatMap((item) => item.scoreLikeKeys)),
    ]

    console.groupCollapsed(
      `[FTW PMTiles] ${source} selection: ${features.length} feature(s) in premerged selection group`,
    )
    console.log("lngLat", lngLat)
    console.log("selected", summarizeFeature(selectedFeature, 0))
    console.log("all property keys", allKeys)
    console.log("score/confidence-like keys", scoreLikeKeys)
    if (!scoreLikeKeys.length) {
      console.info(
        "[FTW PMTiles] No score/confidence metadata found; using geometry-only selection.",
      )
    }
    console.table(
      summaries.map((item) => ({
        index: item.index,
        id: item.id,
        geometryType: item.geometryType,
        scoreLikeKeys: item.scoreLikeKeys.join(", ") || "none",
        scoreLikeValues: JSON.stringify(item.scoreLikeValues),
      })),
    )
    console.log("selection group summaries", summaries)
    console.groupEnd()
  }

  function styleReady() {
    return !!map?.getStyle?.()?.layers?.length
  }

  function getFieldLayerName() {
    return `field-${year}-01-01 00:00:00`
  }

  function getBeforeLayerId() {
    const candidates = [
      "fields-fill",
      "fields-outline",
      "markers-layer",
      "gl-draw-polygon-fill",
    ]
    return candidates.find((layerId) => map.getLayer(layerId))
  }

  function addLayer(layerConfig) {
    if (map.getLayer(layerConfig.id)) return
    const beforeLayerId = getBeforeLayerId()
    if (beforeLayerId) {
      map.addLayer(layerConfig, beforeLayerId)
    } else {
      map.addLayer(layerConfig)
    }
  }

  function addTopLayer(layerConfig) {
    if (map.getLayer(layerConfig.id)) return
    map.addLayer(layerConfig)
  }

  function ensureSelectionLoadingLayers() {
    if (!map?.getSource || !map?.addSource || !map?.addLayer) return

    if (!map.getSource(loadingSourceId)) {
      map.addSource(loadingSourceId, {
        type: "geojson",
        data: emptyFeatureCollection,
      })
    }
    if (!map.getSource(loadingProgressSourceId)) {
      map.addSource(loadingProgressSourceId, {
        type: "geojson",
        data: emptyFeatureCollection,
      })
    }

    addTopLayer({
      id: layerIds.loadingTrack,
      type: "line",
      source: loadingProgressSourceId,
      filter: ["==", ["get", "kind"], "track"],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#92400e",
        "line-opacity": 0.26,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          FTW_FIELD_SELECTION_MIN_ZOOM,
          3,
          14,
          4.5,
        ],
      },
    })

    addTopLayer({
      id: layerIds.loadingProgress,
      type: "line",
      source: loadingProgressSourceId,
      filter: ["==", ["get", "kind"], "progress"],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.98,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          FTW_FIELD_SELECTION_MIN_ZOOM,
          3.2,
          14,
          5,
        ],
      },
    })

    addTopLayer({
      id: layerIds.loadingHalo,
      type: "circle",
      source: loadingSourceId,
      paint: {
        "circle-color": "#f59e0b",
        "circle-opacity": 0.24,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          FTW_FIELD_SELECTION_MIN_ZOOM,
          11,
          14,
          18,
        ],
        "circle-stroke-color": "#fef3c7",
        "circle-stroke-width": 2,
        "circle-stroke-opacity": 0.95,
      },
    })

    addTopLayer({
      id: layerIds.loadingCore,
      type: "circle",
      source: loadingSourceId,
      paint: {
        "circle-color": "#ffffff",
        "circle-opacity": 0.95,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          FTW_FIELD_SELECTION_MIN_ZOOM,
          3.5,
          14,
          5,
        ],
        "circle-stroke-color": "#f59e0b",
        "circle-stroke-width": 2,
      },
    })
  }

  function clampProgress(progress) {
    if (!Number.isFinite(progress)) return 0.08
    return Math.max(0.04, Math.min(0.98, progress))
  }

  function buildScreenRingCoordinates(
    lngLat,
    progress = 1,
    phase = 0,
    full = false,
  ) {
    if (!lngLat || !map?.project || !map?.unproject) return []

    const center = map.project([lngLat.lng, lngLat.lat])
    if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y)) return []

    const radius = 20
    const segmentCount = full
      ? 72
      : Math.max(8, Math.ceil(72 * clampProgress(progress)))
    const sweep = full ? Math.PI * 2 : Math.PI * 2 * clampProgress(progress)
    const coordinates = []

    for (let index = 0; index <= segmentCount; index += 1) {
      const angle = phase + (sweep * index) / segmentCount - Math.PI / 2
      const point = map.unproject([
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
      ])
      coordinates.push([point.lng, point.lat])
    }

    return coordinates
  }

  function getLoadingProgressData() {
    if (!selectionLoadingState?.lngLat) return emptyFeatureCollection

    const { lngLat, progress, phase } = selectionLoadingState

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: buildScreenRingCoordinates(lngLat, 1, phase, true),
          },
          properties: { kind: "track" },
        },
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: buildScreenRingCoordinates(lngLat, progress, phase),
          },
          properties: { kind: "progress" },
        },
      ],
    }
  }

  function renderLoadingProgress() {
    if (!map?.getSource) return
    map.getSource(loadingProgressSourceId)?.setData?.(getLoadingProgressData())
  }

  function stopLoadingAnimation(targetMap = map) {
    if (selectionLoadingAnimationFrame !== null) {
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(selectionLoadingAnimationFrame)
      }
      selectionLoadingAnimationFrame = null
    }
    selectionLoadingState = null
    try {
      targetMap
        ?.getSource?.(loadingProgressSourceId)
        ?.setData?.(emptyFeatureCollection)
    } catch (error) {
      // Mapbox can tear down style/source internals before Svelte destroys this overlay.
    }
  }

  function animateLoadingProgress() {
    if (!selectionLoadingState) {
      selectionLoadingAnimationFrame = null
      return
    }

    selectionLoadingState.phase += 0.11
    renderLoadingProgress()
    selectionLoadingAnimationFrame = requestAnimationFrame(
      animateLoadingProgress,
    )
  }

  function startLoadingAnimation(lngLat) {
    stopLoadingAnimation()
    selectionLoadingState = {
      lngLat,
      progress: 0.08,
      phase: 0,
    }
    renderLoadingProgress()
    if (typeof requestAnimationFrame !== "undefined") {
      selectionLoadingAnimationFrame = requestAnimationFrame(
        animateLoadingProgress,
      )
    }
  }

  function updateLoadingProgress(progress) {
    if (!selectionLoadingState) return
    selectionLoadingState.progress = Math.max(
      selectionLoadingState.progress,
      clampProgress(progress),
    )
    renderLoadingProgress()
  }

  function setSelectionLoading(lngLat) {
    if (!lngLat || !map?.getSource) return
    ensureSelectionLoadingLayers()
    startLoadingAnimation(lngLat)
    const source = map.getSource(loadingSourceId)
    source?.setData?.({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lngLat.lng, lngLat.lat],
          },
          properties: {},
        },
      ],
    })
    map?.triggerRepaint?.()
  }

  function clearSelectionLoading(token = selectionLoadingToken, targetMap = map) {
    const currentMap = targetMap
    if (token !== selectionLoadingToken || !currentMap?.getSource) return
    try {
      currentMap.getSource(loadingSourceId)?.setData?.(emptyFeatureCollection)
      stopLoadingAnimation(currentMap)
    } catch (error) {
      stopLoadingAnimation(currentMap)
    }
  }

  function afterNextPaint(callback) {
    if (typeof requestAnimationFrame === "undefined") {
      setTimeout(callback, 0)
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(callback))
  }

  function resolveExactSelection({ feature, features, lngLat, point, source }) {
    const token = ++selectionLoadingToken
    const seedAreaHa = getFeatureAreaHa(feature)
    const seedRejection = getAreaRejection(seedAreaHa)
    if (seedRejection?.reason === "too_large") {
      rejectSelection({
        ...seedRejection,
        areaHa: seedAreaHa,
        stage: "seed",
        lngLat,
        point,
        source,
      })
      return
    }

    const cachedSelection = getCachedExactSelection(feature)
    if (cachedSelection) {
      handleResolvedSelection(cachedSelection, { lngLat, point, source })
      return
    }

    setSelectionLoading(lngLat)

    afterNextPaint(() => {
      if (token !== selectionLoadingToken) return

      try {
        const worker = getBoundaryResolverWorker()
        const seedFeature = getPlainFeature(feature)
        const candidates = collectResolverCandidateFeatures(
          feature,
          features.length ? features : [feature],
          point,
        )

        if (!worker || !seedFeature) {
          console.warn("[FTW PMTiles] Boundary resolver worker unavailable")
          const fallbackFeature = seedFeature || getPlainFeature(feature) || feature
          handleResolvedSelection(
            { feature: fallbackFeature, features: [fallbackFeature] },
            { lngLat, point, source },
          )
          clearSelectionLoading(token)
          return
        }

        const requestId = ++resolverRequestId
        pendingSelectionResolutions.set(requestId, {
          token,
          lngLat,
          point,
          source,
          seedFeature,
        })
        worker.postMessage({
          requestId,
          seedFeature,
          candidates,
          year,
          areaFilter: getSelectionAreaFilter(),
        })
      } finally {
        // The normal worker path clears the loader when it posts back.
      }
    })
  }

  function handleFieldClick(event) {
    const features = getRenderedFieldFeatures(event.point)
    const feature = features?.[0] || event.features?.[0]
    if (!feature || !event.lngLat) return
    resolveExactSelection({
      feature,
      features: features.length ? features : event.features || [],
      lngLat: {
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      },
      point: event.point,
      source: "click",
    })
  }

  function handleFieldMouseEnter() {
    if (map?.getCanvas) map.getCanvas().style.cursor = "pointer"
  }

  function handleFieldMouseLeave() {
    if (map?.getCanvas) map.getCanvas().style.cursor = ""
  }

  function handleMapTouchStart(event) {
    const touches = event.originalEvent?.touches
    if (!touches || touches.length !== 1) {
      touchStart = null
      touchMoved = false
      return
    }
    touchStart = {
      x: touches[0].clientX,
      y: touches[0].clientY,
      point: event.point,
      lngLat: event.lngLat,
    }
    touchMoved = false
  }

  function handleMapTouchMove(event) {
    if (!touchStart) return
    const touches = event.originalEvent?.touches
    if (!touches || touches.length !== 1) {
      touchMoved = true
      return
    }
    const dx = touches[0].clientX - touchStart.x
    const dy = touches[0].clientY - touchStart.y
    if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_THRESHOLD_PX) touchMoved = true
  }

  function handleMapTouchEnd(event) {
    const start = touchStart
    touchStart = null
    if (!start || touchMoved) {
      touchMoved = false
      return
    }
    touchMoved = false
    if (!map?.getLayer || !map.getLayer(layerIds.fill)) return

    const features = getRenderedFieldFeatures(start.point)
    const feature = features?.[0]
    if (!feature) return
    resolveExactSelection({
      feature,
      features,
      lngLat: start.lngLat
        ? { lng: start.lngLat.lng, lat: start.lngLat.lat }
        : null,
      point: start.point,
      source: "touch",
    })
  }

  function attachInteractionListeners() {
    if (listeningForLayerEvents || !map?.on || !map.getLayer(layerIds.fill)) {
      return
    }

    map.on("click", layerIds.fill, handleFieldClick)
    map.on("mouseenter", layerIds.fill, handleFieldMouseEnter)
    map.on("mouseleave", layerIds.fill, handleFieldMouseLeave)
    // Mapbox layer-scoped click is flaky on touch; also bind raw touch
    // events so taps register reliably on mobile/Capacitor.
    map.on("touchstart", handleMapTouchStart)
    map.on("touchmove", handleMapTouchMove)
    map.on("touchend", handleMapTouchEnd)
    listeningForLayerEvents = true
  }

  function detachInteractionListeners() {
    if (!listeningForLayerEvents || !map?.off) return

    map.off("click", layerIds.fill, handleFieldClick)
    map.off("mouseenter", layerIds.fill, handleFieldMouseEnter)
    map.off("mouseleave", layerIds.fill, handleFieldMouseLeave)
    map.off("touchstart", handleMapTouchStart)
    map.off("touchmove", handleMapTouchMove)
    map.off("touchend", handleMapTouchEnd)
    handleFieldMouseLeave()
    touchStart = null
    touchMoved = false
    listeningForLayerEvents = false
  }

  function handleMapError(event) {
    if (!visible) return

    const message = getErrorMessage(event?.error || event)
    const errorSourceId = event?.sourceId || event?.source?.id || ""
    const tileUrl =
      event?.tile?.request?.url || event?.tile?.url || event?.resource?.url || ""
    const isFtwError =
      errorSourceId === sourceId ||
      String(tileUrl).includes(clientPmtilesTilePath) ||
      message.includes(clientPmtilesTilePath) ||
      message.includes(sourceId)

    if (!isFtwError) return

    console.warn("[FTW PMTiles] Map source error", event)
    showSelectFieldsErrorToast(
      "Select fields tile request failed",
      activeFtwSourceConfig,
      message,
    )
  }

  function attachMapErrorListener() {
    if (listeningForMapErrors || !map?.on) return
    map.on("error", handleMapError)
    listeningForMapErrors = true
  }

  function detachMapErrorListener() {
    if (!listeningForMapErrors || !map?.off) return
    map.off("error", handleMapError)
    listeningForMapErrors = false
  }

  function initializeLayers() {
    if (!map || !styleReady()) return false
    let sourceConfig = activeFtwSourceConfig

    try {
      attachMapErrorListener()

      if (!map.getSource(sourceId)) {
        sourceConfig = getFtwSourceConfig()
        activeFtwSourceConfig = sourceConfig
        showSelectFieldsLoadingToast(sourceConfig)
        if (
          sourceConfig.mode === "client-pmtiles" &&
          !ensureClientPmtilesServiceWorkerReady(sourceConfig)
        ) {
          return false
        }

        console.info("[FTW PMTiles] Using source:", sourceConfig)
        const vectorSourceConfig = {
          type: "vector",
          tiles: [sourceConfig.tileUrlTemplate],
          minzoom: 0,
          maxzoom: 15,
          bounds: [-179.8340817, -56.9030569, 179.995742, 82.8192209],
          attribution: "Fields of The World / Source Cooperative",
        }

        map.addSource(sourceId, vectorSourceConfig)
      }

      const sourceLayer = getFieldLayerName()

      addLayer({
        id: layerIds.fill,
        type: "fill",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: FTW_FIELD_SELECTION_MIN_ZOOM,
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.16,
        },
      })

      addLayer({
        id: layerIds.lineCasing,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: FTW_FIELD_SELECTION_MIN_ZOOM,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#111827",
          "line-opacity": 0.55,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            FTW_FIELD_SELECTION_MIN_ZOOM,
            0.6,
            14,
            2.4,
          ],
        },
      })

      addLayer({
        id: layerIds.line,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: FTW_FIELD_SELECTION_MIN_ZOOM,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#fbbf24",
          "line-opacity": 0.9,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            FTW_FIELD_SELECTION_MIN_ZOOM,
            0.35,
            14,
            1.5,
          ],
        },
      })

      ensureSelectionLoadingLayers()

      attachInteractionListeners()
      if (selectFieldsLoadStarted) showSelectFieldsReadyToast()
      return true
    } catch (error) {
      console.error("Error initializing FTW PMTiles overlay:", error)
      showSelectFieldsErrorToast(
        "Select fields failed to load",
        sourceConfig,
        getErrorMessage(error),
      )
      return false
    }
  }

  function cleanupLayers() {
    const currentMap = map
    if (!currentMap?.getLayer || !currentMap?.getSource) return

    try {
      detachInteractionListeners()
      detachMapErrorListener()
    } catch (error) {
      console.warn("Error detaching FTW PMTiles listeners:", error)
    }

    dismissSelectFieldsLoadingToast()

    clearSelectionLoading(selectionLoadingToken, currentMap)

    Object.values(layerIds).forEach((layerId) => {
      try {
        if (currentMap.getLayer(layerId)) currentMap.removeLayer(layerId)
      } catch (error) {
        console.warn(
          `Error removing FTW PMTiles overlay layer ${layerId}:`,
          error,
        )
      }
    })

    try {
      if (currentMap.getSource(loadingProgressSourceId)) {
        currentMap.removeSource(loadingProgressSourceId)
      }
      if (currentMap.getSource(loadingSourceId)) {
        currentMap.removeSource(loadingSourceId)
      }
      if (currentMap.getSource(sourceId)) currentMap.removeSource(sourceId)
      activeFtwSourceConfig = null
    } catch (error) {
      console.warn("Error removing FTW PMTiles overlay source:", error)
    }
  }

  function renderOverlay() {
    if (visible) {
      initializeLayers()
    } else {
      cleanupLayers()
    }
  }

  function handleStyleLoad() {
    renderOverlay()
  }

  function attachStyleListener() {
    if (listeningForStyleLoad || !map?.on) return
    map.on("style.load", handleStyleLoad)
    listeningForStyleLoad = true
  }

  function detachStyleListener() {
    if (!listeningForStyleLoad || !map?.off) return
    map.off("style.load", handleStyleLoad)
    listeningForStyleLoad = false
  }

  $: if (map && visible !== undefined && year) {
    if (visible) {
      attachStyleListener()
    } else {
      detachStyleListener()
    }
    renderOverlay()
  }

  onDestroy(() => {
    pendingSelectionResolutions.clear()
    boundaryResolverWorker?.terminate?.()
    boundaryResolverWorker = null
    detachStyleListener()
    detachInteractionListeners()
    detachMapErrorListener()
    cleanupLayers()
  })
</script>
