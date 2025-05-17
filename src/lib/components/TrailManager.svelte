<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import * as mapboxgl from "mapbox-gl"
  import type { Map } from "mapbox-gl"
  import type { Trail } from "$lib/types/trail"
  import { trailsApi } from "$lib/api/trailsApi"

  import {
    historicalTrailStore,
    otherActiveTrailStore,
  } from "$lib/stores/otherTrailStore"
  import { currentTrailStore } from "$lib/stores/currentTrailStore"
  // initializeSession is imported but not used, can be removed if not needed elsewhere
  // import { initializeSession } from "$lib/stores/sessionStore"
  import { toast } from "svelte-sonner"
  // authenticatedFetch is imported but not used, can be removed if not needed elsewhere
  // import { authenticatedFetch } from "$lib/helpers/authHelpers"

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

  // Reference to the layerId of the *first* active trail (current or other) that is added.
  // Historical trails will be added *before* this layer.
  let firstActiveTrailLayerId: string | null = null

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

    if (firstActiveTrailLayerId === layerId) {
      firstActiveTrailLayerId = null
      console.log(
        `Cleared firstActiveTrailLayerId because ${layerId} was removed.`,
      )
    }

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
    // console.log(`Removed trail ${trailId}`);
  }

  export async function deleteTrail(trailId: string) {
    try {
      console.log(`Deleting trail: ${trailId}`)
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
      // Corrected: console.error is now inside the catch block
      console.error("Error deleting trail:", error)
      toast.error(`Error deleting trail: ${error.message || "Unknown error"}`)
      return false
    }
  }

  // Modified addTrail to accept an optional beforeId and return the layerId
  export function addTrail(trail: Trail, beforeId?: string | null): string {
    const { sourceId, layerId } = generateTrailIds(trail.id)
    const zoomDependentWidth = calculateZoomDependentWidth(
      trail.trail_width || 3,
      1,
    )

    if (map.getLayer(layerId)) {
      console.warn(
        `Layer ${layerId} already exists for trail ${trail.id}. Removing before re-adding.`,
      )
      map.removeLayer(layerId)
    }
    if (map.getSource(sourceId)) {
      console.warn(
        `Source ${sourceId} already exists for trail ${trail.id}. Removing before re-adding.`,
      )
      map.removeSource(sourceId)
    }

    map.addSource(sourceId, {
      type: "geojson",
      data: createTrailGeoJSON(trail.path),
    })

    map.addLayer(
      {
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
      },
      beforeId || undefined,
    )

    // console.log(`Added trail ${trail.id} (layer: ${layerId}) ${beforeId ? 'before ' + beforeId : 'on top'}`);
    return layerId
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
      console.log("Cleaning up old current trail:", $currentTrailStore.id)
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
      // console.log("Creating new current trail source:", sourceId)
      const trailWithLineString = {
        ...trail,
        path: convertToLineString(trail.path as TrailCoordinate[]),
      }
      const newLayerId = addTrail(trailWithLineString, null)
      if (!firstActiveTrailLayerId) {
        firstActiveTrailLayerId = newLayerId
        // console.log(`Set firstActiveTrailLayerId to current user's trail: ${newLayerId}`);
      }
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
      // console.log("Creating new other active trail source:", sourceId);
      const trailWithLineString = {
        ...trail,
        path: convertToLineString(trail.path as TrailCoordinate[]),
      }
      const newLayerId = addTrail(trailWithLineString, null)
      if (!firstActiveTrailLayerId) {
        firstActiveTrailLayerId = newLayerId
        // console.log(`Set firstActiveTrailLayerId to other user's trail: ${newLayerId}`);
      }
    }
  }

  async function loadHistoricalTrails() {
    console.log("Starting to load historical trails", {
      totalTrails: $historicalTrailStore.length,
    })

    for (let i = 0; i < $historicalTrailStore.length; i++) {
      const trail = $historicalTrailStore[i]
      try {
        // console.log(`Attempting to load historical trail ${trail.id}, before: ${firstActiveTrailLayerId}`);
        await addTrail(trail, firstActiveTrailLayerId)

        await new Promise((resolve) =>
          setTimeout(resolve, TRAIL_CONFIG.LOAD_DELAY),
        )
      } catch (error) {
        console.error(`Failed to load historical trail ${trail.id}:`, error)
        toast.error(
          `Failed to load corrupt trail data. Please try refreshing.`,
          {
            description: `Trail ${i + 1}/${$historicalTrailStore.length} (ID: ${trail.id || "unknown"})`,
          },
        )
      }
    }
    console.log("Finished loading historical trails")
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
        } else if (currentTrail && currentTrail.path) {
          console.warn(
            "Map not ready for currentTrail update, will retry or queue if implemented.",
          )
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
        } else if (activeTrails && activeTrails.length > 0) {
          console.warn(
            "Map not ready for otherActiveTrailStore update, will retry or queue if implemented.",
          )
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
            // console.log("Deleting historical trail from map due to store change:", trail.id);
            removeTrail(trail.id)
          })
        }
        previousTrails = [...currentTrails]
      },
    )
  })

  onDestroy(() => {
    console.log("Cleaning up trail subscriptions")
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
