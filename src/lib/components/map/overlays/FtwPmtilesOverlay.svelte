<!-- src/lib/components/map/overlays/FtwPmtilesOverlay.svelte -->
<script>
  import { createEventDispatcher, onDestroy } from "svelte"
  import * as turf from "@turf/turf"

  export let map
  export let visible = false
  export let year = 2025

  const dispatch = createEventDispatcher()
  const MAX_SELECTABLE_AREA_HECTARES = 2500
  const ftwPmtilesUrl =
    "https://data.source.coop/ftw/global-data/predictions/vectors/alpha/global.pmtiles"
  const clientPmtilesTilePath = "/ftw-client-pmtiles"
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
  const PREMERGE_MAX_ITERATIONS = 3
  const PREMERGE_MAX_RINGS_PER_FEATURE = 10
  const PREMERGE_MAX_POINTS_PER_RING = 80
  const premergeCache = new Map()
  let boundaryResolverWorker = null
  let resolverRequestId = 0
  let selectionLoadingToken = 0
  let selectionLoadingAnimationFrame = null
  let selectionLoadingState = null
  const pendingSelectionResolutions = new Map()
  let clientPmtilesServiceWorkerReady = false
  let clientPmtilesServiceWorkerPromise = null

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

  async function prepareClientPmtilesServiceWorker() {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      console.warn("[FTW PMTiles] Service workers are unavailable")
      return false
    }

    if (navigator.serviceWorker.controller) return true

    try {
      await navigator.serviceWorker.register("/service-worker.js")
      await navigator.serviceWorker.ready
      return await waitForServiceWorkerController()
    } catch (error) {
      console.warn(
        "[FTW PMTiles] Could not prepare client PMTiles service worker",
        error,
      )
      return false
    }
  }

  function ensureClientPmtilesServiceWorkerReady() {
    if (clientPmtilesServiceWorkerReady) return true
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return false
    }
    if (navigator.serviceWorker.controller) {
      clientPmtilesServiceWorkerReady = true
      return true
    }

    if (!clientPmtilesServiceWorkerPromise) {
      clientPmtilesServiceWorkerPromise = prepareClientPmtilesServiceWorker()
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

  function hashString(value) {
    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index)
      hash |= 0
    }
    return Math.abs(hash).toString(36)
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

  function getOuterRings(geometry) {
    if (geometry?.type === "Polygon")
      return [geometry.coordinates?.[0]].filter(Boolean)
    if (geometry?.type === "MultiPolygon") {
      return (geometry.coordinates || [])
        .map((polygon) => polygon?.[0])
        .filter(Boolean)
        .slice(0, PREMERGE_MAX_RINGS_PER_FEATURE)
    }
    return []
  }

  function sampleRing(ring) {
    if (!ring?.length || ring.length <= PREMERGE_MAX_POINTS_PER_RING) {
      return ring || []
    }

    const step = ring.length / PREMERGE_MAX_POINTS_PER_RING
    const sampled = []
    for (let index = 0; index < PREMERGE_MAX_POINTS_PER_RING; index += 1) {
      sampled.push(ring[Math.floor(index * step)])
    }
    return sampled
  }

  function getRingBounds(ring) {
    return getGeometryBoundsFromCoordinates(ring)
  }

  function boundsOverlap(boundsA, boundsB) {
    if (!boundsA || !boundsB) return false
    return !(
      boundsA.maxLng < boundsB.minLng ||
      boundsB.maxLng < boundsA.minLng ||
      boundsA.maxLat < boundsB.minLat ||
      boundsB.maxLat < boundsA.minLat
    )
  }

  function pointOnSegment(point, start, end) {
    const cross =
      (point[1] - start[1]) * (end[0] - start[0]) -
      (point[0] - start[0]) * (end[1] - start[1])
    if (Math.abs(cross) > 1e-12) return false

    const dot =
      (point[0] - start[0]) * (end[0] - start[0]) +
      (point[1] - start[1]) * (end[1] - start[1])
    if (dot < 0) return false

    const squaredLength =
      (end[0] - start[0]) * (end[0] - start[0]) +
      (end[1] - start[1]) * (end[1] - start[1])
    return dot <= squaredLength
  }

  function pointInRing(point, ring) {
    if (!point || !ring?.length) return false
    let inside = false

    for (
      let index = 0, previous = ring.length - 1;
      index < ring.length;
      previous = index++
    ) {
      const currentPoint = ring[index]
      const previousPoint = ring[previous]
      if (pointOnSegment(point, previousPoint, currentPoint)) return true

      const intersects =
        currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
        point[0] <
          ((previousPoint[0] - currentPoint[0]) *
            (point[1] - currentPoint[1])) /
            (previousPoint[1] - currentPoint[1]) +
            currentPoint[0]
      if (intersects) inside = !inside
    }

    return inside
  }

  function segmentDirection(a, b, c) {
    return (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1])
  }

  function segmentsIntersect(a, b, c, d) {
    if (
      !boundsOverlap(
        getGeometryBoundsFromCoordinates([a, b]),
        getGeometryBoundsFromCoordinates([c, d]),
      )
    ) {
      return false
    }

    const direction1 = segmentDirection(c, d, a)
    const direction2 = segmentDirection(c, d, b)
    const direction3 = segmentDirection(a, b, c)
    const direction4 = segmentDirection(a, b, d)

    if (
      ((direction1 > 0 && direction2 < 0) ||
        (direction1 < 0 && direction2 > 0)) &&
      ((direction3 > 0 && direction4 < 0) || (direction3 < 0 && direction4 > 0))
    ) {
      return true
    }

    return (
      (Math.abs(direction1) < 1e-12 && pointOnSegment(a, c, d)) ||
      (Math.abs(direction2) < 1e-12 && pointOnSegment(b, c, d)) ||
      (Math.abs(direction3) < 1e-12 && pointOnSegment(c, a, b)) ||
      (Math.abs(direction4) < 1e-12 && pointOnSegment(d, a, b))
    )
  }

  function ringEdgesIntersect(ringA, ringB) {
    if (ringA.length < 2 || ringB.length < 2) return false
    const sampledA = sampleRing(ringA)
    const sampledB = sampleRing(ringB)

    for (let indexA = 0; indexA < sampledA.length - 1; indexA += 1) {
      for (let indexB = 0; indexB < sampledB.length - 1; indexB += 1) {
        if (
          segmentsIntersect(
            sampledA[indexA],
            sampledA[indexA + 1],
            sampledB[indexB],
            sampledB[indexB + 1],
          )
        ) {
          return true
        }
      }
    }

    return false
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

  function getFeaturesScreenBox(features, fallbackPoint = null) {
    return (features || []).reduce((combined, feature) => {
      const box = getFeatureScreenBox(feature, fallbackPoint)
      if (!box) return combined
      return combined ? combineScreenBoxes(combined, box) : box
    }, null)
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

  function screenBoxContains(container, child) {
    if (!container || !child) return false
    return (
      container.minX <= child.minX + 1 &&
      container.minY <= child.minY + 1 &&
      container.maxX >= child.maxX - 1 &&
      container.maxY >= child.maxY - 1
    )
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

  function buildOverlappingGroup(seed, candidates) {
    let group = [seed]
    let remaining = candidates.filter(
      (feature) =>
        getFeatureGeometryKey(feature) !== getFeatureGeometryKey(seed),
    )
    let changed = true

    while (changed) {
      changed = false
      const nextRemaining = []

      remaining.forEach((candidate) => {
        const overlapsGroup = group.some((groupFeature) =>
          featuresMeaningfullyOverlap(groupFeature, candidate),
        )
        if (overlapsGroup) {
          group.push(candidate)
          changed = true
        } else {
          nextRemaining.push(candidate)
        }
      })

      remaining = nextRemaining
    }

    return group
  }

  function unionFeatures(features) {
    if (!features?.length) return null
    if (features.length === 1) return features[0]

    try {
      return turf.union(turf.featureCollection(features))
    } catch (error) {
      try {
        return features.slice(1).reduce((result, feature) => {
          return turf.union(turf.featureCollection([result, feature])) || result
        }, features[0])
      } catch (fallbackError) {
        console.warn("[FTW PMTiles] Could not premerge clicked field group", {
          error,
          fallbackError,
          count: features.length,
        })
        return null
      }
    }
  }

  function buildGroupedGeometry(features) {
    const polygonCoordinates = []
    ;(features || []).forEach((feature) => {
      const geometry = cloneGeometry(feature?.geometry)
      if (geometry?.type === "Polygon") {
        polygonCoordinates.push(geometry.coordinates)
      } else if (geometry?.type === "MultiPolygon") {
        polygonCoordinates.push(...geometry.coordinates)
      }
    })

    if (!polygonCoordinates.length) return null
    return polygonCoordinates.length === 1
      ? { type: "Polygon", coordinates: polygonCoordinates[0] }
      : { type: "MultiPolygon", coordinates: polygonCoordinates }
  }

  function createImmediateSelection(feature, pointFeatures = [], point = null) {
    const featureKey = getFeatureGeometryKey(feature)
    const pendingKey = `pmtiles-resolving-${year}-${hashString(
      featureKey || JSON.stringify(feature?.geometry || {}),
    )}`
    const geometry = cloneGeometry(feature?.geometry)

    return {
      feature: {
        type: "Feature",
        geometry,
        properties: {
          ...(feature?.properties || {}),
          ftw_id: pendingKey,
          selection_key: pendingKey,
          resolving_boundary: true,
          boundary_resolved: false,
          premerged_from_visible_count: 1,
          premerged_selection_mode: "pending_worker_union",
          premerged_area_pending: true,
        },
      },
      features: pointFeatures?.length ? pointFeatures : [feature],
      pendingKey,
      candidates: collectResolverCandidateFeatures(
        feature,
        pointFeatures,
        point,
      ),
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

  function resolveSelectionInWorker(selection) {
    const worker = getBoundaryResolverWorker()
    if (!worker || !selection?.feature) return

    const requestId = ++resolverRequestId
    worker.postMessage({
      requestId,
      pendingKey: selection.pendingKey,
      seedFeature: selection.feature,
      candidates: selection.candidates,
      areaFilter: getSelectionAreaFilter(),
    })
  }

  function getGroupSelectionKey(features) {
    const keys = (features || [])
      .map(getFeatureGeometryKey)
      .filter(Boolean)
      .sort()
    return `pmtiles-premerge-${year}-${hashString(keys.join("|"))}`
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

  function featuresMeaningfullyOverlap(featureA, featureB) {
    if (!featureA?.geometry || !featureB?.geometry) return false
    if (getFeatureGeometryKey(featureA) === getFeatureGeometryKey(featureB)) {
      return true
    }

    try {
      const bboxA = turf.bbox(featureA)
      const bboxB = turf.bbox(featureB)
      if (
        bboxA[2] < bboxB[0] ||
        bboxB[2] < bboxA[0] ||
        bboxA[3] < bboxB[1] ||
        bboxB[3] < bboxA[1]
      ) {
        return false
      }

      if (
        turf.booleanOverlap(featureA, featureB) ||
        turf.booleanContains(featureA, featureB) ||
        turf.booleanContains(featureB, featureA)
      ) {
        return true
      }
    } catch (error) {
      // Fall through to the exact intersection-area check.
    }

    try {
      const intersection = turf.intersect(
        turf.featureCollection([featureA, featureB]),
      )
      return intersection ? turf.area(intersection) > 1 : false
    } catch (error) {
      return false
    }
  }

  function findOverlappingVisibleGroup(
    seedFeature,
    pointFeatures = [],
    point = null,
  ) {
    const seedKey = getFeatureGeometryKey(seedFeature)
    const cached = getCachedPremerge(seedKey)
    if (cached) return cached

    const seedGeometry = cloneGeometry(seedFeature?.geometry)
    if (!["Polygon", "MultiPolygon"].includes(seedGeometry?.type)) {
      return { feature: seedFeature, features: pointFeatures || [] }
    }
    const seed = {
      type: "Feature",
      geometry: seedGeometry,
      properties: seedFeature?.properties || {},
    }

    let searchBox = combineScreenBoxes(
      getFeatureScreenBox(seed, point),
      point
        ? expandScreenBox(
            {
              minX: point.x,
              minY: point.y,
              maxX: point.x,
              maxY: point.y,
            },
            PREMERGE_QUERY_RADIUS_PX,
          )
        : null,
    )
    let group = [seed]

    for (let index = 0; index < PREMERGE_MAX_ITERATIONS; index += 1) {
      const rawCandidates = dedupeFeatures([
        ...(pointFeatures || []),
        ...getFieldFeaturesInScreenBox(searchBox),
        ...(index === 0 ? getNearbyFieldFeatures(point) : []),
      ])

      if (rawCandidates.length > PREMERGE_FEATURE_LIMIT) {
        console.info("[FTW PMTiles] Premerge capped dense click area", {
          rawCount: rawCandidates.length,
          limit: PREMERGE_FEATURE_LIMIT,
        })
      }

      const candidates = rawCandidates
        .slice(0, PREMERGE_FEATURE_LIMIT)
        .map((feature) => ({
          type: "Feature",
          geometry: cloneGeometry(feature?.geometry),
          properties: feature?.properties || {},
        }))
        .filter((feature) =>
          ["Polygon", "MultiPolygon"].includes(feature?.geometry?.type),
        )
        .filter(Boolean)
      const nextGroup = buildOverlappingGroup(seed, candidates)
      const nextBox = getFeaturesScreenBox(nextGroup, point)
      const expandedNextBox = expandScreenBox(nextBox, PREMERGE_BOX_PADDING_PX)
      const isStable =
        nextGroup.length === group.length &&
        screenBoxContains(searchBox, expandedNextBox)

      group = nextGroup
      if (isStable || !expandedNextBox) break
      searchBox = combineScreenBoxes(searchBox, expandedNextBox)
    }

    if (group.length <= 1) {
      return setCachedPremergeForGroup(group, {
        feature: seedFeature,
        features: [seedFeature],
      })
    }

    const groupSelectionKey = getGroupSelectionKey(group)
    const merged = unionFeatures(group)
    if (!merged?.geometry) {
      return setCachedPremergeForGroup(group, {
        feature: seedFeature,
        features: group,
      })
    }

    const rawAreaHa =
      Math.round((turf.area(turf.featureCollection(group)) / 10000) * 100) / 100
    const mergedAreaHa = Math.round((turf.area(merged) / 10000) * 100) / 100

    return setCachedPremergeForGroup(group, {
      feature: {
        type: "Feature",
        geometry: merged.geometry,
        properties: {
          ...(seedFeature?.properties || {}),
          ftw_id: groupSelectionKey,
          selection_key: groupSelectionKey,
          premerged_from_visible_count: group.length,
          premerged_raw_area_ha: rawAreaHa,
          premerged_area_ha: mergedAreaHa,
          premerged_overlap_removed_ha: Math.max(0, rawAreaHa - mergedAreaHa),
          premerged_selection_mode: "overlapping_visible_geometries",
          premerged_exact_union: true,
          premerged_deferred_union: false,
          premerged_area_pending: false,
        },
      },
      features: group,
    })
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
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 4.5],
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
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3.2, 14, 5],
      },
    })

    addTopLayer({
      id: layerIds.loadingHalo,
      type: "circle",
      source: loadingSourceId,
      paint: {
        "circle-color": "#f59e0b",
        "circle-opacity": 0.24,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 11, 14, 18],
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3.5, 14, 5],
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
          const selection = findOverlappingVisibleGroup(
            feature,
            features.length ? features : [feature],
            point,
          )
          handleResolvedSelection(selection, { lngLat, point, source })
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

  function initializeLayers() {
    if (!map || !styleReady()) return false

    try {
      if (!map.getSource(sourceId)) {
        const sourceConfig = getFtwSourceConfig()
        if (
          sourceConfig.mode === "client-pmtiles" &&
          !ensureClientPmtilesServiceWorkerReady()
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
        minzoom: 9,
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
        minzoom: 9,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#111827",
          "line-opacity": 0.55,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 14, 2.4],
        },
      })

      addLayer({
        id: layerIds.line,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: 9,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": "#fbbf24",
          "line-opacity": 0.9,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.35, 14, 1.5],
        },
      })

      ensureSelectionLoadingLayers()

      attachInteractionListeners()
      return true
    } catch (error) {
      console.error("Error initializing FTW PMTiles overlay:", error)
      return false
    }
  }

  function cleanupLayers() {
    const currentMap = map
    if (!currentMap?.getLayer || !currentMap?.getSource) return

    try {
      detachInteractionListeners()
    } catch (error) {
      console.warn("Error detaching FTW PMTiles listeners:", error)
    }

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
    cleanupLayers()
  })
</script>
