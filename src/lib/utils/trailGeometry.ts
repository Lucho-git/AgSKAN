// src/lib/utils/trailGeometry.ts

import type { Trail } from "$lib/types/trail"

// ============================================
// CONFIGURATION
// ============================================

export const TRAIL_CONFIG = {
    MULTIPLIER: 1,
    MIN_ZOOM: 10,
    MAX_ZOOM: 24,
    MIN_POWER: -6,
    MAX_POWER: 8,
    DEFAULT_OPACITY: 0.5,
    LOAD_DELAY: 10,
    SEGMENT_DURATION: 900000, // 15 minutes in milliseconds
    ARROW_INTERVAL_METERS: 10, // Fixed real-world distance between arrows
}

// ============================================
// TYPES
// ============================================

export interface TrailIdentifiers {
    sourceId: string
    layerId: string
    highlightLayerId: string
    highlightBackgroundLayerId: string
}

export interface TrailCoordinate {
    coordinates: {
        latitude: number
        longitude: number
    }
    timestamp: number
}

export interface LineString {
    type: "LineString"
    coordinates: [number, number][]
}

export interface ArrowMarker {
    type: string
    properties: {
        trailId: string
        color: string
        bearing: number
        sortKey: number
    }
    geometry: {
        type: string
        coordinates: [number, number]
    }
}

export interface TrailDistanceState {
    lastCoordIndex: number
    distanceSinceLastMarker: number
}

// ============================================
// TRAIL ID GENERATION
// ============================================

export function generateTrailIds(trailId: string): TrailIdentifiers {
    return {
        sourceId: `trail-source-${trailId}`,
        layerId: `trail-layer-${trailId}`,
        highlightLayerId: `trail-highlight-${trailId}`,
        highlightBackgroundLayerId: `trail-highlight-bg-${trailId}`,
    }
}

// ============================================
// ZOOM-DEPENDENT CALCULATIONS
// ============================================

export function calculateZoomDependentWidth(
    baseWidth: number,
    multiplier: number = 1,
) {
    return [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        TRAIL_CONFIG.MIN_ZOOM,
        [
            "*",
            baseWidth * TRAIL_CONFIG.MULTIPLIER * multiplier,
            ["^", 2, TRAIL_CONFIG.MIN_POWER],
        ],
        TRAIL_CONFIG.MAX_ZOOM,
        [
            "*",
            baseWidth * TRAIL_CONFIG.MULTIPLIER * multiplier,
            ["^", 2, TRAIL_CONFIG.MAX_POWER],
        ],
    ]
}

export function calculateZoomDependentTextSize(
    baseSize: number,
    multiplier: number = 1,
) {
    return [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        TRAIL_CONFIG.MIN_ZOOM,
        [
            "*",
            baseSize * TRAIL_CONFIG.MULTIPLIER * multiplier,
            ["^", 2, TRAIL_CONFIG.MIN_POWER],
        ],
        TRAIL_CONFIG.MAX_ZOOM,
        [
            "*",
            baseSize * TRAIL_CONFIG.MULTIPLIER * multiplier,
            ["^", 2, TRAIL_CONFIG.MAX_POWER],
        ],
    ]
}

// ============================================
// GEOSPATIAL CALCULATIONS
// ============================================

/**
 * Calculate distance between two coordinates in meters using Haversine formula
 */
export function calculateDistance(
    lon1: number,
    lat1: number,
    lon2: number,
    lat2: number,
): number {
    const R = 6371000 // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
}

/**
 * Calculate bearing (direction) from one point to another in degrees
 */
export function calculateBearing(
    lon1: number,
    lat1: number,
    lon2: number,
    lat2: number,
): number {
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const y = Math.sin(Δλ) * Math.cos(φ2)
    const x =
        Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
    const θ = Math.atan2(y, x)

    const bearing = ((θ * 180) / Math.PI + 360) % 360

    return (bearing + 180) % 360
}

// ============================================
// ARROW MARKER GENERATION
// ============================================

/**
 * Generate arrow markers incrementally along a trail path
 * Supports both full and incremental generation
 */
export function generateArrowMarkersIncremental(
    coordinates: [number, number][],
    startIndex: number,
    intervalMeters: number,
    trailId: string,
    trailColor: string,
    startTimestamp: number,
    initialDistanceSinceLastMarker: number = 0,
): { markers: ArrowMarker[]; finalDistance: number } {
    if (coordinates.length < 2) {
        return { markers: [], finalDistance: 0 }
    }

    const markers: ArrowMarker[] = []
    let distanceSinceLastMarker = initialDistanceSinceLastMarker

    // Start from the previous coordinate to maintain continuity
    const actualStartIndex = Math.max(0, startIndex - 1)

    for (let i = actualStartIndex; i < coordinates.length - 1; i++) {
        const [lon1, lat1] = coordinates[i]
        const [lon2, lat2] = coordinates[i + 1]

        const segmentDistance = calculateDistance(lon1, lat1, lon2, lat2)
        distanceSinceLastMarker += segmentDistance

        // Check if we should place a marker along this segment
        while (distanceSinceLastMarker >= intervalMeters) {
            const distanceAlongSegment =
                segmentDistance - (distanceSinceLastMarker - intervalMeters)
            const ratio = distanceAlongSegment / segmentDistance

            // Interpolate position
            const markerLon = lon1 + (lon2 - lon1) * ratio
            const markerLat = lat1 + (lat2 - lat1) * ratio

            // Calculate bearing for this marker
            const bearing = calculateBearing(lon1, lat1, lon2, lat2)

            markers.push({
                type: "Feature",
                properties: {
                    trailId: trailId,
                    color: trailColor,
                    bearing: bearing,
                    sortKey: startTimestamp,
                },
                geometry: {
                    type: "Point",
                    coordinates: [markerLon, markerLat],
                },
            })

            distanceSinceLastMarker -= intervalMeters
        }
    }

    return {
        markers,
        finalDistance: distanceSinceLastMarker,
    }
}

