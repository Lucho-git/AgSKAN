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
    SEGMENT_DURATION: 900000, // 5 minutes in milliseconds
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

  export let map: Map

  let lastCoordinateCount = 0
  let historicalTrailLayers: string[] = []
  let previousHistoricalVisibility = true
  let previousActiveVisibility = true

  // Track segment counts AND coordinate counts per trail
  let lastSegmentIndices = new Map<string, number>()
  let lastCoordinateCounts = new Map<string, number>()

  // Track which trails are in the combined layer
  let activeTrailsInCombinedLayer = new Set<string>()

  // Single combined source for all active trails
  const COMBINED_ACTIVE_SOURCE_ID = "all-active-trails-combined"
  const COMBINED_ACTIVE_LAYER_ID = "all-active-trails-layer"

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

  function updateHistoricalTrailVisibility(visible: boolean) {
    if (!map || !map.getStyle()) return

    try {
      const visibility = visible ? "visible" : "none"

      historicalTrailLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility)
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

      if (map.getLayer(COMBINED_ACTIVE_LAYER_ID)) {
        map.setLayoutProperty(
          COMBINED_ACTIVE_LAYER_ID,
          "visibility",
          visibility,
        )
      }

      console.log("✅ Updated active trail visibility:", visible)
    } catch (error) {
      console.error("Error updating active trail visibility:", error)
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

  // Split trail into time-based segments with sort keys and trail metadata
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

        currentSegment = [coord]
        segmentStartTime = coord.timestamp
      }
    })

    return segments
  }

  // Create initial combined GeoJSON (used only on first load)
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

      // Track both segment and coordinate counts
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

  // 🆕 FIXED: Incremental update that handles both new segments AND updated existing segments
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

    // Check if source exists
    const source = map.getSource(
      COMBINED_ACTIVE_SOURCE_ID,
    ) as mapboxgl.GeoJSONSource
    if (!source) {
      console.log("⚠️ Source doesn't exist, doing full rebuild")
      rebuildCombinedActiveTrails()
      return
    }

    // Get existing features (safely)
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

    // Check for removed trails
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
      })
      rebuildCombinedActiveTrails()
      return
    }

    let hasChanges = false
    let totalNewSegments = 0

    // 🆕 Build a new feature array by updating/replacing segments
    const updatedFeatures = []
    const processedTrailIds = new Set<string>()

    // Process each active trail
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

      // Get all segments for this trail (fresh calculation)
      const allSegments = splitTrailIntoSegments(
        trailCoordinates,
        trail.id,
        trail.trail_color || "#FF0000",
        trail.trail_width || 3,
      )

      processedTrailIds.add(trail.id)

      // Check if this is a new trail
      if (!activeTrailsInCombinedLayer.has(trail.id)) {
        console.log(`  ✨ New trail detected: ${trail.id}`)
        activeTrailsInCombinedLayer.add(trail.id)
        updatedFeatures.push(...allSegments)
        lastSegmentIndices.set(trail.id, allSegments.length)
        lastCoordinateCounts.set(trail.id, currentCoordCount)
        totalNewSegments += allSegments.length
        hasChanges = true
      } else if (currentCoordCount !== previousCoordCount) {
        // 🆕 Coordinates changed - replace ALL segments for this trail
        console.log(
          `  🔄 Trail ${trail.id}: Coordinates changed, updating all segments (${lastSegmentIndex} → ${allSegments.length} segments)`,
        )
        updatedFeatures.push(...allSegments)

        if (allSegments.length > lastSegmentIndex) {
          totalNewSegments += allSegments.length - lastSegmentIndex
        }

        lastSegmentIndices.set(trail.id, allSegments.length)
        lastCoordinateCounts.set(trail.id, currentCoordCount)
        hasChanges = true
      } else {
        // No changes - keep existing segments
        console.log(`    ⏭️ No changes`)
        // Add existing segments for this trail
        const existingTrailSegments = existingFeatures.filter(
          (feature: any) => feature.properties.trailId === trail.id,
        )
        updatedFeatures.push(...existingTrailSegments)
      }
    })

    // Add segments from other trails that weren't processed (shouldn't happen, but safety)
    existingFeatures.forEach((feature: any) => {
      if (!processedTrailIds.has(feature.properties.trailId)) {
        updatedFeatures.push(feature)
      }
    })

    if (hasChanges) {
      console.log(`  📊 Total new segments: ${totalNewSegments}`)
      console.log(`  📊 Total segments now: ${updatedFeatures.length}`)

      // Update the source with new data (no flicker!)
      source.setData({
        type: "FeatureCollection",
        features: updatedFeatures,
      })
      console.log(`✅ Incremental update complete`)
    } else {
      console.log(`  ⏭️ No changes`)
    }
  }

  // Full rebuild (only used when necessary)
  function rebuildCombinedActiveTrails() {
    console.log("\n🔨 FULL REBUILD")

    const allActiveTrails = [
      ...($currentTrailStore ? [$currentTrailStore] : []),
      ...$otherActiveTrailStore,
    ].filter((trail) => trail && trail.path)

    console.log(`Active trails: ${allActiveTrails.length}`)

    if (allActiveTrails.length === 0) {
      console.log("⚠️ No active trails to display")
      if (map.getLayer(COMBINED_ACTIVE_LAYER_ID)) {
        map.removeLayer(COMBINED_ACTIVE_LAYER_ID)
      }
      if (map.getSource(COMBINED_ACTIVE_SOURCE_ID)) {
        map.removeSource(COMBINED_ACTIVE_SOURCE_ID)
      }
      lastSegmentIndices.clear()
      lastCoordinateCounts.clear()
      activeTrailsInCombinedLayer.clear()
      return
    }

    const combinedGeoJSON =
      createInitialCombinedActiveTrailsGeoJSON(allActiveTrails)

    // Remove existing combined layer and source
    if (map.getLayer(COMBINED_ACTIVE_LAYER_ID)) {
      map.removeLayer(COMBINED_ACTIVE_LAYER_ID)
    }
    if (map.getSource(COMBINED_ACTIVE_SOURCE_ID)) {
      map.removeSource(COMBINED_ACTIVE_SOURCE_ID)
    }

    // Add new combined source
    map.addSource(COMBINED_ACTIVE_SOURCE_ID, {
      type: "geojson",
      data: combinedGeoJSON,
    })

    const visibility = $layerVisibilityStore.activeTrails ? "visible" : "none"

    // Add new combined layer with data-driven styling
    const layerConfig = {
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
      mapContext.addTrailLayerOrdered(layerConfig)
    } else {
      addTrailWithFallback(layerConfig)
    }

    console.log(
      `✅ Full rebuild complete: ${combinedGeoJSON.features.length} segments`,
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

    const layersToRemove = [
      highlightLayerId,
      highlightBackgroundLayerId,
      layerId,
    ]

    layersToRemove.forEach((layer) => {
      if (map.getLayer(layer)) {
        map.removeLayer(layer)
        if (isHistorical) {
          historicalTrailLayers = historicalTrailLayers.filter(
            (id) => id !== layer,
          )
        }
      }
    })

    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }

    // Clean up tracking for active trails
    if (!isHistorical) {
      lastSegmentIndices.delete(trailId)
      lastCoordinateCounts.delete(trailId)
      activeTrailsInCombinedLayer.delete(trailId)
      // Rebuild to remove segments
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

  // Add individual historical trail
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

    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
      historicalTrailLayers = historicalTrailLayers.filter(
        (id) => id !== layerId,
      )
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }

    const geoJsonData = createTrailGeoJSON(trail.path)

    map.addSource(sourceId, {
      type: "geojson",
      data: geoJsonData,
    })

    const visibility = $layerVisibilityStore.historicalTrails
      ? "visible"
      : "none"

    const layerConfig = {
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
      mapContext.addTrailLayerOrdered(layerConfig)
    } else {
      addTrailWithFallback(layerConfig)
    }

    if (!historicalTrailLayers.includes(layerId)) {
      historicalTrailLayers = [...historicalTrailLayers, layerId]
    }

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

  // Update functions now use incremental updates
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
