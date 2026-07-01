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
    if (coordinates.length <= 2) return coordinates

    const result: [number, number][] = [coordinates[0]]
    let lastKept = coordinates[0]

    for (let i = 1; i < coordinates.length - 1; i++) {
        const dx = coordinates[i][0] - lastKept[0]
        const dy = coordinates[i][1] - lastKept[1]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist >= tolerance) {
            result.push(coordinates[i])
            lastKept = coordinates[i]
        }
    }
    result.push(coordinates[coordinates.length - 1])
    return result
}

/**
 * Get the first and last points of a LineString (for entry/exit markers).
 */
function getEndpoints(coords: [number, number][]): { entry: [number, number]; exit: [number, number] } | null {
    if (coords.length < 2) return null
    return { entry: coords[0], exit: coords[coords.length - 1] }
}

/**
 * Build a GeoJSON FeatureCollection for the overlay:
 * - Field boundary (green semi-transparent fill + outline)
 * - A large grey polygon covering the whole viewport EXCEPT the field (greyscale effect)
 * - Trail paths (color-coded per interval, separate for gap rendering)
 * - Entry/exit markers (numbered dots) for each interval
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

    // ── Greyscale outside: draw a large rectangle covering the viewport,
    //    then "cut out" the field using a hole. The rectangle is semi-opaque grey.
    //    We use the field's bounding box expanded by ~50% as the outer ring.
    if (greyscaleOutside) {
        const allCoords = fieldBoundary.type === "Polygon"
            ? fieldBoundary.coordinates[0]
            : fieldBoundary.coordinates[0][0]
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
        for (const [lng, lat] of allCoords) {
            minLng = Math.min(minLng, lng)
            minLat = Math.min(minLat, lat)
            maxLng = Math.max(maxLng, lng)
            maxLat = Math.max(maxLat, lat)
        }
        // Expand the bbox by 50% to ensure full coverage
        const lngPad = (maxLng - minLng) * 0.5
        const latPad = (maxLat - minLat) * 0.5
        const outerRing: [number, number][] = [
            [minLng - lngPad, minLat - latPad],
            [maxLng + lngPad, minLat - latPad],
            [maxLng + lngPad, maxLat + latPad],
            [minLng - lngPad, maxLat + latPad],
            [minLng - lngPad, minLat - latPad],
        ]

        // The field boundary as the hole (reversed winding)
        const fieldRing = fieldBoundary.type === "Polygon"
            ? fieldBoundary.coordinates[0]
            : fieldBoundary.coordinates[0][0]
        const holeRing = [...fieldRing].reverse() as [number, number][]

        features.push({
            type: "Feature",
            properties: {
                fill: "#1a1a1a",
                "fill-opacity": 0.55,
                stroke: "#1a1a1a",
                "stroke-width": 0,
                "stroke-opacity": 0,
            },
            geometry: {
                type: "Polygon",
                coordinates: [outerRing, holeRing],
            },
        })
    }

    // ── Field boundary (green outline + light fill)
    features.push({
        type: "Feature",
        properties: {
            fill: "#22c55e",
            "fill-opacity": 0.08,
            stroke: "#22c55e",
            "stroke-width": 2,
            "stroke-opacity": 0.8,
        },
        geometry: fieldBoundary,
    })

    // ── Trail paths + entry/exit markers
    let intervalIdx = 0
    for (const record of records) {
        if (record.interval_paths && record.interval_paths.length > 0) {
            for (const interval of record.interval_paths) {
                if (!interval.path_geojson?.coordinates?.length) continue
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

                // Entry/exit markers
                if (showMarkers) {
                    const endpoints = getEndpoints(simplified)
                    if (endpoints) {
                        // Entry marker (green dot)
                        features.push({
                            type: "Feature",
                            properties: {
                                "marker-color": color,
                                "marker-size": "small",
                            },
                            geometry: {
                                type: "Point",
                                coordinates: endpoints.entry,
                            },
                        })
                        // Exit marker (hollow/different color)
                        features.push({
                            type: "Feature",
                            properties: {
                                "marker-color": "#ffffff",
                                "marker-size": "small",
                            },
                            geometry: {
                                type: "Point",
                                coordinates: endpoints.exit,
                            },
                        })
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
                    features.push({
                        type: "Feature",
                        properties: { "marker-color": color, "marker-size": "small" },
                        geometry: { type: "Point", coordinates: endpoints.entry },
                    })
                    features.push({
                        type: "Feature",
                        properties: { "marker-color": "#ffffff", "marker-size": "small" },
                        geometry: { type: "Point", coordinates: endpoints.exit },
                    })
                }
            }
            intervalIdx++
        }
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

    return `${MAPBOX_STATIC_BASE}/geojson(${encoded})/auto/${width}x${height}@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}&attribution=false&logo=false`
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

    // Greyscale outside
    const allCoords = fieldBoundary.type === "Polygon"
        ? fieldBoundary.coordinates[0]
        : fieldBoundary.coordinates[0][0]
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of allCoords) {
        minLng = Math.min(minLng, lng)
        minLat = Math.min(minLat, lat)
        maxLng = Math.max(maxLng, lng)
        maxLat = Math.max(maxLat, lat)
    }
    const lngPad = (maxLng - minLng) * 0.5
    const latPad = (maxLat - minLat) * 0.5
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
        properties: { fill: "#1a1a1a", "fill-opacity": 0.55, stroke: "#1a1a1a", "stroke-width": 0 },
        geometry: { type: "Polygon", coordinates: [outerRing, holeRing] },
    })

    // Field boundary
    features.push({
        type: "Feature",
        properties: { fill: "#22c55e", "fill-opacity": 0.08, stroke: "#22c55e", "stroke-width": 2, "stroke-opacity": 0.6 },
        geometry: fieldBoundary,
    })

    // All trail paths — color per record, opacity by age
    records.forEach((record, i) => {
        const color = INTERVAL_COLORS[i % INTERVAL_COLORS.length]
        const opacity = 0.4 + (0.6 * (i + 1)) / records.length

        if (record.interval_paths?.length) {
            for (const interval of record.interval_paths) {
                if (!interval.path_geojson?.coordinates?.length) continue
                const simplified = simplifyLineString(interval.path_geojson.coordinates)
                features.push({
                    type: "Feature",
                    properties: { stroke: color, "stroke-width": 2, "stroke-opacity": opacity },
                    geometry: { type: "LineString", coordinates: simplified },
                })
            }
        } else if (record.field_path?.coordinates?.length) {
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
    return `${MAPBOX_STATIC_BASE}/geojson(${encoded})/auto/${width}x${height}@2x?access_token=${PUBLIC_MAPBOX_ACCESS_TOKEN}&attribution=false&logo=false`
}