// ============================================
// ARROW MARKER LAYER CONFIGURATION
// ============================================

export function createArrowMarkerConfig(
    layerId: string,
    sourceId: string,
    visibility: string,
    arrowsEnabled: boolean,
) {
    // Combine both visibility settings
    const arrowVisibility =
        visibility === "visible" && arrowsEnabled ? "visible" : "none"

    return {
        id: layerId,
        type: "symbol",
        source: sourceId,
        layout: {
            "text-field": "›",
            "text-size": calculateZoomDependentTextSize(3, 1),
            "text-rotate": ["+", ["get", "bearing"], 90],
            "text-rotation-alignment": "map",
            "text-pitch-alignment": "map",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-anchor": "center",
            "symbol-sort-key": ["get", "sortKey"],
            visibility: arrowVisibility,
        },
        paint: {
            "text-color": ["get", "color"],
            "text-opacity": 0.8,
            "text-halo-color": ["get", "color"],
            "text-halo-width": 1,
        },
    }
}

// ============================================
// TRAIL SEGMENTATION
// ============================================

/**
 * Split trail into time-based segments with overlapping coordinates
 */
export function splitTrailIntoSegments(
    coordinates: TrailCoordinate[],
    trailId: string,
    trailColor: string,
    trailWidth: number,
    segmentDuration: number = TRAIL_CONFIG.SEGMENT_DURATION,
) {
    if (!coordinates || coordinates.length === 0) {
        console.warn(`⚠️ No coordinates for trail ${trailId}`)
        return []
    }

    const segments = []
    let currentSegment: TrailCoordinate[] = []
    let segmentStartTime = coordinates[0].timestamp

    coordinates.forEach((coord, idx) => {
        currentSegment.push(coord)

        const timeSinceSegmentStart = coord.timestamp - segmentStartTime
        const isLastCoordinate = idx === coordinates.length - 1

        if (timeSinceSegmentStart > segmentDuration || isLastCoordinate) {
            if (currentSegment.length >= 2) {
                segments.push({
                    type: "Feature",
                    properties: {
                        trailId: trailId,
                        color: trailColor,
                        width: trailWidth,
                        timestamp: segmentStartTime,
                        sortKey: segmentStartTime,
                        segmentIndex: segments.length,
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: currentSegment.map((c) => [
                            c.coordinates.longitude,
                            c.coordinates.latitude,
                        ]),
                    },
                })
            }

            // Start new segment with overlap (keep last coordinate)
            currentSegment = [coord]
            segmentStartTime = coord.timestamp
        }
    })

    return segments
}

// ============================================
// GEOJSON CREATION
// ============================================

/**
 * Convert trail coordinates to LineString format
 */
export function convertToLineString(coordinates: TrailCoordinate[]): LineString {
    const sortedCoords = [...coordinates].sort(
        (a, b) => a.timestamp - b.timestamp,
    )

    return {
        type: "LineString",
        coordinates: sortedCoords.map((coord) => [
            coord.coordinates.longitude,
            coord.coordinates.latitude,
        ]),
    }
}

/**
 * Create GeoJSON feature from trail coordinates
 */
export function createTrailGeoJSON(coordinates: LineString | TrailCoordinate[]) {
    const lineString =
        "type" in coordinates
            ? coordinates
            : convertToLineString(coordinates as TrailCoordinate[])

    return {
        type: "Feature",
        properties: {},
        geometry: lineString,
    }
}

/**
 * Create initial combined GeoJSON for multiple active trails
 */
