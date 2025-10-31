<!-- src/lib/components/HistoricalTrailManager.svelte -->
<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import type { Map } from "mapbox-gl"
  import type { Trail } from "$lib/types/trail"
  import { trailsApi } from "$lib/api/trailsApi"
  import { layerVisibilityStore } from "$lib/stores/layerVisibilityStore"
  import { historicalTrailStore } from "$lib/stores/otherTrailStore"
  import { toast } from "svelte-sonner"
  import {
    TRAIL_CONFIG,
    generateTrailIds,
    calculateZoomDependentWidth,
    createArrowMarkerConfig,
    createTrailGeoJSON,
    generateArrowMarkersIncremental,
    type TrailCoordinate,
  } from "$lib/utils/trailGeometry"

  const mapContext = getContext("map")

  export let map: Map

  let historicalTrailLayers: string[] = []
  let historicalDirectionalLayers: string[] = []
  let previousHistoricalVisibility = true
  let previousArrowsVisibility = false

  // ============================================
  // REACTIVE VISIBILITY UPDATES
  // ============================================

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

  function updateArrowVisibility(visible: boolean) {
    if (!map || !map.getStyle || !map.getStyle()) return

    try {
      // Update historical trail arrows
      const historicalArrowVisibility =
        visible && $layerVisibilityStore.historicalTrails ? "visible" : "none"

      const allLayers = map.getStyle().layers
      const historicalMarkerLayers = allLayers
        .filter(
          (layer) =>
            layer.id.includes("-markers") &&
            layer.id.startsWith("trail-layer-"),
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

      console.log("✅ Updated historical arrow visibility:", visible)
    } catch (error) {
      console.error("Error updating arrow visibility:", error)
    }
  }

  // ============================================
  // TRAIL CRUD OPERATIONS
  // ============================================

  export function addTrail(trail: Trail): string {
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

    // Main trail layer
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

    // Arrow markers layer
    const markerLayerConfig = createArrowMarkerConfig(
      markersLayerId,
      markersSourceId,
      visibility,
      $layerVisibilityStore.trailArrows,
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

  export function removeTrail(trailId: string) {
    const { sourceId, layerId, highlightLayerId, highlightBackgroundLayerId } =
      generateTrailIds(trailId)

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

  async function loadHistoricalTrails() {
    const trails = $historicalTrailStore

    for (let i = 0; i < trails.length; i++) {
      const trail = trails[i]
      try {
        addTrail(trail)
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

  // ============================================
  // LIFECYCLE
  // ============================================

  let historicalTrailsUnsubscribe: (() => void) | null = null

  onMount(() => {
    loadHistoricalTrails()

    let previousTrails = $historicalTrailStore
    historicalTrailsUnsubscribe = historicalTrailStore.subscribe(
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
            removeTrail(trail.id)

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
    if (historicalTrailsUnsubscribe) {
      historicalTrailsUnsubscribe()
    }
  })

  // ============================================
  // PUBLIC API
  // ============================================

  export const historicalTrailAPI = {
    addTrail,
    removeTrail,
    deleteTrail,
    reloadAll: loadHistoricalTrails,
  }
</script>

<slot {deleteTrail} />
