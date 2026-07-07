/**
 * Shared thumbnail renderer — uses a POOL of Mapbox GL JS instances to render
 * spray record thumbnails in parallel, capturing each to a data URL.
 *
 * Pool size (POOL_SIZE) determines the tradeoff:
 *   More maps = faster parallel rendering but more map loads.
 *   Default 4: ~4× faster than sequential, 4 map loads per page visit.
 *
 * Results are cached in memory by record ID. Components subscribe via a
 * Svelte store to get their data URL when ready.
 */
import { writable, type Writable } from "svelte/store"
import mapboxgl from "mapbox-gl"
import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
import { calculateZoomDependentWidth } from "$lib/utils/trailGeometry"

// ---- Configuration ----
const POOL_SIZE = 4

// ---- Types ----
interface RenderRequest {
    recordId: string
    fieldBoundary: any
    record: any
}

// ---- Store: recordId -> dataUrl ----
export const thumbnailCache: Writable<Record<string, string>> = writable({})

// ---- Internals ----
const queue: RenderRequest[] = []
const seen = new Set<string>()
const completed = new Map<string, string>()
let generation = 0 // bumped on cache clear to invalidate stale worker results

interface PoolWorker {
    map: mapboxgl.Map
    container: HTMLElement
    busy: boolean
}
const pool: PoolWorker[] = []
let poolInitStarted = false

// Extract all outer ring coordinates from Polygon or MultiPolygon
function getAllOuterRings(boundary: any): [number, number][] {
    if (boundary.type === "Polygon") {
        return boundary.coordinates[0]
    } else if (boundary.type === "MultiPolygon") {
        return boundary.coordinates.flatMap((poly: number[][][]) => poly[0])
    }
    return []
}

function getBoundsFromBoundary(boundary: any): mapboxgl.LngLatBoundsLike {
    const coords = getAllOuterRings(boundary)
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of coords) {
        minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat)
        maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat)
    }
    return [[minLng, minLat], [maxLng, maxLat]] as mapboxgl.LngLatBoundsLike
}

function addGreyscaleMask(mapInstance: mapboxgl.Map, boundary: any) {
    const allRings = getAllOuterRings(boundary)
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of allRings) { minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat); maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat) }
    const lngSpan = maxLng - minLng, latSpan = maxLat - minLat
    const outerRing: [number, number][] = [
        [minLng - lngSpan * 5, minLat - latSpan * 5],
        [maxLng + lngSpan * 5, minLat - latSpan * 5],
        [maxLng + lngSpan * 5, maxLat + latSpan * 5],
        [minLng - lngSpan * 5, maxLat + latSpan * 5],
        [minLng - lngSpan * 5, minLat - latSpan * 5],
    ]
    // For multipolygon, use all outer rings as holes in the mask
    const holeRings = boundary.type === "MultiPolygon"
        ? boundary.coordinates.map((poly: number[][][]) => [...poly[0]].reverse() as [number, number][])
        : [[...boundary.coordinates[0]].reverse() as [number, number][]]

    const srcId = "tn-boundary"; const greySrcId = "tn-greyscale"
    const fillId = "tn-greyscale-fill"; const lineId = "tn-boundary-line"

    if (mapInstance.getLayer(fillId)) mapInstance.removeLayer(fillId)
    if (mapInstance.getLayer(lineId)) mapInstance.removeLayer(lineId)
    if (mapInstance.getSource(greySrcId)) mapInstance.removeSource(greySrcId)
    if (mapInstance.getSource(srcId)) mapInstance.removeSource(srcId)

    mapInstance.addSource(srcId, { type: "geojson", data: { type: "Feature", properties: {}, geometry: boundary } })
    mapInstance.addSource(greySrcId, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [outerRing, ...holeRings] } } })
    mapInstance.addLayer({ id: fillId, type: "fill", source: greySrcId, paint: { "fill-color": "#1a1a1a", "fill-opacity": 0.6 } })
    mapInstance.addLayer({ id: lineId, type: "line", source: srcId, paint: { "line-color": "#22c55e", "line-width": 2, "line-opacity": 0.8 } })
}