export function createInitialCombinedActiveTrailsGeoJSON(trails: Trail[]) {
    console.log("\n🎬 INITIAL COMBINED TRAIL CREATION")
    const allSegments = []
    const segmentCounts = new Map<string, number>()
    const coordinateCounts = new Map<string, number>()

    trails.forEach((trail) => {
        let trailCoordinates: TrailCoordinate[]

        if ("type" in trail.path && trail.path.type === "LineString") {
            trailCoordinates = trail.path.coordinates.map((coord, idx) => ({
                coordinates: {
                    longitude: coord[0],
                    latitude: coord[1],
                },
                timestamp: idx,
            }))
        } else {
            trailCoordinates = trail.path as TrailCoordinate[]
        }

        const segments = splitTrailIntoSegments(
            trailCoordinates,
            trail.id,
            trail.trail_color || "#FF0000",
            trail.trail_width || 3,
        )

        console.log(
            `  📍 Trail ${trail.id}: ${trailCoordinates.length} coords → ${segments.length} segments`,
        )
        allSegments.push(...segments)

        segmentCounts.set(trail.id, segments.length)
        coordinateCounts.set(trail.id, trailCoordinates.length)
    })

    console.log(`✅ Initial creation: ${allSegments.length} total segments`)

    return {
        geoJSON: {
            type: "FeatureCollection",
            features: allSegments,
        },
        segmentCounts,
        coordinateCounts,
    }
}

/**
 * Create arrow markers for active trails with incremental support
 */
export function createActiveTrailMarkers(
    trails: Trail[],
    arrowsEnabled: boolean,
    isIncremental: boolean = false,
    trailsWithChangedCoords: Set<string> = new Set(),
    previousArrowMarkers: ArrowMarker[] = [],
    trailDistanceState: Map<string, TrailDistanceState> = new Map(),
) {
    // Early exit if arrows are disabled - saves processing
    if (!arrowsEnabled) {
        return {
            geoJSON: {
                type: "FeatureCollection",
                features: [],
            },
            updatedDistanceState: trailDistanceState,
            updatedMarkers: [],
        }
    }

    console.log("\n🎯 CREATING ARROW MARKERS")
    const allMarkers: ArrowMarker[] = []
    const updatedDistanceState = new Map(trailDistanceState)

    trails.forEach((trail) => {
        let coordinates: [number, number][]
        let startTimestamp = 0

        if ("type" in trail.path && trail.path.type === "LineString") {
            coordinates = trail.path.coordinates as [number, number][]
            startTimestamp = 0
        } else {
            const trailCoords = trail.path as TrailCoordinate[]
            const sorted = [...trailCoords].sort(
                (a, b) => a.timestamp - b.timestamp,
            )
            coordinates = sorted.map((c) => [
                c.coordinates.longitude,
                c.coordinates.latitude,
            ])
            startTimestamp = sorted[0]?.timestamp || 0
        }

        // Check if this trail's coordinates changed
        const coordsChanged = trailsWithChangedCoords.has(trail.id)

        if (coordsChanged || !isIncremental) {
            const existingState = updatedDistanceState.get(trail.id) || {
                lastCoordIndex: 0,
                distanceSinceLastMarker: 0,
            }

            const existingMarkers = previousArrowMarkers.filter(
                (m) => m.properties.trailId === trail.id,
            )

            if (
                coordinates.length > existingState.lastCoordIndex &&
                isIncremental &&
                existingMarkers.length > 0
            ) {
                // INCREMENTAL: Generate only for new coordinates
                const { markers: newMarkers, finalDistance } =
                    generateArrowMarkersIncremental(
                        coordinates,
                        existingState.lastCoordIndex,
                        TRAIL_CONFIG.ARROW_INTERVAL_METERS,
                        trail.id,
                        trail.trail_color || "#FF0000",
                        startTimestamp,
                        existingState.distanceSinceLastMarker,
                    )

                console.log(
                    `  ➕ Trail ${trail.id}: ${existingMarkers.length} reused + ${newMarkers.length} new markers`,
                )

                allMarkers.push(...existingMarkers, ...newMarkers)

                // Update state for next time
                updatedDistanceState.set(trail.id, {
                    lastCoordIndex: coordinates.length,
                    distanceSinceLastMarker: finalDistance,
                })
            } else {
                // FULL REGENERATION: For new trails or full rebuilds
                const { markers, finalDistance } = generateArrowMarkersIncremental(
                    coordinates,
                    0,
                    TRAIL_CONFIG.ARROW_INTERVAL_METERS,
                    trail.id,
                    trail.trail_color || "#FF0000",
                    startTimestamp,
                    0,
                )

                console.log(
                    `  ▶ Trail ${trail.id}: ${markers.length} arrow markers (${coordsChanged ? "REGENERATED" : "INITIAL"})`,
                )

                allMarkers.push(...markers)

                // Update state for next time
                updatedDistanceState.set(trail.id, {
                    lastCoordIndex: coordinates.length,
                    distanceSinceLastMarker: finalDistance,
                })
            }
        } else {
            // Reuse existing markers for unchanged trails
            const existingMarkers = previousArrowMarkers.filter(
                (m) => m.properties.trailId === trail.id,
            )
            console.log(
                `  ↻ Trail ${trail.id}: ${existingMarkers.length} arrow markers (REUSED)`,
            )
            allMarkers.push(...existingMarkers)
        }
    })

    console.log(`✅ Total arrow markers: ${allMarkers.length}`)

    return {
        geoJSON: {
            type: "FeatureCollection",
            features: allMarkers,
        },
        updatedDistanceState,
        updatedMarkers: allMarkers,
    }
}