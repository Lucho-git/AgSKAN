// src/lib/utils/fieldSnapshot.ts
// Builds Mapbox Static Images API URLs for field snapshots with trail overlays.
// Uses the satellite-v9 style with GeoJSON overlays (field boundary + trail paths).
// Greyscales the area outside the field to emphasize the internal.

import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"

const MAPBOX_STATIC_BASE = "https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static"
const DEFAULT_WIDTH = 400
const DEFAULT_HEIGHT = 300

// Distinct colors for each interval (re-entry) within a single record
const INTERVAL_COLORS = [
    "#ef4444", // red
    "#3b82f6", // blue
    "#22c55e", // green
    "#f97316", // orange
    "#a855f7", // purple
    "#06b6d4", // cyan
    "#eab308", // yellow
    "#ec4899", // pink
]

export interface IntervalPath {
    entry_time: string
    exit_time: string
    path_geojson: {
        type: "LineString"
        coordinates: [number, number][]
    }
}

export interface SprayRecordSnapshot {
    field_path?: {
        type: "LineString"
        coordinates: [number, number][]
    }
    interval_paths?: IntervalPath[]
    trail_color?: string
    operator_name?: string
    vehicle_type?: string
    start_time?: string
}

/**
 * Simplify a GeoJSON LineString by removing points that are too close together.
 * Keeps the URL under Mapbox's 8,192 character limit.
 */
function simplifyLineString(
    coordinates: [number, number][],
    tolerance = 0.00001
): [number, number][] {
    if (coordinates.length <= 2) return [roundCoords(coordinates[0]), roundCoords(coordinates[coordinates.length - 1])]

    const result: [number, number][] = [roundCoords(coordinates[0])]
    let lastKept = coordinates[0]

    for (let i = 1; i < coordinates.length - 1; i++) {
        const dx = coordinates[i][0] - lastKept[0]
        const dy = coordinates[i][1] - lastKept[1]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist >= tolerance) {
            result.push(roundCoords(coordinates[i]))
            lastKept = coordinates[i]
        }
    }
    result.push(roundCoords(coordinates[coordinates.length - 1]))
    return result
}

function roundCoords(c: [number, number]): [number, number] {
    return [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5]
}

/** Strip CRS from PostGIS GeoJSON (unnecessary for Mapbox, saves 55 chars). */
function stripCrs(geometry: any): any {
    if (geometry?.crs) {
        const { crs, ...rest } = geometry
        return rest
    }
    return geometry
}

/**
 * Get the first and last points of a LineString (for entry/exit markers).
 */
function getEndpoints(coords: [number, number][]): { entry: [number, number]; exit: [number, number] } | null {
    if (coords.length < 2) return null
    return { entry: coords[0], exit: coords[coords.length - 1] }
}

/**
 * Get the bounding box of a GeoJSON Polygon/MultiPolygon.
 */
function getBBox(boundary: { type: string; coordinates: number[][][] | number[][][][] }): [number, number, number, number] {
    const allCoords = boundary.type === "Polygon"
        ? boundary.coordinates[0]
        : boundary.coordinates[0][0]
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of allCoords) {
        minLng = Math.min(minLng, lng)
        minLat = Math.min(minLat, lat)
        maxLng = Math.max(maxLng, lng)
        maxLat = Math.max(maxLat, lat)
    }
    return [minLng, minLat, maxLng, maxLat]
}

/**
 * Create circle polygon features for static map overlays.
 * Draws a filled outer circle with a smaller inner circle on top,
 * creating a "ring" effect (outer color ring + inner color dot).
 * Returns an array of 2 GeoJSON Features to be spread into the features array.
 */