function cleanTrailLayers(mapInstance: mapboxgl.Map) {
    const style = mapInstance.getStyle()
    if (!style) return
    for (const layer of style.layers.filter((l: any) => l.id.startsWith("tn-trail-") || l.id.startsWith("tn-caps-"))) {
        if (mapInstance.getLayer(layer.id)) mapInstance.removeLayer(layer.id)
    }
    for (const source of Object.keys(style.sources).filter(s => s.startsWith("tn-trail-") || s.startsWith("tn-caps-"))) {
        if (mapInstance.getSource(source)) mapInstance.removeSource(source)
    }
}

function addTrailLayers(mapInstance: mapboxgl.Map, record: any) {
    const color = "#ef4444"
    const trailWidth = record.swath_width || 3

    const style = mapInstance.getStyle()
    if (!style) return

    // Clean up stale layers from previous record on this worker
    for (const layer of style.layers.filter((l: any) => l.id.startsWith("tn-trail-") || l.id.startsWith("tn-caps-"))) {
        if (mapInstance.getLayer(layer.id)) mapInstance.removeLayer(layer.id)
    }
    for (const source of Object.keys(style.sources).filter(s => s.startsWith("tn-trail-") || s.startsWith("tn-caps-"))) {
        if (mapInstance.getSource(source)) mapInstance.removeSource(source)
    }

    if (record.interval_paths?.length) {
        for (let i = 0; i < record.interval_paths.length; i++) {
            const interval = record.interval_paths[i]
            if (!interval.path_geojson?.coordinates || interval.path_geojson.coordinates.length < 2) continue
            const id = `tn-trail-${i}`
            mapInstance.addSource(id, { type: "geojson", data: { type: "Feature", properties: {}, geometry: interval.path_geojson } })
            mapInstance.addLayer({ id, type: "line", source: id, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": color, "line-width": calculateZoomDependentWidth(trailWidth, 1), "line-opacity": 0.85 } })

            const coords = interval.path_geojson.coordinates
            if (coords.length >= 2) {
                const capId = `tn-caps-${i}`
                const start = coords[0], end = coords[coords.length - 1], dx = 0.00002
                mapInstance.addSource(capId, {
                    type: "geojson", data: {
                        type: "FeatureCollection", features: [
                            { type: "Feature", properties: { t: "s" }, geometry: { type: "LineString", coordinates: [start, [start[0] + dx, start[1]]] } },
                            { type: "Feature", properties: { t: "e" }, geometry: { type: "LineString", coordinates: [end, [end[0] + dx, end[1]]] } },
                        ]
                    }
                })
                mapInstance.addLayer({ id: `${capId}-s`, type: "line", source: capId, paint: { "line-color": "#ffffff", "line-width": calculateZoomDependentWidth(trailWidth, 2), "line-opacity": 0.9 }, filter: ["==", ["get", "t"], "s"] })
                mapInstance.addLayer({ id: `${capId}-e`, type: "line", source: capId, paint: { "line-color": color, "line-width": calculateZoomDependentWidth(trailWidth, 2), "line-opacity": 0.9 }, filter: ["==", ["get", "t"], "e"] })
            }
        }
    } else if (record.field_path?.coordinates?.length) {
        const id = "tn-trail-0"
        mapInstance.addSource(id, { type: "geojson", data: { type: "Feature", properties: {}, geometry: record.field_path } })
        mapInstance.addLayer({ id, type: "line", source: id, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": color, "line-width": calculateZoomDependentWidth(trailWidth, 1), "line-opacity": 0.85 } })
    }
}

async function processOnWorker(worker: PoolWorker): Promise<void> {
    if (worker.busy || queue.length === 0) return
    worker.busy = true

    const req = queue.shift()!
    const { recordId, fieldBoundary, record } = req
    const myGeneration = generation // snapshot generation at start

    try {
        const firstRing = fieldBoundary.type === "MultiPolygon" ? fieldBoundary.coordinates[0][0] : fieldBoundary.coordinates[0]
        const fp = (firstRing as any)[0]
        const bbox = getBoundsFromBoundary(fieldBoundary) as any
        console.log(`[Thumbnail] Worker record=${recordId.slice(0, 8)} field=${record.field_name || "?"} firstCoord=[${fp[0]},${fp[1]}] bbox=[[${bbox[0][0]},${bbox[0][1]}],[${bbox[1][0]},${bbox[1][1]}]] intervals=${record.interval_paths?.length || 0} hasFieldPath=${!!record.field_path?.coordinates?.length}`)

        // Clean up old layers BEFORE moving the map (prevents stale trails
        // from showing on the next record's thumbnail)
        try { cleanTrailLayers(worker.map) } catch (_) { /* map style not ready yet */ }

        // Set up ALL layers FIRST, then move the map, then wait for idle.
        // This ensures the capture sees the correct boundary + trails together.
        addGreyscaleMask(worker.map, fieldBoundary)
        addTrailLayers(worker.map, record)
        worker.map.fitBounds(getBoundsFromBoundary(fieldBoundary), { padding: 5, animate: false })

        // Wait for the map to be fully loaded and rendered.
        // Use a two-phase approach: wait for "idle" (all tiles loaded),
        // then wait one more animation frame for the GPU to finish painting.
        await new Promise<void>(resolve => {
            const onIdle = () => {
                worker.map.off("idle", onIdle)
                // One more frame to ensure GPU has painted the final result
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            }
            worker.map.on("idle", onIdle)
            // Hard timeout — if idle never fires (e.g. map stuck), still capture
            setTimeout(() => {
                worker.map.off("idle", onIdle)
                resolve()
            }, 8000)
        })

        const dataUrl = worker.map.getCanvas().toDataURL("image/png")
        if (dataUrl) {
            // Discard result if the cache was cleared (generation changed) while we were rendering
            if (myGeneration !== generation) {
                console.log(`[Thumbnail] Stale result discarded for record=${recordId.slice(0, 8)} (generation changed)`)
            } else {
                console.log(`[Thumbnail] Captured record=${recordId.slice(0, 8)} dataUrl=${dataUrl.slice(0, 40)}...`)
                completed.set(recordId, dataUrl)
                thumbnailCache.update(cache => ({ ...cache, [recordId]: dataUrl }))
            }
        }
    } catch (e) {
        console.error(`[ThumbnailRenderer] Failed ${recordId}:`, e)
    }

    worker.busy = false

    // Grab next job immediately
    if (queue.length > 0) {
        processOnWorker(worker)
    }
}

function drainQueue() {
    for (const worker of pool) {
        if (!worker.busy && queue.length > 0) {
            processOnWorker(worker)
        }
    }
}

function initPool() {
    if (poolInitStarted) return
    poolInitStarted = true

    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN

    for (let i = 0; i < POOL_SIZE; i++) {
        const container = document.createElement("div")
        container.style.cssText = `position:fixed;top:0;left:${i * 130}px;width:120px;height:90px;opacity:0;pointer-events:none;z-index:-1`
        document.body.appendChild(container)

        const mapInstance = new mapboxgl.Map({
            container,
            style: "mapbox://styles/mapbox/satellite-v9",
            center: [0, 0],
            zoom: 1,
            interactive: false,
            attributionControl: false,
            preserveDrawingBuffer: true,
        })

        const worker: PoolWorker = { map: mapInstance, container, busy: true } // busy until load fires
        pool.push(worker)

        mapInstance.on("load", () => {
            worker.busy = false
            drainQueue()
        })

        // Fallback: if load never fires, force-ready after 10 seconds
        setTimeout(() => {
            if (worker.busy) {
                worker.busy = false
                drainQueue()
            }
        }, 10000)
    }
}

export function requestThumbnail(req: RenderRequest): void {
    if (completed.has(req.recordId) || seen.has(req.recordId)) return
    seen.add(req.recordId)
    queue.push(req)

    initPool()
    drainQueue()
}

export function getCachedThumbnail(recordId: string): string | undefined {
    return completed.get(recordId)
}

// Clear the in-memory cache between page visits to prevent stale thumbnails.
// Bumps the generation counter so any in-flight pool workers discard their
// results instead of writing stale data into the fresh cache.
export function clearThumbnailCache(): void {
    generation++
    queue.length = 0
    completed.clear()
    seen.clear()
    thumbnailCache.set({})
}

export function destroyThumbnailRenderer(): void {
    queue.length = 0
    seen.clear()
    completed.clear()
    thumbnailCache.set({})
    for (const worker of pool) {
        worker.map.remove()
        if (worker.container.parentNode) worker.container.parentNode.removeChild(worker.container)
    }
    pool.length = 0
    poolInitStarted = false
}
