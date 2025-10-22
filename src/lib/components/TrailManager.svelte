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
  let historicalTrailLayers: string[] = [] // Track historical trail layers
  let activeTrailLayers: string[] = [] // Track active trail layers
  let previousHistoricalVisibility = true
  let previousActiveVisibility = true

  // 🆕 Watch for historical trails visibility changes
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

  // 🆕 Watch for active trails visibility changes
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

  // 🆕 Function to update historical trail visibility
  function updateHistoricalTrailVisibility(visible: boolean) {
    if (!map || !map.getStyle()) return

    try {
      const visibility = visible ? "visible" : "none"

      // Update all tracked historical trail layers
      historicalTrailLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility)
        }
      })

      // Also update highlight layers for historical trails
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

  // 🆕 Function to update active trail visibility
  function updateActiveTrailVisibility(visible: boolean) {
    if (!map || !map.getStyle()) return

    try {
      const visibility = visible ? "visible" : "none"

      // Update all tracked active trail layers
      activeTrailLayers.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, "visibility", visibility)
        }
      })

      console.log(
        "✅ Updated active trail visibility:",
        visible,
        "Layers:",
        activeTrailLayers.length,
      )
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
        // Remove from tracking
        if (isHistorical) {
          historicalTrailLayers = historicalTrailLayers.filter(
            (id) => id !== layer,
          )
        } else {
          activeTrailLayers = activeTrailLayers.filter((id) => id !== layer)
        }
      }
    })

    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
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

  // 🆕 Add trail with type tracking (historical vs active)
  export function addTrail(trail: Trail, isHistorical: boolean = true): string {
    const { sourceId, layerId } = generateTrailIds(trail.id)
    const zoomDependentWidth = calculateZoomDependentWidth(
      trail.trail_width || 3,
      1,
    )

    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
      if (isHistorical) {
        historicalTrailLayers = historicalTrailLayers.filter(
          (id) => id !== layerId,
        )
      } else {
        activeTrailLayers = activeTrailLayers.filter((id) => id !== layerId)
      }
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }

    map.addSource(sourceId, {
      type: "geojson",
      data: createTrailGeoJSON(trail.path),
    })

    // 🆕 Set visibility based on trail type
    const visibility = isHistorical
      ? $layerVisibilityStore.historicalTrails
        ? "visible"
        : "none"
      : $layerVisibilityStore.activeTrails
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

    // 🆕 Track this layer in the appropriate array
    if (isHistorical) {
      if (!historicalTrailLayers.includes(layerId)) {
        historicalTrailLayers = [...historicalTrailLayers, layerId]
      }
    } else {
      if (!activeTrailLayers.includes(layerId)) {
        activeTrailLayers = [...activeTrailLayers, layerId]
      }
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

  // 🆕 Current trail is "active"
  export function updateCurrentTrail(trail: Trail) {
    const { sourceId } = generateTrailIds(trail.id)

    if ($currentTrailStore && $currentTrailStore.id !== trail.id) {
      removeTrail($currentTrailStore.id, false) // false = active trail
    }

    if (map.getSource(sourceId)) {
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource
      const lineString = convertToLineString(trail.path as TrailCoordinate[])
      const newCoordinateCount = lineString.coordinates.length

      if (newCoordinateCount !== lastCoordinateCount) {
        const newGeoJSON = {
          type: "Feature",
          properties: {},
          geometry: lineString,
        }
        source.setData(newGeoJSON)
        lastCoordinateCount = newCoordinateCount
      }
    } else {
      const trailWithLineString = {
        ...trail,
        path: convertToLineString(trail.path as TrailCoordinate[]),
      }
      addTrail(trailWithLineString, false) // false = active trail
    }
  }

  // 🆕 Other active trails are also "active"
  export function updateOtherActiveTrail(trail: Trail) {
    const { sourceId } = generateTrailIds(trail.id)

    if (map.getSource(sourceId)) {
      const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource
      const lineString = convertToLineString(trail.path as TrailCoordinate[])
      const newGeoJSON = {
        type: "Feature",
        properties: {},
        geometry: lineString,
      }
      source.setData(newGeoJSON)
    } else {
      const trailWithLineString = {
        ...trail,
        path: convertToLineString(trail.path as TrailCoordinate[]),
      }
      addTrail(trailWithLineString, false) // false = active trail
    }
  }

  // 🆕 Historical trails are "historical"
  async function loadHistoricalTrails() {
    const trails = $historicalTrailStore

    for (let i = 0; i < trails.length; i++) {
      const trail = trails[i]
      try {
        addTrail(trail, true) // true = historical trail
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
          if (activeTrails) {
            activeTrails.forEach((trail) => {
              if (trail && trail.path) {
                updateOtherActiveTrail(trail)
              }
            })
          }
        }
      },
    )

    let previousTrails = $historicalTrailStore
    cleanup.historicalTrailsUnsubscribe = historicalTrailStore.subscribe(
      (currentTrails) => {
        if (previousTrails && currentTrails) {
          const deletedTrails = previousTrails.filter(
            (prevTrail) =>
              !currentTrails.some((currTrail) => currTrail.id === prevTrail.id),
          )
          deletedTrails.forEach((trail) => {
            removeTrail(trail.id, true) // true = historical trail
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