/** Create a visible endpoint cap: a short thick LineString at the given point. */
function makeCircleFeatures(
    center: [number, number],
    outerColor: string,
    _innerColor: string,
    _opacity: number = 0.9
): object[] {
    // Draw a 2-coordinate LineString at the endpoint — renders as a thick cap.
    // Using a very short segment at high width creates a visible dot.
    const dx = 0.00002  // tiny offset to make a visible "dot"
    return [{
        type: "Feature",
        properties: { stroke: `#${outerColor}`, "stroke-width": 8, "stroke-opacity": 0.9 },
        geometry: { type: "LineString", coordinates: [center, [center[0] + dx, center[1]]] },
    }]
}

/**
 * Build a GeoJSON FeatureCollection for the overlay:
 * - Field boundary (green semi-transparent fill + outline)
 * - A large grey polygon covering the whole viewport EXCEPT the field (greyscale effect)
 * - Trail paths (color-coded per interval, separate for gap rendering)
 * - Start/stop markers (filled circle at start, white-filled circle at end)
 */
function buildOverlayGeoJSON(
    fieldBoundary: { type: string; coordinates: number[][][] | number[][][][] },
    records: SprayRecordSnapshot[],
    options?: {
        showMarkers?: boolean
        greyscaleOutside?: boolean
    }
): object {
    const features: object[] = []
    const showMarkers = options?.showMarkers ?? true
    const greyscaleOutside = options?.greyscaleOutside ?? true

    const [minLng, minLat, maxLng, maxLat] = getBBox(fieldBoundary)
    const lngSpan = maxLng - minLng
    const latSpan = maxLat - minLat

    // ── Greyscale outside: draw a large rectangle with a hole for the field.
    //    The rectangle is 10x the field bbox to ensure it covers the entire image
    //    (the image is framed to the field bbox, so 10x is always enough).
    if (greyscaleOutside) {
        const lngPad = lngSpan * 5
        const latPad = latSpan * 5
        const outerRing: [number, number][] = [
            [minLng - lngPad, minLat - latPad],
            [maxLng + lngPad, minLat - latPad],
            [maxLng + lngPad, maxLat + latPad],
            [minLng - lngPad, maxLat + latPad],
            [minLng - lngPad, minLat - latPad],
        ]

        const fieldRing = fieldBoundary.type === "Polygon"
            ? fieldBoundary.coordinates[0]
            : fieldBoundary.coordinates[0][0]
        const holeRing = [...fieldRing].reverse() as [number, number][]

        features.push({
            type: "Feature",
            properties: {
                fill: "#1a1a1a",
                "fill-opacity": 0.6,
                stroke: "#22c55e",
                "stroke-width": 2,
                "stroke-opacity": 0.8,
            },
            geometry: {
                type: "Polygon",
                coordinates: [outerRing, holeRing],
            },
        })
    }
    // NOTE: No separate field boundary feature — the grey box hole
    // already renders the boundary outline with the green stroke above.

    // ── Trail paths + start/end circles
    let intervalIdx = 0
    let skippedPaths = 0
    for (const record of records) {
        if (record.interval_paths && record.interval_paths.length > 0) {
            for (const interval of record.interval_paths) {
                // Skip paths with fewer than 2 coordinates — invalid LineString
                if (!interval.path_geojson?.coordinates || interval.path_geojson.coordinates.length < 2) {
                    skippedPaths++
                    continue
                }
                const color = INTERVAL_COLORS[intervalIdx % INTERVAL_COLORS.length]
                const simplified = simplifyLineString(interval.path_geojson.coordinates)

                // Trail line
                features.push({
                    type: "Feature",
                    properties: {
                        stroke: color,
                        "stroke-width": 3,
                        "stroke-opacity": 0.9,
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: simplified,
                    },
                })

                // Start/end circles — no Mapbox markers, use polygon circles
                if (showMarkers) {
                    const endpoints = getEndpoints(simplified)
                    if (endpoints) {
                        // Start: white outer circle, colored inner (white ring with colored dot)
                        features.push(...makeCircleFeatures(endpoints.entry, "ffffff", color.replace("#", ""), 0.9))
                        // End: colored outer circle, white inner (colored ring with white dot)
                        features.push(...makeCircleFeatures(endpoints.exit, color.replace("#", ""), "ffffff", 0.9))
                    }
                }
                intervalIdx++
            }
        } else if (record.field_path?.coordinates?.length) {
            const color = INTERVAL_COLORS[intervalIdx % INTERVAL_COLORS.length]
            const simplified = simplifyLineString(record.field_path.coordinates)
            features.push({
                type: "Feature",
                properties: {
                    stroke: color,
                    "stroke-width": 3,
                    "stroke-opacity": 0.9,
                },
                geometry: {
                    type: "LineString",
                    coordinates: simplified,
                },
            })

            if (showMarkers) {
                const endpoints = getEndpoints(simplified)
                if (endpoints) {
                    features.push(...makeCircleFeatures(endpoints.entry, "ffffff", color.replace("#", ""), 0.9))
                    features.push(...makeCircleFeatures(endpoints.exit, color.replace("#", ""), "ffffff", 0.9))
                }
            }
            intervalIdx++
        }
    }

    if (skippedPaths > 0) {
        console.warn(`[fieldSnapshot] Skipped ${skippedPaths} interval path(s) with < 2 coordinates`)
    }

    return {
        type: "FeatureCollection",
        features,
    }
}

