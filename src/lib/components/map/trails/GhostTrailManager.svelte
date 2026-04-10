<!-- src/lib/components/map/trails/GhostTrailManager.svelte -->
<!-- Renders a short fading "wake" trail behind other vehicles that are actively trailing
     on NON-VISIBLE other operations. Uses 3 stacked concentric layers on the same
     geometry for a smooth soft-glow taper effect.
     Vehicles on the current operation are skipped (ActiveTrailManager handles them).
     Vehicles on visible other operations are skipped (OverlayTrailManager handles those). -->
<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import { get } from "svelte/store"
  import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl"
  import { otherVehiclesDataChanges } from "$lib/stores/vehicleStore"
  import { selectedOperationStore } from "$lib/stores/operationStore"
  import { visibleOperationIdsStore } from "$lib/stores/otherTrailStore"
  import {
    calculateZoomDependentWidth,
  } from "$lib/utils/trailGeometry"

  const mapContext = getContext("map")

  export let map: MapboxMap

  // --- Configuration ---
  const MAX_POINTS = 50 // coordinates per vehicle ring buffer
  const GHOST_SOURCE_PREFIX = "ghost-trail-"
  const GHOST_LAYER_PREFIX = "ghost-trail-layer-"
  const NUM_RINGS = 3 // stacked concentric layers

  // Stacked ring config: [widthMultiplier, peakAlpha] — bottom (widest) first
  const RING_CONFIG: [number, number][] = [
    [1.0, 0.15],  // bottom ring: full swath, soft glow
    [0.85, 0.3],  // middle ring: 85% width, medium
    [0.7, 0.5],   // top ring: 70% width, matches active trail opacity
  ]

  // Vehicle body-color → RGB (matches VehicleTracker colorMap)
  const COLOR_RGB: Record<string, [number, number, number]> = {
    Yellow: [234, 179, 8],
    Orange: [249, 115, 22],
    Red: [239, 68, 68],
    Green: [34, 197, 94],
    Blue: [59, 130, 246],
    Purple: [168, 85, 247],
    HotPink: [236, 72, 153],
  }
  const DEFAULT_RGB: [number, number, number] = [239, 68, 68]

  const DEFAULT_SWATH_WIDTH = 11 // fallback when vehicle_marker.swath is unavailable

  // --- Internal state ---
  interface GhostTrail {
    coords: [number, number][] // [lng, lat]
    rgb: [number, number, number]
    operationId: string | null
    width: number // swath width from vehicle_marker
  }

  let ghostTrails = new Map<string, GhostTrail>()
  let styleReady = false
  let unsubChanges: (() => void) | null = null
  let unsubVisibility: (() => void) | null = null

  // --- Helpers ---

  function sourceId(vid: string) {
    return `${GHOST_SOURCE_PREFIX}${vid}`
  }
  function ringLayerId(vid: string, ring: number) {
    return `${GHOST_LAYER_PREFIX}${vid}-${ring}`
  }

  function toGeoJSON(coords: [number, number][]) {
    if (coords.length < 2) {
      return { type: "FeatureCollection" as const, features: [] }
    }
    return {
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: coords },
      properties: {},
    }
  }

  /** Gradient that holds near peak alpha for most of the trail, then drops
   *  off steeply toward the tail. line-progress: 0=tail, 1=head. */
  function ghostGradientExpr(rgb: [number, number, number], peakAlpha: number) {
    const [r, g, b] = rgb
    return [
      "interpolate",
      ["linear"],
      ["line-progress"],
      0,
      `rgba(${r},${g},${b},0)`,          // tail: fully transparent
      0.15,
      `rgba(${r},${g},${b},0)`,          // still invisible
      0.35,
      `rgba(${r},${g},${b},${(peakAlpha * 0.3).toFixed(3)})`,  // starting to appear
      0.45,
      `rgba(${r},${g},${b},${(peakAlpha * 0.85).toFixed(3)})`, // ramps up steeply
      0.6,
      `rgba(${r},${g},${b},${peakAlpha})`, // near full
      1,
      `rgba(${r},${g},${b},${peakAlpha})`, // head: holds at peak
    ]
  }

  // --- Ensure shared source exists ---

  function ensureSource(vid: string, coords: [number, number][]) {
    const sid = sourceId(vid)
    const data = toGeoJSON(coords)

    if (map.getSource(sid)) {
      ;(map.getSource(sid) as GeoJSONSource).setData(data as any)
    } else {
      map.addSource(sid, {
        type: "geojson",
        lineMetrics: true,
        data: data as any,
      })
    }
  }

  // --- Map layer management ---

  /** Upsert the 3 stacked concentric ring layers for ghost mode */
  function upsertGhostRings(vid: string, trail: GhostTrail) {
    if (!map || !styleReady) return
    try { if (!map.getStyle()) return } catch { return }

    ensureSource(vid, trail.coords)
    const sid = sourceId(vid)

    for (let ring = 0; ring < NUM_RINGS; ring++) {
      const lid = ringLayerId(vid, ring)
      const [widthMult, peakAlpha] = RING_CONFIG[ring]
      const gradient = ghostGradientExpr(trail.rgb, peakAlpha)
      const width = calculateZoomDependentWidth(trail.width * widthMult, 1)

      if (map.getLayer(lid)) {
        try {
          map.setPaintProperty(lid, "line-gradient", gradient)
          map.setPaintProperty(lid, "line-width", width)
        } catch { /* teardown race */ }
        continue
      }

      // Need at least 2 coords for a line
      if (trail.coords.length < 2) continue

      const config: any = {
        id: lid,
        type: "line",
        source: sid,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-width": width,
          "line-gradient": gradient,
          "line-opacity": 1, // alpha is baked into gradient
        },
      }

      if (mapContext?.addTrailLayerOrdered) {
        mapContext.addTrailLayerOrdered(config)
      } else {
        try { map.addLayer(config) } catch (e) {
          console.error(`[GhostTrail] addLayer failed for ${lid}:`, e)
        }
      }
    }
  }

  function removeRingLayers(vid: string) {
    if (!map) return
    for (let ring = 0; ring < NUM_RINGS; ring++) {
      const lid = ringLayerId(vid, ring)
      try { if (map.getLayer(lid)) map.removeLayer(lid) } catch {}
    }
  }

  function removeGhostTrail(vid: string) {
    if (!map) return
    removeRingLayers(vid)
    const sid = sourceId(vid)
    try { if (map.getSource(sid)) map.removeSource(sid) } catch {}
    ghostTrails.delete(vid)
  }

  function rebuildAll() {
    for (const [vid, trail] of ghostTrails) {
      if (trail.coords.length >= 2) {
        upsertGhostRings(vid, trail)
      }
    }
  }

  function removeAllLayers() {
    for (const vid of ghostTrails.keys()) {
      removeRingLayers(vid)
      const sid = sourceId(vid)
      try { if (map.getSource(sid)) map.removeSource(sid) } catch {}
    }
  }

  // --- Process incoming vehicle changes ---

  function processChanges(changes: any[]) {
    if (!map || !styleReady || !changes || changes.length === 0) return

    const currentOpId = get(selectedOperationStore)?.id
    const visibleIds = get(visibleOperationIdsStore)

    for (const change of changes) {
      const {
        vehicle_id,
        coordinates,
        update_types,
        is_trailing,
        vehicle_marker,
        operation_id,
      } = change

      // Vehicle stopped trailing → remove its ghost trail
      if (update_types.includes("trailing_status_changed") && !is_trailing) {
        if (ghostTrails.has(vehicle_id)) {
          removeGhostTrail(vehicle_id)
        }
        continue
      }

      // Only accumulate when trailing AND position changed
      if (!is_trailing || !update_types.includes("position_changed")) continue

      // Skip vehicles on the current operation — ActiveTrailManager handles them
      if (currentOpId && operation_id && operation_id === currentOpId) continue

      // Skip vehicles on visible operations — OverlayTrailManager handles those
      if (operation_id && visibleIds.has(operation_id)) {
        // If we had a ghost trail for this vehicle, remove it
        if (ghostTrails.has(vehicle_id)) {
          removeGhostTrail(vehicle_id)
        }
        continue
      }

      // Parse "(lng,lat)" coordinate string
      const [lng, lat] = coordinates.slice(1, -1).split(",").map(parseFloat)
      if (isNaN(lng) || isNaN(lat)) continue

      let trail = ghostTrails.get(vehicle_id)
      if (!trail) {
        trail = {
          coords: [],
          rgb: COLOR_RGB[vehicle_marker?.bodyColor] || DEFAULT_RGB,
          operationId: operation_id || null,
          width: vehicle_marker?.swath || DEFAULT_SWATH_WIDTH,
        }
        ghostTrails.set(vehicle_id, trail)
      }

      trail.operationId = operation_id || trail.operationId
      if (vehicle_marker?.swath) trail.width = vehicle_marker.swath

      // Ring buffer – drop oldest when full
      trail.coords.push([lng, lat])
      if (trail.coords.length > MAX_POINTS) {
        trail.coords = trail.coords.slice(-MAX_POINTS)
      }

      upsertGhostRings(vehicle_id, trail)
    }
  }

  // --- Lifecycle ---

  onMount(() => {
    unsubChanges = otherVehiclesDataChanges.subscribe(processChanges)

    // When visibility toggles change, remove ghost trails for newly-visible ops
    unsubVisibility = visibleOperationIdsStore.subscribe((visibleIds) => {
      if (!map || !styleReady) return
      for (const [vid, trail] of ghostTrails) {
        if (trail.operationId && visibleIds.has(trail.operationId)) {
          removeGhostTrail(vid)
        }
      }
    })

    if (map) {
      const onStyleLoad = () => {
        styleReady = true
        rebuildAll()
      }

      if (map.isStyleLoaded()) {
        styleReady = true
      }

      map.on("style.load", onStyleLoad)

      return () => {
        map.off("style.load", onStyleLoad)
      }
    }
  })

  onDestroy(() => {
    if (unsubChanges) unsubChanges()
    if (unsubVisibility) unsubVisibility()
    if (map) removeAllLayers()
    ghostTrails.clear()
  })
</script>
