<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import * as mapboxgl from "mapbox-gl"
  import type { Map } from "mapbox-gl"
  import type { Trail } from "$lib/types/trail"
  import { trailsApi } from "$lib/api/trailsApi"

  import {
    historicalTrailStore,
    otherActiveTrailStore,
  } from "$lib/stores/otherTrailStore"
  import { currentTrailStore } from "$lib/stores/currentTrailStore"
  import { toast } from "svelte-sonner"

  // ✅ Get the layer management context
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

  export function removeTrail(trailId: string) {
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

      toast.success("Trail deleted successfully")
      return true
    } catch (error) {
      console.error("Error deleting trail:", error)
      toast.error(`Error deleting trail: ${error.message || "Unknown error"}`)
      return false
    }
  }

  // ✅ Updated addTrail to use the centralized layer ordering system
  export function addTrail(trail: Trail): string {
    const { sourceId, layerId } = generateTrailIds(trail.id)
    const zoomDependentWidth = calculateZoomDependentWidth(
      trail.trail_width || 3,
      1,
    )

    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId)
    }

    map.addSource(sourceId, {
      type: "geojson",
      data: createTrailGeoJSON(trail.path),
    })

    const layerConfig = {
      id: layerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": trail.trail_color || "#FF0000",
        "line-width": zoomDependentWidth,
        "line-opacity": TRAIL_CONFIG.DEFAULT_OPACITY,
      },
    }

    // ✅ Use the centralized trail layer ordering system
    if (mapContext?.addTrailLayerOrdered) {
      mapContext.addTrailLayerOrdered(layerConfig)
    } else {
      // Fallback to manual insertion
      addTrailWithFallback(layerConfig)
    }

    return layerId
  }

  // ✅ Fallback function for backwards compatibility
  function addTrailWithFallback(layerConfig) {
    try {
      // Try to find field outline layer to insert before it
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
    const { sourceId } = generateTrailIds(trail.id)

    if ($currentTrailStore && $currentTrailStore.id !== trail.id) {
      removeTrail($currentTrailStore.id)
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
      addTrail(trailWithLineString)
    }
  }

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
      addTrail(trailWithLineString)
    }
  }

  async function loadHistoricalTrails() {
    const trails = $historicalTrailStore

    for (let i = 0; i < trails.length; i++) {
      const trail = trails[i]
      try {
        addTrail(trail)
        // Small delay to prevent overwhelming the map
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
            removeTrail(trail.id)
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