/**
 * Build a Mapbox Static Images API URL for a field snapshot.
 *
 * @param fieldBoundary - GeoJSON Polygon/MultiPolygon of the field boundary
 * @param records - Spray records with trail paths to overlay
 * @param options - Width, height, show markers, greyscale outside
 * @returns URL string for use in <img src="...">
 */
export function getFieldSnapshotUrl(
    fieldBoundary: { type: string; coordinates: number[][][] | number[][][][] },
    records: SprayRecordSnapshot[],
    options?: {
        width?: number
        height?: number
        showMarkers?: boolean
        greyscaleOutside?: boolean
    }
): string {
    const width = options?.width ?? DEFAULT_WIDTH
    const height = options?.height ?? DEFAULT_HEIGHT

    const overlay = buildOverlayGeoJSON(fieldBoundary, records, {
        showMarkers: options?.showMarkers,
        greyscaleOutside: options?.greyscaleOutside,
    })
    const overlayJson = JSON.stringify(overlay)
    const encoded = encodeURIComponent(overlayJson)

    // Use bbox (field bounds) to frame the image — not auto (which would include the grey rectangle)
    const [minLng, minLat, maxLng, maxLat] = getBBox(fieldBoundary)
    const lngPad = (maxLng - minLng) * 0.05
    const latPad = (maxLat - minLat) * 0.05
    const bbox = `[${minLng - lngPad},${minLat - latPad},${maxLng + lngPad},${maxLat + latPad}]`

    // Check URL length — Mapbox limit is 8,192 characters
    const fullUrl = `${MAPBOX_STATIC_BASE}/geojson(${encoded})/${bbox}/${width}x${height}@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}&attribution=false&logo=false`
    if (fullUrl.length > 8192) {
        console.warn(`[fieldSnapshot] URL too long (${fullUrl.length} chars). Overlay: ${overlayJson.length} chars, geo features: ${overlay.features?.length || 0}`)
        // Log per-feature size to find the culprit
        if (overlay.features) {
            for (let i = 0; i < overlay.features.length; i++) {
                const f = (overlay as any).features[i]
                const fStr = JSON.stringify(f)
                if (fStr.length > 500) {
                    console.warn(`  Feature ${i}: ${fStr.length} chars, type=${f.geometry?.type}, coords=${f.geometry?.coordinates?.length ?? '?'}`)
                }
            }
        }
    }
    console.log(`[fieldSnapshot] Generated URL: ${fullUrl.length} chars, overlay: ${overlayJson.length} chars, ${(overlay as any).features?.length || 0} features`)

    return fullUrl
}

