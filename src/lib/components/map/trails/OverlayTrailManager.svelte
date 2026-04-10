<!-- src/lib/components/map/trails/OverlayTrailManager.svelte -->
<!-- Renders trails from other operations as semi-transparent overlays.
     Loads BOTH closed (historical) trails AND active (open) trails.
     Active trails are kept live via Supabase Realtime subscriptions
     that append new coordinates as they arrive. -->
<script lang="ts">
  import { onMount, onDestroy, getContext } from "svelte"
  import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl"
  import { supabase } from "$lib/supabaseClient"
  import { visibleOperationIdsStore, overlayTrailsStore } from "$lib/stores/otherTrailStore"
  import { toast } from "svelte-sonner"
  import {
    calculateZoomDependentWidth,
    createTrailGeoJSON,
  } from "$lib/utils/trailGeometry"

  export let map: MapboxMap

  const mapContext = getContext<any>("map")
  const OVERLAY_OPACITY = 0.5
  const OVERLAY_PREFIX = "overlay-trail"
  const ACTIVE_OVERLAY_PREFIX = "overlay-active-trail"

  // Track which operations have sources on the map
  let renderedOperationIds = new Set<string>()
  // Track all overlay source/layer IDs for cleanup
  let overlayLayers: string[] = []
  let overlaySources: string[] = []
  // Style readiness flag
  let styleReady = false
  let styleLoadHandler: (() => void) | null = null
  let unsubscribe: (() => void) | null = null

  // Active trail state per operation — keyed by operation ID
  let activeTrailsByOp = new Map<string, any[]>()
  // Realtime channels per operation — for trail_stream CDC
  let realtimeChannels = new Map<string, any>()

  function overlayIds(trailId: string, operationId: string) {
    return {
      sourceId: `${OVERLAY_PREFIX}-source-${operationId}-${trailId}`,
      layerId: `${OVERLAY_PREFIX}-layer-${operationId}-${trailId}`,
    }
  }

  function activeOverlayIds(trailId: string, operationId: string) {
    return {
      sourceId: `${ACTIVE_OVERLAY_PREFIX}-source-${operationId}-${trailId}`,
      layerId: `${ACTIVE_OVERLAY_PREFIX}-layer-${operationId}-${trailId}`,
    }
  }

  // ── Fetch closed (historical) trails ──────────────────

  async function fetchClosedTrails(operationId: string) {
    try {
      const { data: trails, error } = await supabase
        .from("trails")
        .select("*")
        .eq("operation_id", operationId)
        .not("end_time", "is", null)
        .order("start_time", { ascending: true })

      if (error) throw error
      if (!trails || trails.length === 0) return []

      const trailsWithPaths = await Promise.all(
        trails.map(async (trail) => {
          try {
            const { data: pathData, error: pathError } = await supabase.rpc(
              "get_trail_path_as_geojson",
              { trail_id_param: trail.id },
            )
            if (pathError) return { ...trail, path: null }
            return { ...trail, path: pathData }
          } catch {
            return { ...trail, path: null }
          }
        }),
      )

      return trailsWithPaths.filter((t) => t.path)
    } catch (error) {
      console.error(`Failed to fetch closed overlay trails for operation ${operationId}:`, error)
      return []
    }
  }

  // ── Fetch active (open) trails ────────────────────────

  async function fetchActiveTrails(operationId: string) {
    try {
      // Get all open trails in this operation
      const { data: openTrails, error: trailsError } = await supabase
        .from("trails")
        .select("id, vehicle_id, operation_id, start_time, end_time, trail_color, trail_width")
        .eq("operation_id", operationId)
        .is("end_time", null)
        .order("start_time", { ascending: false })

      if (trailsError) throw trailsError
      console.log(`[OverlayTrail] fetchActiveTrails(${operationId}): openTrails query returned ${openTrails?.length ?? 0} rows`, openTrails)
      if (!openTrails || openTrails.length === 0) return []

      // Keep only the most recent trail per vehicle
      const seen = new Set<string>()
      const latestTrails = openTrails.filter((t) => {
        if (seen.has(t.vehicle_id)) return false
        seen.add(t.vehicle_id)
        return true
      })
      console.log(`[OverlayTrail] fetchActiveTrails: ${latestTrails.length} latest trails after dedup`, latestTrails.map(t => ({ id: t.id, vehicle_id: t.vehicle_id })))

      // Active trails don't have the `path` column populated on the `trails` table —
      // coordinates live in `trail_stream` rows. Build LineString from those directly.
      const trailsWithPaths = await Promise.all(
        latestTrails.map(async (trail) => {
          try {
            const { data: points, error: pointsError } = await supabase
              .from("trail_stream")
              .select("coordinate, timestamp")
              .eq("trail_id", trail.id)
              .order("timestamp", { ascending: true })

            if (pointsError) {
              console.error(`[OverlayTrail] trail_stream query error for trail ${trail.id}:`, pointsError)
              return { ...trail, path: null }
            }

            if (!points || points.length < 2) {
              console.log(`[OverlayTrail] trail ${trail.id}: only ${points?.length ?? 0} trail_stream points, skipping`)
              return { ...trail, path: null }
            }

            const coordinates = points.map((p: any) => [
              p.coordinate.coordinates[0],
              p.coordinate.coordinates[1],
            ])

            const path = { type: "LineString" as const, coordinates }
            console.log(`[OverlayTrail] trail ${trail.id}: built LineString from ${coordinates.length} trail_stream points`)
            return { ...trail, path, _isActive: true }
          } catch (e) {
            console.error(`[OverlayTrail] exception building path for trail ${trail.id}:`, e)
            return { ...trail, path: null }
          }
        }),
      )

      const filtered = trailsWithPaths.filter((t) => t.path)
      console.log(`[OverlayTrail] fetchActiveTrails: ${trailsWithPaths.length} fetched, ${filtered.length} with valid paths`)
      return filtered
    } catch (error) {
      console.error(`Failed to fetch active overlay trails for operation ${operationId}:`, error)
      return []
    }
  }

  // ── Render a single overlay trail layer ───────────────

  function addOverlayTrail(trail: any, operationId: string, isActive: boolean = false) {
    if (!map || !styleReady) return

    const { sourceId, layerId } = isActive
      ? activeOverlayIds(trail.id, operationId)
      : overlayIds(trail.id, operationId)

    // Clean up existing if present
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    } catch {}

    console.log(`[OverlayTrail] addOverlayTrail: id=${trail.id}, isActive=${isActive}, sourceId=${sourceId}, layerId=${layerId}`, { pathType: typeof trail.path, pathKeys: trail.path ? Object.keys(trail.path) : null, pathSnippet: trail.path ? JSON.stringify(trail.path).slice(0, 200) : null })

    const geoJsonData = createTrailGeoJSON(trail.path)
    console.log(`[OverlayTrail] createTrailGeoJSON result:`, { type: geoJsonData?.type, geomType: (geoJsonData as any)?.geometry?.type, coordCount: (geoJsonData as any)?.geometry?.coordinates?.length })

    const width = calculateZoomDependentWidth(trail.trail_width || 3, 1)

    map.addSource(sourceId, { type: "geojson", data: geoJsonData })

    const layerConfig = {
      id: layerId,
      type: "line",
      source: sourceId,
      layout: {
        "line-join": "round",
        "line-cap": "round",
        visibility: "visible",
      },
      paint: {
        "line-color": trail.trail_color || "#FF0000",
        "line-width": width,
        "line-opacity": OVERLAY_OPACITY,
        // Active trails are solid, closed trails are dashed
        ...(isActive ? {} : { "line-dasharray": [2, 1] }),
      },
    }

    if (mapContext?.addTrailLayerOrdered) {
      mapContext.addTrailLayerOrdered(layerConfig)
    } else {
      map.addLayer(layerConfig)
    }

    if (!overlayLayers.includes(layerId)) overlayLayers.push(layerId)
    if (!overlaySources.includes(sourceId)) overlaySources.push(sourceId)
  }

  // ── Update an active trail's GeoJSON source in-place ──

  function updateActiveTrailSource(trail: any, operationId: string) {
    if (!map || !styleReady) return

    const { sourceId } = activeOverlayIds(trail.id, operationId)

    try {
      const source = map.getSource(sourceId) as GeoJSONSource
      if (source) {
        const geoJsonData = createTrailGeoJSON(trail.path)
        source.setData(geoJsonData as any)
      }
    } catch {
      // Source may not exist yet — add the full layer
      addOverlayTrail(trail, operationId, true)
    }
  }

  // ── Realtime subscription for active trail updates ────

  function subscribeToOperationTrailStream(operationId: string) {
    // Don't double-subscribe
    if (realtimeChannels.has(operationId)) return

    const channel = supabase
      .channel(`overlay_trail_stream_${operationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trail_stream",
          filter: `operation_id=eq.${operationId}`,
        },
        (payload: any) => handleOverlayTrailStreamInsert(operationId, payload),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "trails",
          filter: `operation_id=eq.${operationId}`,
        },
        (payload: any) => handleOverlayTrailUpdate(operationId, payload),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trails",
          filter: `operation_id=eq.${operationId}`,
        },
        (payload: any) => handleOverlayTrailInsert(operationId, payload),
      )
      .subscribe()

    realtimeChannels.set(operationId, channel)
  }

  function unsubscribeFromOperationTrailStream(operationId: string) {
    const channel = realtimeChannels.get(operationId)
    if (channel) {
      try { supabase.removeChannel(channel) } catch {}
      realtimeChannels.delete(operationId)
    }
  }

  function handleOverlayTrailStreamInsert(operationId: string, payload: any) {
    if (!payload.new) return
    const { trail_id, coordinate, timestamp } = payload.new

    const activeTrails = activeTrailsByOp.get(operationId)
    if (!activeTrails) return

    const trail = activeTrails.find((t: any) => t.id === trail_id)
    if (!trail) return

    // Append the new coordinate to the GeoJSON LineString
    const lng = coordinate.coordinates[0]
    const lat = coordinate.coordinates[1]

    if (trail.path?.type === "LineString") {
      trail.path.coordinates.push([lng, lat])
    } else if (trail.path?.geometry?.type === "LineString") {
      trail.path.geometry.coordinates.push([lng, lat])
    }

    updateActiveTrailSource(trail, operationId)
  }

  /** Handle a new trail opening in a visible operation */
  async function handleOverlayTrailInsert(operationId: string, payload: any) {
    if (!payload.new) return
    const trailData = payload.new
    // Only care about open trails
    if (trailData.end_time) return

    try {
      // New trail won't have path data yet — start with empty LineString
      const newTrail = { ...trailData, path: { type: "LineString", coordinates: [] }, _isActive: true }

      const activeTrails = activeTrailsByOp.get(operationId) || []
      activeTrails.push(newTrail)
      activeTrailsByOp.set(operationId, activeTrails)

      addOverlayTrail(newTrail, operationId, true)
    } catch (e) {
      console.error(`[OverlayTrail] Failed to load new active trail:`, e)
    }
  }

  /** Handle a trail closing (end_time set) — move from active to closed rendering */
  function handleOverlayTrailUpdate(operationId: string, payload: any) {
    if (!payload.new) return
    const trailData = payload.new

    // Only care about trail closings
    if (!trailData.end_time) return

    const activeTrails = activeTrailsByOp.get(operationId)
    if (!activeTrails) return

    const idx = activeTrails.findIndex((t: any) => t.id === trailData.id)
    if (idx === -1) return

    const trail = activeTrails[idx]

    // Remove from active tracking
    activeTrails.splice(idx, 1)
    activeTrailsByOp.set(operationId, activeTrails)

    // Remove the active layer
    const { sourceId, layerId } = activeOverlayIds(trail.id, operationId)
    try {
      if (map?.getLayer(layerId)) map.removeLayer(layerId)
      if (map?.getSource(sourceId)) map.removeSource(sourceId)
    } catch {}
    overlayLayers = overlayLayers.filter((l) => l !== layerId)
    overlaySources = overlaySources.filter((s) => s !== sourceId)

    // Re-add as a closed dashed trail
    const closedTrail = { ...trail, ...trailData }
    addOverlayTrail(closedTrail, operationId, false)

    // Update the store
    overlayTrailsStore.update((store) => {
      const opTrails = store[operationId] || []
      return { ...store, [operationId]: [...opTrails, closedTrail] }
    })
  }

  // ── Cleanup operations ────────────────────────────────

  function removeOperationOverlays(operationId: string) {
    if (!map) return

    // Remove closed trail layers
    const layerPrefix = `${OVERLAY_PREFIX}-layer-${operationId}-`
    const sourcePrefix = `${OVERLAY_PREFIX}-source-${operationId}-`
    // Remove active trail layers
    const activeLayerPrefix = `${ACTIVE_OVERLAY_PREFIX}-layer-${operationId}-`
    const activeSourcePrefix = `${ACTIVE_OVERLAY_PREFIX}-source-${operationId}-`

    overlayLayers = overlayLayers.filter((layerId) => {
      if (layerId.startsWith(layerPrefix) || layerId.startsWith(activeLayerPrefix)) {
        try {
          if (map.getLayer(layerId)) map.removeLayer(layerId)
        } catch {}
        return false
      }
      return true
    })

    overlaySources = overlaySources.filter((sourceId) => {
      if (sourceId.startsWith(sourcePrefix) || sourceId.startsWith(activeSourcePrefix)) {
        try {
          if (map.getSource(sourceId)) map.removeSource(sourceId)
        } catch {}
        return false
      }
      return true
    })

    renderedOperationIds.delete(operationId)
    activeTrailsByOp.delete(operationId)

    // Tear down realtime subscription
    unsubscribeFromOperationTrailStream(operationId)

    overlayTrailsStore.update((store) => {
      const next = { ...store }
      delete next[operationId]
      return next
    })
  }

  function removeAllOverlays() {
    if (!map) return

    overlayLayers.forEach((layerId) => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
      } catch {}
    })

    overlaySources.forEach((sourceId) => {
      try {
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      } catch {}
    })

    overlayLayers = []
    overlaySources = []
    renderedOperationIds.clear()
    activeTrailsByOp.clear()
    overlayTrailsStore.set({})

    // Tear down all realtime channels
    for (const [opId] of realtimeChannels) {
      unsubscribeFromOperationTrailStream(opId)
    }
  }

  // ── Primary sync function ─────────────────────────────

  /** Render overlays for any visible operations that aren't on the map yet */
  async function syncVisibleOverlays() {
    if (!map || !styleReady) return

    const visibleIds = new Set<string>()
    const unsub = visibleOperationIdsStore.subscribe((ids) => {
      for (const id of ids) visibleIds.add(id)
    })
    unsub()

    // Remove operations no longer visible
    for (const opId of [...renderedOperationIds]) {
      if (!visibleIds.has(opId)) {
        removeOperationOverlays(opId)
      }
    }

    // Add operations newly visible
    for (const opId of visibleIds) {
      if (!renderedOperationIds.has(opId)) {
        renderedOperationIds.add(opId)

        // Fetch closed + active trails in parallel
        console.log(`[OverlayTrail] syncVisibleOverlays: fetching trails for operation ${opId}`)
        const [closedTrails, activeTrails] = await Promise.all([
          fetchClosedTrails(opId),
          fetchActiveTrails(opId),
        ])
        console.log(`[OverlayTrail] syncVisibleOverlays: fetched ${closedTrails.length} closed, ${activeTrails.length} active for op ${opId}`)

        // Check operation is still visible after async fetch
        let stillVisible = false
        const check = visibleOperationIdsStore.subscribe((ids) => {
          stillVisible = ids.has(opId)
        })
        check()

        if (!stillVisible) {
          renderedOperationIds.delete(opId)
          continue
        }

        // Store closed trails
        overlayTrailsStore.update((store) => ({ ...store, [opId]: closedTrails }))

        // Render closed trails (dashed)
        for (const trail of closedTrails) {
          addOverlayTrail(trail, opId, false)
        }

        // Track and render active trails (solid)
        if (activeTrails.length > 0) {
          activeTrailsByOp.set(opId, activeTrails)
          for (const trail of activeTrails) {
            addOverlayTrail(trail, opId, true)
          }
        }

        // Subscribe to realtime updates for active trails
        subscribeToOperationTrailStream(opId)

        const totalCount = closedTrails.length + activeTrails.length
        if (totalCount > 0) {
          const parts: string[] = []
          if (closedTrails.length > 0) parts.push(`${closedTrails.length} closed`)
          if (activeTrails.length > 0) parts.push(`${activeTrails.length} active`)
          toast.success(`Loaded ${parts.join(" + ")} overlay trail${totalCount > 1 ? "s" : ""}`)
        } else {
          toast.info("No trails found for this operation")
        }
      }
    }
  }

  // ── Lifecycle ─────────────────────────────────────────

  onMount(() => {
    if (!map) return

    // Subscribe to visibility changes
    unsubscribe = visibleOperationIdsStore.subscribe(() => {
      if (styleReady) {
        syncVisibleOverlays()
      }
    })

    // Style load handler — fires on initial load AND after satellite style switch
    styleLoadHandler = () => {
      styleReady = true
      // After a style change all sources/layers are wiped — rebuild
      overlayLayers = []
      overlaySources = []
      renderedOperationIds.clear()
      activeTrailsByOp.clear()
      syncVisibleOverlays()
    }
    map.on("style.load", styleLoadHandler)

    // Check if style already loaded
    try {
      const style = map.getStyle()
      if (style && style.layers && style.layers.length > 0) {
        styleReady = true
        syncVisibleOverlays()
      }
    } catch {}
  })

  onDestroy(() => {
    if (unsubscribe) unsubscribe()
    if (styleLoadHandler && map) map.off("style.load", styleLoadHandler)
    removeAllOverlays()
  })
</script>
