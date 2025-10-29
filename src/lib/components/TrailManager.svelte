<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import * as mapboxgl from "mapbox-gl"
  import type { Map } from "mapbox-gl"
  import type { Trail } from "$lib/types/trail"
  import { trailsApi } from "$lib/api/trailsApi"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"

  import {
    historicalTrailStore,
    otherActiveTrailStore,
  } from "$lib/stores/otherTrailStore"
  import { currentTrailStore } from "$lib/stores/currentTrailStore"
  import { toast } from "svelte-sonner"

  const mapContext = getContext("map")

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

  export interface TrailIdentifiers {
    sourceId: string
    layerId: string
    highlightLayerId: string
    highlightBackgroundLayerId: string
  }

  interface TrailCoordinate {
    coordinates: {
      latitude: number
      longitude: number
    }
    timestamp: number
  }

  interface LineString {
    type: "LineString"
    coordinates: [number, number][]
  }

  interface ArrowMarker {
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

  interface TrailDistanceState {
    lastCoordIndex: number
    distanceSinceLastMarker: number
  }

  export let map: Map

  let historicalTrailLayers: string[] = []
  let historicalDirectionalLayers: string[] = []
  let previousHistoricalVisibility = true
  let previousActiveVisibility = true
  let previousArrowsVisibility = false

  // Track segment counts AND coordinate counts per trail
  let lastSegmentIndices = new Map<string, number>()
  let lastCoordinateCounts = new Map<string, number>()

  // Track which trails are in the combined layer
  let activeTrailsInCombinedLayer = new Set<string>()

  // Track previous arrow markers for reuse
  let previousArrowMarkers: ArrowMarker[] = []

  // Track distance state for incremental arrow generation
  let trailDistanceState = new Map<string, TrailDistanceState>()

  // Combined source and layers for all active trails
  const COMBINED_ACTIVE_SOURCE_ID = "all-active-trails-combined"
  const COMBINED_ACTIVE_LAYER_ID = "all-active-trails-layer"
  const COMBINED_ACTIVE_MARKERS_SOURCE_ID = "all-active-trails-markers-source"
  const COMBINED_ACTIVE_MARKERS_ID = "all-active-trails-markers"

  $: {
    if (
      map &&
      $layerVisibilityStore &&
      $layerVisibilityStore.historicalTrails !== previousHistoricalVisibility
    ) {
      updateHistoricalTrailVisibility($layerVisibilityStore.historicalTrails)
      previousHistoricalVisibility = $layerVisibilityStore.historicalTrails
    }
  }

  $: {
    if (
      map &&
      $layerVisibilityStore &&
      $layerVisibilityStore.activeTrails !== previousActiveVisibility
    ) {
      updateActiveTrailVisibility($layerVisibilityStore.activeTrails)
      previousActiveVisibility = $layerVisibilityStore.activeTrails
    }
  }

  $: {
    if (
      map &&
      map.isStyleLoaded &&
      map.isStyleLoaded() &&
      $layerVisibilityStore &&
      typeof $layerVisibilityStore.trailArrows !== "undefined" &&
      $layerVisibilityStore.trailArrows !== previousArrowsVisibility
    ) {
      updateArrowVisibility($layerVisibilityStore.trailArrows)
      previousArrowsVisibility = $layerVisibilityStore.trailArrows
    }
  }

  function updateHistoricalTrailVisibility(visible: boolean) {
    if (!map || !map.getStyle()) return

    try {
      const visibility = visible ? "visible" : "none"

      historicalTrailLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility)
        }
      })

      // Update arrows based on both trail visibility AND arrow visibility
      const arrowVisibility =
        visible && $layerVisibilityStore.trailArrows ? "visible" : "none"
      historicalDirectionalLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", arrowVisibility)
        }
      })

      $historicalTrailStore.forEach((trail) => {
        const { highlightLayerId } = generateTrailIds(trail.id)
        const innerLayerId = `${highlightLayerId}-inner`

        if (map.getLayer(highlightLayerId)) {
          map.setLayoutProperty(highlightLayerId, "visibility", visibility)
        }
        if (map.getLayer(innerLayerId)) {
          map.setLayoutProperty(innerLayerId, "visibility", visibility)
        }
      })

      console.log(
        "✅ Updated historical trail visibility:",
        visible,
        "Layers:",
        historicalTrailLayers.length,
      )
    } catch (error) {
      console.error("Error updating historical trail visibility:", error)
    }
  }

  function updateActiveTrailVisibility(visible: boolean) {
    if (!map || !map.getStyle()) return

    try {
      const visibility = visible ? "visible" : "none"

      // Update trail line
      if (map.getLayer(COMBINED_ACTIVE_LAYER_ID)) {
        map.setLayoutProperty(
          COMBINED_ACTIVE_LAYER_ID,
          "visibility",
          visibility,
        )
      }

      // Update arrows based on both trail visibility AND arrow visibility
      const arrowVisibility =
        visible && $layerVisibilityStore.trailArrows ? "visible" : "none"
      if (map.getLayer(COMBINED_ACTIVE_MARKERS_ID)) {
        map.setLayoutProperty(
          COMBINED_ACTIVE_MARKERS_ID,
          "visibility",
          arrowVisibility,
        )
      }

      console.log("✅ Updated active trail visibility:", visible)
    } catch (error) {
      console.error("Error updating active trail visibility:", error)
    }
  }

  function updateArrowVisibility(visible: boolean) {
    if (!map || !map.getStyle || !map.getStyle()) return

    try {
      // Arrows should only be visible if BOTH arrows are enabled AND their parent trails are visible

      // Update active trail arrows
      const activeArrowVisibility =
        visible && $layerVisibilityStore.activeTrails ? "visible" : "none"
      if (map.getLayer(COMBINED_ACTIVE_MARKERS_ID)) {
        map.setLayoutProperty(
          COMBINED_ACTIVE_MARKERS_ID,
          "visibility",
          activeArrowVisibility,
        )
        console.log(`  ✓ Active arrows: ${activeArrowVisibility}`)
      }

      // Update historical trail arrows - FIXED: Find all marker layers dynamically
      const historicalArrowVisibility =
        visible && $layerVisibilityStore.historicalTrails ? "visible" : "none"

      // Get all layers and filter for historical trail markers
      const allLayers = map.getStyle().layers
      const historicalMarkerLayers = allLayers
        .filter(
          (layer) =>
            layer.id.includes("-markers") &&
            layer.id.startsWith("trail-layer-") &&
            layer.id !== COMBINED_ACTIVE_MARKERS_ID,
        )
        .map((layer) => layer.id)

      historicalMarkerLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            historicalArrowVisibility,
          )
        }
      })

      console.log("✅ Updated arrow visibility:", visible)
    } catch (error) {
      console.error("Error updating arrow visibility:", error)
    }
  }

  export function generateTrailIds(trailId: string): TrailIdentifiers {
    return {
      sourceId: `trail-source-${trailId}`,
      layerId: `trail-layer-${trailId}`,
      highlightLayerId: `trail-highlight-${trailId}`,
      highlightBackgroundLayerId: `trail-highlight-bg-${trailId}`,
    }
  }

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

  // ============================================
  // ARROW SIZE CALCULATION - Similar to line width
  // ============================================
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
  // ARROW MARKER STYLING - Updated with zoom formula and sort key
  // ============================================
  function createArrowMarkerConfig(
    layerId: string,
    sourceId: string,
    visibility: string,
  ) {
    // Combine both visibility settings
    const arrowVisibility =
      visibility === "visible" && $layerVisibilityStore.trailArrows
        ? "visible"
        : "none"

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

  // Calculate distance between two coordinates in meters using Haversine formula
  function calculateDistance(
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

  // Calculate bearing (direction) from one point to another
  function calculateBearing(
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

  // Generate arrow markers incrementally - supports both full and incremental generation
  function generateArrowMarkersIncremental(
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
    // (we need the segment from previous coord to first new coord)
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

  // Split trail into time-based segments with overlapping coordinates
  function splitTrailIntoSegments(
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

  // Create initial combined GeoJSON for active trails
  function createInitialCombinedActiveTrailsGeoJSON(trails: Trail[]) {
    console.log("\n🎬 INITIAL COMBINED TRAIL CREATION")
    const allSegments = []

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

      lastSegmentIndices.set(trail.id, segments.length)
      lastCoordinateCounts.set(trail.id, trailCoordinates.length)
      activeTrailsInCombinedLayer.add(trail.id)
    })

    console.log(`✅ Initial creation: ${allSegments.length} total segments`)

    return {
      type: "FeatureCollection",
      features: allSegments,
    }
  }

  // Create arrow markers for active trails - OPTIMIZED WITH INCREMENTAL GENERATION
  function createActiveTrailMarkers(
    trails: Trail[],
    isIncremental: boolean = false,
    trailsWithChangedCoords: Set<string> = new Set(),
  ) {
    console.log("\n🎯 CREATING ARROW MARKERS")
    const allMarkers: ArrowMarker[] = []

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
        const existingState = trailDistanceState.get(trail.id) || {
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
          trailDistanceState.set(trail.id, {
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
          trailDistanceState.set(trail.id, {
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

    // Store for next iteration
    previousArrowMarkers = allMarkers

    return {
      type: "FeatureCollection",
      features: allMarkers,
    }
  }

  // Incremental update for active trails
  function updateCombinedActiveTrailsIncremental() {
    console.log("\n🔄 INCREMENTAL UPDATE")

    const allActiveTrails = [
      ...($currentTrailStore ? [$currentTrailStore] : []),
      ...$otherActiveTrailStore,
    ].filter((trail) => trail && trail.path)

    if (allActiveTrails.length === 0) {
      console.log("⚠️ No active trails")
      return
    }

    const source = map.getSource(
      COMBINED_ACTIVE_SOURCE_ID,
    ) as mapboxgl.GeoJSONSource
    if (!source) {
      console.log("⚠️ Source doesn't exist, doing full rebuild")
      rebuildCombinedActiveTrails()
      return
    }

    let existingFeatures = []
    try {
      const currentData = (source as any)._data
      if (currentData && currentData.features) {
        existingFeatures = currentData.features
      }
    } catch (error) {
      console.warn("Could not access source data, rebuilding:", error)
      rebuildCombinedActiveTrails()
      return
    }

    const currentTrailIds = new Set(allActiveTrails.map((t) => t.id))
    const removedTrails = Array.from(activeTrailsInCombinedLayer).filter(
      (id) => !currentTrailIds.has(id),
    )

    if (removedTrails.length > 0) {
      console.log(`  🗑️ Trails removed: ${removedTrails.join(", ")}`)
      removedTrails.forEach((id) => {
        lastSegmentIndices.delete(id)
        lastCoordinateCounts.delete(id)
        activeTrailsInCombinedLayer.delete(id)
        trailDistanceState.delete(id)
      })
      rebuildCombinedActiveTrails()
      return
    }

    let hasChanges = false
    let totalNewSegments = 0

    const updatedFeatures = []
    const processedTrailIds = new Set<string>()
    const trailsWithChangedCoords = new Set<string>()

    allActiveTrails.forEach((trail) => {
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

      const currentCoordCount = trailCoordinates.length
      const previousCoordCount = lastCoordinateCounts.get(trail.id) || 0
      const lastSegmentIndex = lastSegmentIndices.get(trail.id) || 0

      console.log(`  🔍 Trail ${trail.id}:`, {
        previousCoords: previousCoordCount,
        currentCoords: currentCoordCount,
        newCoords: currentCoordCount - previousCoordCount,
        previousSegments: lastSegmentIndex,
      })

      const allSegments = splitTrailIntoSegments(
        trailCoordinates,
        trail.id,
        trail.trail_color || "#FF0000",
        trail.trail_width || 3,
      )

      processedTrailIds.add(trail.id)

      if (!activeTrailsInCombinedLayer.has(trail.id)) {
        console.log(`  ✨ New trail detected: ${trail.id}`)
        activeTrailsInCombinedLayer.add(trail.id)
        updatedFeatures.push(...allSegments)
        lastSegmentIndices.set(trail.id, allSegments.length)
        lastCoordinateCounts.set(trail.id, currentCoordCount)
        trailsWithChangedCoords.add(trail.id)
        totalNewSegments += allSegments.length
        hasChanges = true
      } else if (currentCoordCount !== previousCoordCount) {
        console.log(
          `  🔄 Trail ${trail.id}: Coordinates changed, updating all segments (${lastSegmentIndex} → ${allSegments.length} segments)`,
        )
        updatedFeatures.push(...allSegments)

        trailsWithChangedCoords.add(trail.id)

        if (allSegments.length > lastSegmentIndex) {
          totalNewSegments += allSegments.length - lastSegmentIndex
        }

        lastSegmentIndices.set(trail.id, allSegments.length)
        lastCoordinateCounts.set(trail.id, currentCoordCount)
        hasChanges = true
      } else {
        console.log(`    ⏭️ No changes`)
        const existingTrailSegments = existingFeatures.filter(
          (feature: any) => feature.properties.trailId === trail.id,
        )
        updatedFeatures.push(...existingTrailSegments)
      }
    })

    existingFeatures.forEach((feature: any) => {
      if (!processedTrailIds.has(feature.properties.trailId)) {
        updatedFeatures.push(feature)
      }
    })

    if (hasChanges) {
      console.log(`  📊 Total new segments: ${totalNewSegments}`)
      console.log(`  📊 Total segments now: ${updatedFeatures.length}`)

      source.setData({
        type: "FeatureCollection",
        features: updatedFeatures,
      })

      // Update arrow markers with incremental generation
      const markerSource = map.getSource(
        COMBINED_ACTIVE_MARKERS_SOURCE_ID,
      ) as mapboxgl.GeoJSONSource
      if (markerSource) {
        const markersGeoJSON = createActiveTrailMarkers(
          allActiveTrails,
          true,
          trailsWithChangedCoords,
        )
        markerSource.setData(markersGeoJSON)
      }

      console.log(`✅ Incremental update complete`)
    } else {
      console.log(`  ⏭️ No changes`)
    }
  }

  // Full rebuild for active trails
  function rebuildCombinedActiveTrails() {
    console.log("\n🔨 FULL REBUILD")

    const allActiveTrails = [
      ...($currentTrailStore ? [$currentTrailStore] : []),
      ...$otherActiveTrailStore,
    ].filter((trail) => trail && trail.path)

    console.log(`Active trails: ${allActiveTrails.length}`)

    if (allActiveTrails.length === 0) {
      console.log("⚠️ No active trails to display")
      const layersToRemove = [
        COMBINED_ACTIVE_MARKERS_ID,
        COMBINED_ACTIVE_LAYER_ID,
      ]
      layersToRemove.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId)
        }
      })
      if (map.getSource(COMBINED_ACTIVE_SOURCE_ID)) {
        map.removeSource(COMBINED_ACTIVE_SOURCE_ID)
      }
      if (map.getSource(COMBINED_ACTIVE_MARKERS_SOURCE_ID)) {
        map.removeSource(COMBINED_ACTIVE_MARKERS_SOURCE_ID)
      }
      lastSegmentIndices.clear()
      lastCoordinateCounts.clear()
      activeTrailsInCombinedLayer.clear()
      previousArrowMarkers = []
      trailDistanceState.clear()
      return
    }

    const combinedGeoJSON =
      createInitialCombinedActiveTrailsGeoJSON(allActiveTrails)
    const markersGeoJSON = createActiveTrailMarkers(allActiveTrails, false)

    // Remove existing layers
    const layersToRemove = [
      COMBINED_ACTIVE_MARKERS_ID,
      COMBINED_ACTIVE_LAYER_ID,
    ]
    layersToRemove.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId)
      }
    })
    if (map.getSource(COMBINED_ACTIVE_SOURCE_ID)) {
      map.removeSource(COMBINED_ACTIVE_SOURCE_ID)
    }
    if (map.getSource(COMBINED_ACTIVE_MARKERS_SOURCE_ID)) {
      map.removeSource(COMBINED_ACTIVE_MARKERS_SOURCE_ID)
    }

    // Add new sources
    map.addSource(COMBINED_ACTIVE_SOURCE_ID, {
      type: "geojson",
      data: combinedGeoJSON,
    })

    map.addSource(COMBINED_ACTIVE_MARKERS_SOURCE_ID, {
      type: "geojson",
      data: markersGeoJSON,
    })

    const visibility = $layerVisibilityStore.activeTrails ? "visible" : "none"

    // Main trail layer (solid line)
    const mainLayerConfig = {
      id: COMBINED_ACTIVE_LAYER_ID,
      type: "line",
      source: COMBINED_ACTIVE_SOURCE_ID,
      layout: {
        "line-join": "round",
        "line-cap": "round",
        visibility: visibility,
        "line-sort-key": ["get", "sortKey"],
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": calculateZoomDependentWidth(3, 1),
        "line-opacity": TRAIL_CONFIG.DEFAULT_OPACITY,
      },
    }

    if (mapContext?.addTrailLayerOrdered) {
      mapContext.addTrailLayerOrdered(mainLayerConfig)
    } else {
      addTrailWithFallback(mainLayerConfig)
    }

    // Arrow markers layer using unified config
    const markerLayerConfig = createArrowMarkerConfig(
      COMBINED_ACTIVE_MARKERS_ID,
      COMBINED_ACTIVE_MARKERS_SOURCE_ID,
      visibility,
    )

    if (mapContext?.addTrailLayerOrdered) {
      mapContext.addTrailLayerOrdered(markerLayerConfig)
    } else {
      addTrailWithFallback(markerLayerConfig)
    }

    console.log(
      `✅ Full rebuild complete: ${combinedGeoJSON.features.length} segments, ${markersGeoJSON.features.length} arrow markers`,
    )
  }

  function createTrailGeoJSON(coordinates: LineString | TrailCoordinate[]) {
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

  export function removeTrail(trailId: string, isHistorical: boolean = true) {
    const { sourceId, layerId, highlightLayerId, highlightBackgroundLayerId } =
      generateTrailIds(trailId)

    if (isHistorical) {
      const markersSourceId = `${sourceId}-markers`
      const markersLayerId = `${layerId}-markers`

      const layersToRemove = [
        markersLayerId,
        highlightLayerId,
        highlightBackgroundLayerId,
        layerId,
      ]

      layersToRemove.forEach((layer) => {
        if (map.getLayer(layer)) {
          map.removeLayer(layer)
          historicalTrailLayers = historicalTrailLayers.filter(
            (id) => id !== layer,
          )
          historicalDirectionalLayers = historicalDirectionalLayers.filter(
            (id) => id !== layer,
          )
        }
      })

      if (map.getSource(sourceId)) {
        map.removeSource(sourceId)
      }
      if (map.getSource(markersSourceId)) {
        map.removeSource(markersSourceId)
      }
    } else {
      lastSegmentIndices.delete(trailId)
      lastCoordinateCounts.delete(trailId)
      activeTrailsInCombinedLayer.delete(trailId)
      trailDistanceState.delete(trailId)
      rebuildCombinedActiveTrails()
    }
  }

  export async function deleteTrail(trailId: string) {
    try {
      const result = await trailsApi.deleteTrail(trailId)

      if (result.error) {
        console.error("API returned error:", result.message)
        toast.error(`Failed to delete trail: ${result.message}`)
        throw new Error(result.message || "Failed to delete trail")
      }

      historicalTrailStore.update((trails) =>
        trails.filter((t) => t.id !== trailId),
      )

      toast.success("Trail deleted")
      return true
    } catch (error) {
      console.error("Error deleting trail:", error)
      toast.error(`Error deleting trail: ${error.message || "Unknown error"}`)
      return false
    }
  }

  // Add individual historical trail with arrow markers
  export function addTrail(trail: Trail, isHistorical: boolean = true): string {
    if (!isHistorical) {
      console.log(
        `⚠️ Active trail ${trail.id} should use rebuildCombinedActiveTrails()`,
      )
      return ""
    }

    const { sourceId, layerId } = generateTrailIds(trail.id)
    const zoomDependentWidth = calculateZoomDependentWidth(
      trail.trail_width || 3,
      1,
    )

    const markersSourceId = `${sourceId}-markers`
    const markersLayerId = `${layerId}-markers`

    // Remove existing layers
    const layersToRemove = [markersLayerId, layerId]
    layersToRemove.forEach((layer) => {
      if (map.getLayer(layer)) {
        map.removeLayer(layer)
        historicalTrailLayers = historicalTrailLayers.filter(
          (id) => id !== layer,
        )
        historicalDirectionalLayers = historicalDirectionalLayers.filter(
          (id) => id !== layer,
        )
      }
    })

    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }
    if (map.getSource(markersSourceId)) {
      map.removeSource(markersSourceId)
    }

    const geoJsonData = createTrailGeoJSON(trail.path)

    // Generate arrow markers for historical trail
    let coordinates: [number, number][]
    let startTimestamp = 0

    if ("type" in trail.path && trail.path.type === "LineString") {
      coordinates = trail.path.coordinates as [number, number][]
      startTimestamp = 0
    } else {
      const trailCoords = trail.path as TrailCoordinate[]
      const sorted = [...trailCoords].sort((a, b) => a.timestamp - b.timestamp)
      coordinates = sorted.map((c) => [
        c.coordinates.longitude,
        c.coordinates.latitude,
      ])
      startTimestamp = sorted[0]?.timestamp || 0
    }

    const { markers } = generateArrowMarkersIncremental(
      coordinates,
      0,
      TRAIL_CONFIG.ARROW_INTERVAL_METERS,
      trail.id,
      trail.trail_color || "#FF0000",
      startTimestamp,
      0,
    )

    const markersGeoJSON = {
      type: "FeatureCollection",
      features: markers,
    }

    map.addSource(sourceId, {
      type: "geojson",
      data: geoJsonData,
    })

    map.addSource(markersSourceId, {
      type: "geojson",
      data: markersGeoJSON,
    })

    const visibility = $layerVisibilityStore.historicalTrails
      ? "visible"
      : "none"

    // Main trail layer (solid line)
    const mainLayerConfig = {
      id: layerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-join": "round",
        "line-cap": "round",
        visibility: visibility,
      },
      paint: {
        "line-color": trail.trail_color || "#FF0000",
        "line-width": zoomDependentWidth,
        "line-opacity": TRAIL_CONFIG.DEFAULT_OPACITY,
      },
    }

    if (mapContext?.addTrailLayerOrdered) {
      mapContext.addTrailLayerOrdered(mainLayerConfig)
    } else {
      addTrailWithFallback(mainLayerConfig)
    }

    // Arrow markers layer using unified config
    const markerLayerConfig = createArrowMarkerConfig(
      markersLayerId,
      markersSourceId,
      visibility,
    )

    if (mapContext?.addTrailLayerOrdered) {
      mapContext.addTrailLayerOrdered(markerLayerConfig)
    } else {
      addTrailWithFallback(markerLayerConfig)
    }

    if (!historicalTrailLayers.includes(layerId)) {
      historicalTrailLayers = [...historicalTrailLayers, layerId]
    }

    historicalDirectionalLayers = [
      ...historicalDirectionalLayers,
      markersLayerId,
    ]

    console.log(
      `✅ Added historical trail ${trail.id} with ${markers.length} arrow markers`,
    )

    return layerId
  }

  function addTrailWithFallback(layerConfig) {
    try {
      const existingLayers = map.getStyle().layers
      const fieldOutlineLayer = existingLayers.find(
        (layer) =>
          layer.id === "fields-outline" ||
          layer.id === "fields-outline-selected",
      )

      if (fieldOutlineLayer) {
        map.addLayer(layerConfig, fieldOutlineLayer.id)
      } else {
        map.addLayer(layerConfig)
      }
    } catch (error) {
      console.error(`Error adding trail layer ${layerConfig.id}:`, error)
    }
  }

  function convertToLineString(coordinates: TrailCoordinate[]): LineString {
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

  export function updateCurrentTrail(trail: Trail) {
    console.log(`\n📝 Updating current trail: ${trail.id}`)
    updateCombinedActiveTrailsIncremental()
  }

  export function updateOtherActiveTrail(trail: Trail) {
    console.log(`\n📝 Updating other active trail: ${trail.id}`)
    updateCombinedActiveTrailsIncremental()
  }

  async function loadHistoricalTrails() {
    const trails = $historicalTrailStore

    for (let i = 0; i < trails.length; i++) {
      const trail = trails[i]
      try {
        addTrail(trail, true)
        await new Promise((resolve) =>
          setTimeout(resolve, TRAIL_CONFIG.LOAD_DELAY),
        )
      } catch (error) {
        console.error(`Failed to load historical trail ${trail.id}:`, error)
        toast.error(
          `Failed to load corrupt trail data. Please try refreshing.`,
          {
            description: `Trail ${i + 1}/${trails.length} (ID: ${trail.id || "unknown"})`,
          },
        )
      }
    }
  }

  let cleanup = {
    currentTrailUnsubscribe: null as (() => void) | null,
    otherActiveTrailsUnsubscribe: null as (() => void) | null,
    historicalTrailsUnsubscribe: null as (() => void) | null,
  }

  onMount(() => {
    loadHistoricalTrails()

    cleanup.currentTrailUnsubscribe = currentTrailStore.subscribe(
      (currentTrail) => {
        if (map && map.isStyleLoaded()) {
          if (currentTrail && currentTrail.path) {
            updateCurrentTrail(currentTrail)
          }
        }
      },
    )

    cleanup.otherActiveTrailsUnsubscribe = otherActiveTrailStore.subscribe(
      (activeTrails) => {
        if (map && map.isStyleLoaded()) {
          if (activeTrails && activeTrails.length > 0) {
            console.log(
              `\n📡 Other active trails updated: ${activeTrails.length} trails`,
            )
            updateCombinedActiveTrailsIncremental()
          }
        }
      },
    )

    let previousTrails = $historicalTrailStore
    cleanup.historicalTrailsUnsubscribe = historicalTrailStore.subscribe(
      (currentTrails) => {
        if (!map || !map.isStyleLoaded()) {
          previousTrails = [...currentTrails]
          return
        }

        if (previousTrails && currentTrails) {
          const deletedTrails = previousTrails.filter(
            (prevTrail) =>
              !currentTrails.some((currTrail) => currTrail.id === prevTrail.id),
          )

          deletedTrails.forEach((trail) => {
            console.log("🗑️ Removing trail from map:", trail.id)
            removeTrail(trail.id, true)

            const animationSourceId = `animation-source-${trail.id}`
            const animationLayerId = `animation-layer-${trail.id}`
            const animationBorderSourceId = `animation-border-source-${trail.id}`
            const animationBorderLayerId = `animation-border-layer-${trail.id}`
            const markersSourceId = `markers-source-${trail.id}`
            const markersLayerId = `markers-layer-${trail.id}`
            const markersTextLayerId = `markers-text-layer-${trail.id}`

            const layersToRemove = [
              animationLayerId,
              animationBorderLayerId,
              markersLayerId,
              markersTextLayerId,
            ]

            layersToRemove.forEach((layerId) => {
              if (map.getLayer(layerId)) {
                try {
                  map.removeLayer(layerId)
                } catch (error) {
                  console.warn(`Error removing layer ${layerId}:`, error)
                }
              }
            })

            const sourcesToRemove = [
              animationSourceId,
              animationBorderSourceId,
              markersSourceId,
            ]

            sourcesToRemove.forEach((sourceId) => {
              if (map.getSource(sourceId)) {
                try {
                  map.removeSource(sourceId)
                } catch (error) {
                  console.warn(`Error removing source ${sourceId}:`, error)
                }
              }
            })
          })
        }
        previousTrails = [...currentTrails]
      },
    )
  })

  onDestroy(() => {
    if (cleanup.currentTrailUnsubscribe) {
      cleanup.currentTrailUnsubscribe()
    }
    if (cleanup.otherActiveTrailsUnsubscribe) {
      cleanup.otherActiveTrailsUnsubscribe()
    }
    if (cleanup.historicalTrailsUnsubscribe) {
      cleanup.historicalTrailsUnsubscribe()
    }

    lastSegmentIndices.clear()
    lastCoordinateCounts.clear()
    activeTrailsInCombinedLayer.clear()
    previousArrowMarkers = []
    trailDistanceState.clear()
  })

  export const trailManagerAPI = {
    addTrail,
    removeTrail,
    deleteTrail,
    reloadAll: loadHistoricalTrails,
    updateCurrentTrail,
    generateTrailIds,
    calculateZoomDependentWidth,
    createTrailGeoJSON,
  }
</script>

<slot {calculateZoomDependentWidth} {generateTrailIds} {deleteTrail} />
