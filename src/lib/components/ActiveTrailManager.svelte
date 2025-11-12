<!-- src/lib/components/ActiveTrailManager.svelte -->
<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import * as mapboxgl from "mapbox-gl"
  import type { Map } from "mapbox-gl"
  import type { Trail } from "$lib/types/trail"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { otherActiveTrailStore } from "$lib/stores/otherTrailStore"
  import { currentTrailStore } from "$lib/stores/currentTrailStore"
  import {
    TRAIL_CONFIG,
    generateTrailIds,
    calculateZoomDependentWidth,
    createArrowMarkerConfig,
    createInitialCombinedActiveTrailsGeoJSON,
    createActiveTrailMarkers,
    splitTrailIntoSegments,
    type TrailCoordinate,
    type ArrowMarker,
    type TrailDistanceState,
  } from "$lib/utils/trailGeometry"

  const mapContext = getContext("map")

  export let map: Map

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

  // ============================================
  // REACTIVE VISIBILITY UPDATES
  // ============================================

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

  // ============================================
  // VISIBILITY MANAGEMENT
  // ============================================

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
      // When enabling arrows, regenerate them if we have active trails
      if (visible) {
        const allActiveTrails = [
          ...($currentTrailStore ? [$currentTrailStore] : []),
          ...$otherActiveTrailStore,
        ].filter((trail) => trail && trail.path)

        if (allActiveTrails.length > 0) {
          console.log(
            "🔄 Arrows enabled - regenerating markers for active trails",
          )
          const markerSource = map.getSource(
            COMBINED_ACTIVE_MARKERS_SOURCE_ID,
          ) as mapboxgl.GeoJSONSource

          if (markerSource) {
            const result = createActiveTrailMarkers(
              allActiveTrails,
              visible,
              false,
              new Set(),
              previousArrowMarkers,
              trailDistanceState,
            )
            markerSource.setData(result.geoJSON)
            previousArrowMarkers = result.updatedMarkers
            trailDistanceState = result.updatedDistanceState
          }
        }
      }

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

      console.log("✅ Updated active arrow visibility:", visible)
    } catch (error) {
      console.error("Error updating arrow visibility:", error)
    }
  }

  // ============================================
  // COMBINED ACTIVE TRAILS MANAGEMENT
  // ============================================

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

      // Update arrow markers
      const markerSource = map.getSource(
        COMBINED_ACTIVE_MARKERS_SOURCE_ID,
      ) as mapboxgl.GeoJSONSource
      if (markerSource) {
        const result = createActiveTrailMarkers(
          allActiveTrails,
          $layerVisibilityStore.trailArrows,
          true,
          trailsWithChangedCoords,
          previousArrowMarkers,
          trailDistanceState,
        )
        markerSource.setData(result.geoJSON)
        previousArrowMarkers = result.updatedMarkers
        trailDistanceState = result.updatedDistanceState
      }

      console.log(`✅ Incremental update complete`)
    } else {
      console.log(`  ⏭️ No changes`)
    }
  }

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

    const {
      geoJSON: combinedGeoJSON,
      segmentCounts,
      coordinateCounts,
    } = createInitialCombinedActiveTrailsGeoJSON(allActiveTrails)

    const result = createActiveTrailMarkers(
      allActiveTrails,
      $layerVisibilityStore.trailArrows,
      false,
      new Set(),
      [],
      new Map(),
    )

    // Update tracking state
    lastSegmentIndices = segmentCounts
    lastCoordinateCounts = coordinateCounts
    activeTrailsInCombinedLayer = new Set(allActiveTrails.map((t) => t.id))
    previousArrowMarkers = result.updatedMarkers
    trailDistanceState = result.updatedDistanceState

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
      data: result.geoJSON,
    })

    const visibility = $layerVisibilityStore.activeTrails ? "visible" : "none"

    // Main trail layer
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
        "line-width": [
          // ← FIX: Use dynamic width from properties
          "interpolate",
          ["exponential", 2],
          ["zoom"],
          TRAIL_CONFIG.MIN_ZOOM,
          [
            "*",
            ["get", "width"], // ← Get width from feature properties
            TRAIL_CONFIG.MULTIPLIER,
            ["^", 2, TRAIL_CONFIG.MIN_POWER],
          ],
          TRAIL_CONFIG.MAX_ZOOM,
          [
            "*",
            ["get", "width"], // ← Get width from feature properties
            TRAIL_CONFIG.MULTIPLIER,
            ["^", 2, TRAIL_CONFIG.MAX_POWER],
          ],
        ],
        "line-opacity": TRAIL_CONFIG.DEFAULT_OPACITY,
      },
    }

    if (mapContext?.addTrailLayerOrdered) {
      mapContext.addTrailLayerOrdered(mainLayerConfig)
    } else {
      addTrailWithFallback(mainLayerConfig)
    }

    // Arrow markers layer
    const markerLayerConfig = createArrowMarkerConfig(
      COMBINED_ACTIVE_MARKERS_ID,
      COMBINED_ACTIVE_MARKERS_SOURCE_ID,
      visibility,
      $layerVisibilityStore.trailArrows,
    )

    if (mapContext?.addTrailLayerOrdered) {
      mapContext.addTrailLayerOrdered(markerLayerConfig)
    } else {
      addTrailWithFallback(markerLayerConfig)
    }

    console.log(
      `✅ Full rebuild complete: ${combinedGeoJSON.features.length} segments, ${result.geoJSON.features.length} arrow markers`,
    )
  }

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

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

  export function updateCurrentTrail(trail: Trail) {
    console.log(`\n📝 Updating current trail: ${trail.id}`)
    updateCombinedActiveTrailsIncremental()
  }

  export function updateOtherActiveTrail(trail: Trail) {
    console.log(`\n📝 Updating other active trail: ${trail.id}`)
    updateCombinedActiveTrailsIncremental()
  }

  export function removeTrail(trailId: string) {
    lastSegmentIndices.delete(trailId)
    lastCoordinateCounts.delete(trailId)
    activeTrailsInCombinedLayer.delete(trailId)
    trailDistanceState.delete(trailId)
    rebuildCombinedActiveTrails()
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  let currentTrailUnsubscribe: (() => void) | null = null
  let otherActiveTrailsUnsubscribe: (() => void) | null = null

  onMount(() => {
    currentTrailUnsubscribe = currentTrailStore.subscribe((currentTrail) => {
      if (map && map.isStyleLoaded()) {
        if (currentTrail && currentTrail.path) {
          updateCurrentTrail(currentTrail)
        }
      }
    })

    otherActiveTrailsUnsubscribe = otherActiveTrailStore.subscribe(
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
  })

  onDestroy(() => {
    if (currentTrailUnsubscribe) {
      currentTrailUnsubscribe()
    }
    if (otherActiveTrailsUnsubscribe) {
      otherActiveTrailsUnsubscribe()
    }

    lastSegmentIndices.clear()
    lastCoordinateCounts.clear()
    activeTrailsInCombinedLayer.clear()
    previousArrowMarkers = []
    trailDistanceState.clear()
  })

  // ============================================
  // PUBLIC API
  // ============================================

  export const activeTrailAPI = {
    updateCurrentTrail,
    updateOtherActiveTrail,
    removeTrail,
    rebuildAll: rebuildCombinedActiveTrails,
  }
</script>

<slot {updateCurrentTrail} {updateOtherActiveTrail} />