/**
 * Build a snapshot for a single spray record (field boundary + that record's trail).
 * Intervals are color-coded, entry/exit marked with dots.
 */
export function getRecordSnapshotUrl(
    fieldBoundary: { type: string; coordinates: number[][][] | number[][][][] },
    record: SprayRecordSnapshot,
    options?: {
        width?: number
        height?: number
        showMarkers?: boolean
        greyscaleOutside?: boolean
    }
): string {
    return getFieldSnapshotUrl(fieldBoundary, [record], options)
}

/**
 * Build a snapshot for a field with ALL spray records overlaid (timeline view).
 * Each record gets a distinct color, intervals within a record share that color.
 */
export function getFieldHistorySnapshotUrl(
    fieldBoundary: { type: string; coordinates: number[][][] | number[][][][] },
    records: SprayRecordSnapshot[],
    options?: {
        width?: number
        height?: number
    }
): string {
    const width = options?.width ?? DEFAULT_WIDTH
    const height = options?.height ?? DEFAULT_HEIGHT

    const features: object[] = []

    // Greyscale outside — use 10x bbox for full coverage
    const [minLng, minLat, maxLng, maxLat] = getBBox(fieldBoundary)
    const lngSpan = maxLng - minLng
    const latSpan = maxLat - minLat
    const lngPad = lngSpan * 5
    const latPad = latSpan * 5
    const outerRing: [number, number][] = [
        [minLng - lngPad, minLat - latPad],
        [maxLng + lngPad, minLat - latPad],
        [maxLng + lngPad, maxLat + latPad],
        [minLng - lngPad, maxLat + latPad],
        [minLng - lngPad, minLat - latPad],
    ]
    const fieldRing = fieldBoundary.type === "Polygon"
        ? fieldBoundary.coordinates[0]
        : fieldBoundary.coordinates[0][0]
    const holeRing = [...fieldRing].reverse() as [number, number][]

    features.push({
        type: "Feature",
        properties: { fill: "#1a1a1a", "fill-opacity": 0.6, stroke: "#22c55e", "stroke-width": 2, "stroke-opacity": 0.6 },
        geometry: { type: "Polygon", coordinates: [outerRing, holeRing] },
    })
    // NOTE: No separate field boundary — green stroke on the grey box renders it.

    // All trail paths — color per record, opacity by age
    records.forEach((record, i) => {
        const color = INTERVAL_COLORS[i % INTERVAL_COLORS.length]
        const opacity = 0.4 + (0.6 * (i + 1)) / records.length

        if (record.interval_paths?.length) {
            for (const interval of record.interval_paths) {
                if (!interval.path_geojson?.coordinates || interval.path_geojson.coordinates.length < 2) continue
                const simplified = simplifyLineString(interval.path_geojson.coordinates)
                features.push({
                    type: "Feature",
                    properties: { stroke: color, "stroke-width": 2, "stroke-opacity": opacity },
                    geometry: { type: "LineString", coordinates: simplified },
                })
            }
        } else if (record.field_path?.coordinates && record.field_path.coordinates.length >= 2) {
            const simplified = simplifyLineString(record.field_path.coordinates)
            features.push({
                type: "Feature",
                properties: { stroke: color, "stroke-width": 2, "stroke-opacity": opacity },
                geometry: { type: "LineString", coordinates: simplified },
            })
        }
    })

    const overlay = { type: "FeatureCollection", features }
    const encoded = encodeURIComponent(JSON.stringify(overlay))
    // Use bbox for framing (not auto, which would include the grey rectangle)
    const bLngPad = lngSpan * 0.05
    const bLatPad = latSpan * 0.05
    const bbox = `[${minLng - bLngPad},${minLat - bLatPad},${maxLng + bLngPad},${maxLat + bLatPad}]`
    return `${MAPBOX_STATIC_BASE}/geojson(${encoded})/${bbox}/${width}x${height}@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}&attribution=false&logo=false`
}