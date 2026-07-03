<!-- src/lib/components/map/trails/FieldTrailOverlay.svelte -->
<!--
  Full-screen interactive Mapbox map showing a field boundary with all
  spray record trail paths overlaid. Features:
  - Zoom-dependent trail width (matches MapViewer scaling via calculateZoomDependentWidth)
  - Hover/click trails to see operator, vehicle, date, area info
  - Timeline filter (1 day, 7 days, 30 days, all time)
  - Color-coded per record, intervals as separate lines (gaps visible)
  - Entry/exit markers per interval
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import mapboxgl from "mapbox-gl"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import { calculateZoomDependentWidth } from "$lib/utils/trailGeometry"
  import { Calendar, X, User, Tractor, Ruler, Clock, FileText, MapPin } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  export let fieldBoundary: any = null
  export let records: any[] = []
  export let fieldName = ""
  export let lockedMode = false // when true: no time slider, no pan/zoom

  let map: mapboxgl.Map | null = null
  let container: HTMLElement
  let popup: mapboxgl.Popup | null = null
  let selectedTrail = null as any
  let mapLoaded = false
  let renderTimer: ReturnType<typeof setTimeout> | null = null

  // Date range slider state
  let rangeMode = "7d" // default to last 7 days
  let sliderMin = 0
  let sliderMax = 100
  let sliderStart = 0
  let sliderEnd = 100
  let rangeInitialized = false

  // High-contrast palette optimized for satellite imagery visibility.
  // 12 colors — enough for most field views without adjacent duplicates.
  const TRAIL_COLORS = [
    "#ef4444", "#3b82f6", "#22c55e", "#f97316",
    "#a855f7", "#06b6d4", "#eab308", "#ec4899",
    "#84cc16", "#f43f5e", "#8b5cf6", "#14b8a6",
  ]

  // Deterministic color assignment: hash the record ID to a stable index.
  // This ensures the same record always gets the same color regardless of
  // sort order or filter state, which helps users recognize patterns.
  // In locked mode (single record preview), always use red to match thumbnails.
  function getTrailColor(record: any, idx: number): string {
    if (lockedMode) return "#ef4444"
    if (record.id) {
      let hash = 0
      const s = String(record.id)
      for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0
      return TRAIL_COLORS[Math.abs(hash) % TRAIL_COLORS.length]
    }
    return TRAIL_COLORS[idx % TRAIL_COLORS.length]
  }

  // Compute the time range from records
  $: recordTimes = records.map(r => new Date(r.start_time).getTime()).sort((a, b) => a - b)
  $: timeMin = recordTimes.length > 0 ? recordTimes[0] : Date.now() - 86400000
  $: timeMax = recordTimes.length > 0 ? recordTimes[recordTimes.length - 1] : Date.now()

  // When rangeMode changes or records load, update slider bounds
  $: {
    if (rangeMode === "all" || lockedMode) {
      sliderMin = timeMin
      sliderMax = timeMax
    } else {
      const periods: Record<string, number> = { "1d": 86400000, "7d": 604800000, "30d": 2592000000, "1y": 31536000000 }
      const span = periods[rangeMode] || 604800000
      sliderMax = Date.now()
      sliderMin = sliderMax - span
      // Clamp to actual record range
      sliderMin = Math.max(sliderMin, timeMin - 86400000)
      sliderMax = Math.min(sliderMax, timeMax + 86400000)
    }
    sliderStart = sliderMin
    sliderEnd = sliderMax
    rangeInitialized = true
  }

  // Filter records by slider range — computed synchronously in renderTrails
  // to avoid reactive ordering issues on initial load
  function getFilteredRecords() {
    // In locked mode, show all records regardless of slider
    if (lockedMode) return records
    return records.filter(r => {
      const t = new Date(r.start_time).getTime()
      return t >= sliderStart && t <= sliderEnd
    })
  }

  // Reactive version for stats display
  $: filteredRecords = records.filter(r => {
    const t = new Date(r.start_time).getTime()
    return t >= sliderStart && t <= sliderEnd
  })

  // Format slider positions to dates
  $: sliderStartPct = sliderMax > sliderMin ? ((sliderStart - sliderMin) / (sliderMax - sliderMin)) * 100 : 0
  $: sliderEndPct = sliderMax > sliderMin ? ((sliderEnd - sliderMin) / (sliderMax - sliderMin)) * 100 : 100

  // Tick marks for each record's start time along the slider
  $: sliderTicks = records.map(r => {
    const t = new Date(r.start_time).getTime()
    if (sliderMax > sliderMin) {
      return Math.max(0, Math.min(100, ((t - sliderMin) / (sliderMax - sliderMin)) * 100))
    }
    return 0
  })

  function formatSliderDate(ts: number): string {
    return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
  }

  // Minimum gap between handles (1 hour)
  const SLIDER_MIN_GAP = 3600000

  function onSliderStartChange(e: Event) {
    const input = e.target as HTMLInputElement
    const val = parseInt(input.value)
    // Prevent start handle from crossing past end handle
    const clamped = Math.min(val, sliderEnd - SLIDER_MIN_GAP)
    sliderStart = clamped
    // Force the DOM input to reflect the clamped position (prevents visual crossing)
    if (clamped !== val) input.value = String(clamped)
  }
  function onSliderEndChange(e: Event) {
    const input = e.target as HTMLInputElement
    const val = parseInt(input.value)
    // Prevent end handle from crossing past start handle
    const clamped = Math.max(val, sliderStart + SLIDER_MIN_GAP)
    sliderEnd = clamped
    // Force the DOM input to reflect the clamped position (prevents visual crossing)
    if (clamped !== val) input.value = String(clamped)
  }

  // Extract all outer ring coordinates from Polygon or MultiPolygon
  function getAllOuterRings(boundary: any): [number, number][] {
    if (boundary.type === "Polygon") {
      return boundary.coordinates[0]
    } else if (boundary.type === "MultiPolygon") {
      // Flatten all sub-polygon outer rings into one array
      return boundary.coordinates.flatMap((poly: number[][][]) => poly[0])
    }
    return []
  }

  function getBoundsFromBoundary(boundary: any): mapboxgl.LngLatBoundsLike {
    const coords = getAllOuterRings(boundary)
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of coords) {
      minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat)
    }
    return [[minLng, minLat], [maxLng, maxLat]] as mapboxgl.LngLatBoundsLike
  }

  function formatDuration(seconds: number): string {
    if (!seconds) return "0s"
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m`
    return `${seconds}s`
  }
  function formatDate(ts: string): string { return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) }
  function formatTime(ts: string): string { return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }
  function formatHa(ha: any): string { return `${parseFloat(String(ha || 0)).toFixed(2)} ha` }
  function formatKm(km: any): string { return `${parseFloat(String(km || 0)).toFixed(2)} km` }
  function formatVehicleType(type: string): string { return type ? type.replace(/([A-Z])/g, " $1").trim() : "Unknown" }

  // Get the centroid of a polygon for label placement
  function getFieldCentroid(boundary: any): [number, number] | null {
    const coords = getAllOuterRings(boundary)
    let lng = 0, lat = 0
    for (const [cLng, cLat] of coords) { lng += cLng; lat += cLat }
    return coords.length > 0 ? [lng / coords.length, lat / coords.length] : null
  }

  // Debounced render — prevents flickering while dragging the slider
  function scheduleRender() {
    if (renderTimer) clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      renderTrails()
      renderTimer = null
    }, 150)
  }

  // Highlight selected trail with a thin white outline (not a colored glow)
  function highlightSelectedTrail() {
    if (!map) {
      console.log("[FieldOverlay] highlightSelectedTrail early return — no map")
      return
    }
    // Reset all TRAIL outline layers to 0 opacity (only trail- prefixed, not field-outline)
    const trailOutlines = map.getStyle().layers.filter(
      (l: any) => l.id.startsWith("trail-") && l.id.endsWith("-outline")
    )
    console.log("[FieldOverlay] highlightSelectedTrail resetting", trailOutlines.length, "trail outline layers")
    for (const layer of trailOutlines) {
      try { map.setPaintProperty(layer.id, "line-opacity", 0) }
      catch (err) { console.error("[FieldOverlay] Failed to reset outline", layer.id, err) }
    }
    // Show white outline on selected trail
    if (selectedTrail) {
      const baseId = selectedTrail.intervalIdx !== undefined && selectedTrail.intervalIdx !== null
        ? `trail-${selectedTrail.recordIdx}-${selectedTrail.intervalIdx}`
        : `trail-${selectedTrail.recordIdx}`
      const outlineId = `${baseId}-outline`
      console.log("[FieldOverlay] highlightSelectedTrail", { baseId, outlineId, layerExists: map.getLayer(outlineId) })
      if (map.getLayer(outlineId)) {
        try {
          map.setPaintProperty(outlineId, "line-opacity", 1.0)
          console.log("[FieldOverlay] outline opacity set to 1.0 ✓")
        } catch (err) {
          console.error("[FieldOverlay] Failed to set outline opacity", outlineId, err)
        }
      } else {
        console.warn("[FieldOverlay] outline layer NOT found!", outlineId)
      }
    }
  }

  function renderTrails() {
    if (!map) {
      console.warn("[FieldOverlay] renderTrails called but map not ready", { map: !!map })
      return
    }

    // Compute filtered records synchronously (don't rely on reactive $: which may not have settled)
    const activeRecords = getFilteredRecords()
    console.log(`[FieldOverlay] renderTrails: ${activeRecords.length} records to render (of ${records.length} total)`, {
      sliderStart: new Date(sliderStart).toISOString(),
      sliderEnd: new Date(sliderEnd).toISOString(),
      rangeInitialized,
      lockedMode,
      mapLoaded,
    })

    // Remove existing trail layers/sources
    for (const layer of map.getStyle().layers.filter((l: any) => l.id.startsWith("trail-"))) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id)
    }
    for (const source of Object.keys(map.getStyle().sources).filter(s => s.startsWith("trail-"))) {
      if (map.getSource(source)) map.removeSource(source)
    }

    if (activeRecords.length === 0) {
      console.log("[FieldOverlay] No records to render")
      return
    }

    // Sort by start_time so older trails are underneath, newer on top
    const sortedRecords = activeRecords.slice().sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )

    sortedRecords.forEach((record, recordIdx) => {
      const color = getTrailColor(record, recordIdx)
      const trailWidth = record.swath_width || 3

      if (record.interval_paths?.length) {
        record.interval_paths.forEach((interval: any, intervalIdx: number) => {
          if (!interval.path_geojson?.coordinates?.length) return
          const layerId = `trail-${recordIdx}-${intervalIdx}`
          const sourceId = `trail-${recordIdx}-${intervalIdx}`
          const markerSourceId = `trail-markers-${recordIdx}-${intervalIdx}`

          map!.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {
                recordIdx, intervalIdx,
                operator: record.operator_name || "Unknown",
                vehicle: formatVehicleType(record.vehicle_type),
                date: formatDate(record.start_time),
                startTime: formatTime(interval.entry_time),
                endTime: formatTime(interval.exit_time),
                area: formatHa(interval.area_hectares),
                distance: formatKm(interval.distance_km),
                duration: formatDuration(record.duration_seconds),
                color,
              },
              geometry: interval.path_geojson,
            },
          })

          // White outline layer (under main trail, slightly wider — shown when selected)
          map!.addLayer({
            id: `${layerId}-outline`, type: "line", source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#ffffff",
              "line-width": calculateZoomDependentWidth(trailWidth, 1.3),
              "line-opacity": 0,
            },
          })

          map!.addLayer({
            id: layerId, type: "line", source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": color,
              "line-width": calculateZoomDependentWidth(trailWidth, 1),
              "line-opacity": 0.85,
            },
          })

          // Entry/exit markers
          const coords = interval.path_geojson.coordinates
          if (coords.length >= 2) {
            map!.addSource(markerSourceId, {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: [
                  { type: "Feature", properties: { type: "entry" }, geometry: { type: "Point", coordinates: coords[0] } },
                  { type: "Feature", properties: { type: "exit" }, geometry: { type: "Point", coordinates: coords[coords.length - 1] } },
                ],
              },
            })
            map!.addLayer({
              id: `${layerId}-markers-entry`, type: "circle", source: markerSourceId,
              filter: ["==", ["get", "type"], "entry"],
              paint: { "circle-radius": 6, "circle-color": "#22c55e", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-opacity": 0.9 },
            })
            map!.addLayer({
              id: `${layerId}-markers-exit`, type: "circle", source: markerSourceId,
              filter: ["==", ["get", "type"], "exit"],
              paint: { "circle-radius": 4, "circle-color": "#ef4444", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-opacity": 0.9 },
            })
          }
        })
      } else if (record.field_path?.coordinates?.length) {
        const layerId = `trail-${recordIdx}`
        const sourceId = `trail-${recordIdx}`
        map!.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { recordIdx, operator: record.operator_name || "Unknown", vehicle: formatVehicleType(record.vehicle_type), date: formatDate(record.start_time), area: formatHa(record.area_hectares), distance: formatKm(record.distance_km), color },
            geometry: record.field_path,
          },
        })
        map!.addLayer({
          id: `${layerId}-outline`, type: "line", source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": calculateZoomDependentWidth(trailWidth, 1.3), "line-opacity": 0 },
        })
        map!.addLayer({
          id: layerId, type: "line", source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": color, "line-width": calculateZoomDependentWidth(trailWidth, 1), "line-opacity": 0.85 },
        })
      }
    })

    setupHover()
    // Ensure field label is always on top of all trail layers
    if (map!.getLayer("field-label")) map!.moveLayer("field-label")
    if (selectedTrail) {
      highlightSelectedTrail()
      bringTrailToTop(selectedTrail)
    }
  }

  // Track registered handlers so we can remove them before re-adding
  let hoverHandlerActive = false
  let clickHandlerActive = false

  // Get the current trail layer IDs (recomputed each render)
  function getTrailLayerIds(): string[] {
    if (!map) return []
    return map.getStyle().layers
      .filter((l: any) => l.id.startsWith("trail-") && !l.id.endsWith("-outline") && !l.id.endsWith("-entry") && !l.id.endsWith("-exit") && l.type === "line")
      .map((l: any) => l.id)
  }

  // Single mousemove handler on the map — queries features at cursor point.
  // This is the standard Mapbox pattern for hover with overlapping layers.
  // mouseenter/mouseleave on individual layers doesn't fire reliably when
  // trails overlap (moving from one trail to another underneath doesn't
  // trigger mouseenter on the second layer).
  function onMapMouseMove(e: any) {
    if (!map) return
    const trailLayerIds = getTrailLayerIds()
    const features = map.queryRenderedFeatures(e.point, { layers: trailLayerIds })

    if (features.length > 0) {
      map.getCanvas().style.cursor = "pointer"
      const props = features[0].properties
      if (!props) return
      if (popup) popup.remove()
      popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "trail-popup" })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="padding: 8px 12px; font-size: 13px; color: #333; min-width: 180px;">
            <div style="font-weight: 600; margin-bottom: 6px; color: ${props.color};">${props.date}</div>
            <div style="margin-bottom: 4px;">👤 ${props.operator}</div>
            <div style="margin-bottom: 4px;">🚜 ${props.vehicle}</div>
            ${props.startTime ? `<div style="margin-bottom: 4px;">⏰ ${props.startTime} – ${props.endTime}</div>` : ""}
            <div style="margin-bottom: 4px;">📐 ${props.area}</div>
            <div>📏 ${props.distance}</div>
          </div>
        `)
        .addTo(map)
    } else {
      map.getCanvas().style.cursor = "default"
      if (popup) { popup.remove(); popup = null }
    }
  }

  // Single mouseleave handler — clear cursor + popup when leaving the map canvas
  function onMapMouseLeave() {
    if (!map) return
    map.getCanvas().style.cursor = "default"
    if (popup) { popup.remove(); popup = null }
  }

  // Single click handler on the map — handles both trail clicks and deadspace clicks
  function onMapClick(e: any) {
    if (!map) return
    const trailLayerIds = getTrailLayerIds()
    const features = map.queryRenderedFeatures(e.point, { layers: trailLayerIds })

    if (features.length > 0) {
      // Clicked on a trail — select it
      const props = features[0].properties
      if (!props) return
      console.log("[FieldOverlay] onMapClick → trail selected", { recordIdx: props.recordIdx, intervalIdx: props.intervalIdx, layerId: features[0].layer?.id })
      selectedTrail = props
      bringTrailToTop(props)
      highlightSelectedTrail()
    } else {
      // Clicked on deadspace — deselect
      if (selectedTrail) {
        console.log("[FieldOverlay] onMapClick → deadspace, deselecting")
        selectedTrail = null
        restoreLayerOrder()
        highlightSelectedTrail()
      }
    }
  }

  function setupHover() {
    if (!map) return
    // Only register once — these are map-level handlers, not per-layer
    if (!hoverHandlerActive) {
      map.on("mousemove", onMapMouseMove)
      map.on("mouseleave", onMapMouseLeave)
      hoverHandlerActive = true
    }
    if (!clickHandlerActive) {
      map.on("click", onMapClick)
      clickHandlerActive = true
    }
    map.getCanvas().style.cursor = "default"
  }

  function onTrailClick(e: any) {
    // No longer used — replaced by onMapClick
    // Kept for reference; all click logic is now in onMapClick
  }

  // Move clicked trail's layers to the top of the render order
  function bringTrailToTop(props: any) {
    if (!map) return
    const baseId = props.intervalIdx !== undefined && props.intervalIdx !== null
      ? `trail-${props.recordIdx}-${props.intervalIdx}`
      : `trail-${props.recordIdx}`
    // Move outline first (so it stays under main), then main line, then markers
    if (map.getLayer(`${baseId}-outline`)) map.moveLayer(`${baseId}-outline`)
    if (map.getLayer(baseId)) map.moveLayer(baseId)
    if (map.getLayer(`${baseId}-markers-entry`)) map.moveLayer(`${baseId}-markers-entry`)
    if (map.getLayer(`${baseId}-markers-exit`)) map.moveLayer(`${baseId}-markers-exit`)
    // Always keep field label on top
    if (map.getLayer("field-label")) map.moveLayer("field-label")
  }

  // Restore original layer order (by start_time) when deselected
  function restoreLayerOrder() {
    if (!map) return
    const activeRecords = getFilteredRecords()
      .slice()
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    for (const record of activeRecords) {
      const recordIdx = activeRecords.indexOf(record)
      if (record.interval_paths?.length) {
        for (let i = 0; i < record.interval_paths.length; i++) {
          const baseId = `trail-${recordIdx}-${i}`
          if (map.getLayer(`${baseId}-outline`)) map.moveLayer(`${baseId}-outline`)
          if (map.getLayer(baseId)) map.moveLayer(baseId)
          if (map.getLayer(`${baseId}-markers-entry`)) map.moveLayer(`${baseId}-markers-entry`)
          if (map.getLayer(`${baseId}-markers-exit`)) map.moveLayer(`${baseId}-markers-exit`)
        }
      } else {
        const baseId = `trail-${recordIdx}`
        if (map.getLayer(`${baseId}-outline`)) map.moveLayer(`${baseId}-outline`)
        if (map.getLayer(baseId)) map.moveLayer(baseId)
      }
    }
    // Always keep field label on top
    if (map!.getLayer("field-label")) map!.moveLayer("field-label")
  }

  // onMapDeadSpaceClick removed — replaced by onMapClick which handles
  // both trail clicks and deadspace clicks in a single handler

  onMount(() => {
    if (!fieldBoundary) return
    const allRings = getAllOuterRings(fieldBoundary)
    const fp = (allRings[0] as any)?.[0]
    console.log(`[Overlay] Mounting field="${fieldName}" type=${fieldBoundary.type} coords=[${fp?.[0]},${fp?.[1]}] rings=${allRings.length} records=${records.length}`)
    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
    const fieldBBox = getBoundsFromBoundary(fieldBoundary)
    // Calculate max zoom bounds — slightly larger than the field bbox
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of allRings) { minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat); maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat) }
    const lngSpan = maxLng - minLng, latSpan = maxLat - minLat
    const maxBounds: mapboxgl.LngLatBoundsLike = [
      [minLng - lngSpan * 3.0, minLat - latSpan * 3.0],
      [maxLng + lngSpan * 3.0, maxLat + latSpan * 3.0],
    ]

    map = new mapboxgl.Map({
      container, style: "mapbox://styles/mapbox/satellite-v9",
      bounds: fieldBBox,
      fitBoundsOptions: { padding: 40 },
      maxBounds, // prevent panning outside the field area
      interactive: !lockedMode, attributionControl: false,
      dragPan: !lockedMode, scrollZoom: !lockedMode,
      boxZoom: !lockedMode, doubleClickZoom: !lockedMode,
      touchZoomRotate: !lockedMode, keyboard: !lockedMode,
    })
    map.on("load", () => {
      map!.addSource("field-boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: fieldBoundary } })
      map!.addLayer({ id: "field-fill", type: "fill", source: "field-boundary", paint: { "fill-color": "#22c55e", "fill-opacity": 0.08 } })
      map!.addLayer({ id: "field-outline", type: "line", source: "field-boundary", paint: { "line-color": "#22c55e", "line-width": 2, "line-opacity": 0.8 } })

      // Field name + hectares label at centroid
      const centroid = getFieldCentroid(fieldBoundary)
      if (centroid) {
        map!.addSource("field-label", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { name: fieldName, area: totalArea.toFixed(1) + " ha" },
            geometry: { type: "Point", coordinates: centroid },
          },
        })
        map!.addLayer({
          id: "field-label",
          type: "symbol",
          source: "field-label",
          layout: {
            "text-field": ["concat", ["get", "name"], "\n", ["get", "area"]],
            "text-size": 14,
            "text-anchor": "center",
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 2,
          },
        })
      }

      // Greyscale outside the field — use a very large mask (15x) to cover max zoom
      {
        const allRings = getAllOuterRings(fieldBoundary)
        let minLngB = Infinity, minLatB = Infinity, maxLngB = -Infinity, maxLatB = -Infinity
        for (const [lng, lat] of allRings) { minLngB = Math.min(minLngB, lng); minLatB = Math.min(minLatB, lat); maxLngB = Math.max(maxLngB, lng); maxLatB = Math.max(maxLatB, lat) }
        const lngSpanB = maxLngB - minLngB, latSpanB = maxLatB - minLatB
        const outerRing: [number, number][] = [
          [minLngB - lngSpanB * 15, minLatB - latSpanB * 15],
          [maxLngB + lngSpanB * 15, minLatB - latSpanB * 15],
          [maxLngB + lngSpanB * 15, maxLatB + latSpanB * 15],
          [minLngB - lngSpanB * 15, maxLatB + latSpanB * 15],
          [minLngB - lngSpanB * 15, minLatB - latSpanB * 15],
        ]
        // For multipolygon, use all outer rings as holes in the mask
        const holeRings = fieldBoundary.type === "MultiPolygon"
          ? fieldBoundary.coordinates.map((poly: number[][][]) => [...poly[0]].reverse() as [number, number][])
          : [[...fieldBoundary.coordinates[0]].reverse() as [number, number][]]
        map!.addSource("greyscale-mask", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [outerRing, ...holeRings] } },
        })
        map!.addLayer({ id: "greyscale-overlay", type: "fill", source: "greyscale-mask", paint: { "fill-color": "#1a1a1a", "fill-opacity": 0.6 } })
      }

      mapLoaded = true
      console.log("[FieldOverlay] Map loaded, rendering trails", { rangeInitialized, recordsCount: records.length, lockedMode })
      renderTrails()
    })
  })

  // Re-render when filter changes (debounced to prevent flicker)
  $: if (mapLoaded && rangeInitialized && filteredRecords) { scheduleRender() }

  onDestroy(() => { if (renderTimer) clearTimeout(renderTimer); if (popup) popup.remove(); if (map) map.remove() })

  $: totalArea = filteredRecords.reduce((sum, r) => sum + parseFloat(r.area_hectares || 0), 0)
  $: totalDistance = filteredRecords.reduce((sum, r) => sum + parseFloat(r.distance_km || 0), 0)
</script>

<div class="field-overlay-container">
  <!-- Header -->
  <div class="overlay-header">
    <div class="header-info">
      <h3>{fieldName}</h3>
      <div class="header-stats">
        <div class="stat-item">
          <FileText size={14} class="text-blue-400" />
          <span class="stat-value">{filteredRecords.length}</span>
          <span class="stat-label">record{filteredRecords.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <Ruler size={14} class="text-green-400" />
          <span class="stat-value">{totalArea.toFixed(2)}</span>
          <span class="stat-label">ha</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <MapPin size={14} class="text-orange-400" />
          <span class="stat-value">{totalDistance.toFixed(2)}</span>
          <span class="stat-label">km</span>
        </div>
      </div>
    </div>
    <button class="close-btn" on:click={() => dispatch("close")}>
      <X size={18} />
    </button>
  </div>

  {#if !lockedMode}
  <!-- Timeline filter -->
  <div class="timeline-filter">
    <div class="range-selector">
      <Calendar size={14} class="text-white/40" />
      <span class="range-label">Last</span>
      <select bind:value={rangeMode} class="range-select">
        <option value="1d">1 Day</option>
        <option value="7d">7 Days</option>
        <option value="30d">1 Month</option>
        <option value="1y">1 Year</option>
        <option value="all">All Time</option>
      </select>
    </div>

    <div class="slider-container">
      <div class="slider-track">
        <div
          class="slider-range"
          style="left: {sliderStartPct}%; right: {100 - sliderEndPct}%"
        ></div>
        <!-- Tick marks for each record's start time -->
        {#if !lockedMode}
          {#each sliderTicks as tickPct}
            <div class="slider-tick" style="left: {tickPct}%"></div>
          {/each}
        {/if}
      </div>
      <input
        type="range"
        class="slider-handle slider-start"
        min={sliderMin}
        max={sliderMax}
        value={sliderStart}
        on:input={onSliderStartChange}
      />
      <input
        type="range"
        class="slider-handle slider-end"
        min={sliderMin}
        max={sliderMax}
        value={sliderEnd}
        on:input={onSliderEndChange}
      />
    </div>

    <div class="slider-labels">
      <span class="slider-label-start">{formatSliderDate(sliderStart)}</span>
      <span class="slider-label-end">{formatSliderDate(sliderEnd)}</span>
    </div>
  </div>
  {/if}

  <!-- Map -->
  <div class="map-container" bind:this={container}></div>

  <!-- Shared bottom-right info panel: legend when unselected, trail detail when selected -->
  <div class="info-panel">
    {#if selectedTrail}
      <!-- Trail detail view -->
      <div class="info-panel-header">
        <span class="info-panel-color-dot" style="background: {selectedTrail.color}"></span>
        <span class="info-panel-title" style="color: {selectedTrail.color}">{selectedTrail.date}</span>
        <button class="info-panel-close" on:click={() => { selectedTrail = null; restoreLayerOrder(); highlightSelectedTrail() }}>
          <X size={14} />
        </button>
      </div>
      <div class="info-panel-rows">
        <div class="info-panel-row">
          <User size={13} class="text-white/40" />
          <span>{selectedTrail.operator}</span>
        </div>
        <div class="info-panel-row">
          <Tractor size={13} class="text-white/40" />
          <span>{selectedTrail.vehicle}</span>
        </div>
        {#if selectedTrail.startTime}
          <div class="info-panel-row">
            <Clock size={13} class="text-white/40" />
            <span>{selectedTrail.startTime} – {selectedTrail.endTime}</span>
          </div>
        {/if}
        <div class="info-panel-row">
          <Ruler size={13} class="text-white/40" />
          <span>{selectedTrail.area} · {selectedTrail.distance}</span>
        </div>
      </div>
    {:else if filteredRecords.length > 0}
      <!-- Legend view -->
      <div class="info-panel-header">
        <span class="info-panel-title">Legend</span>
        <span class="info-panel-count">{filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="info-panel-legend">
        {#each filteredRecords as record, i}
          <button class="legend-item" on:click={() => { selectedTrail = { recordIdx: i, intervalIdx: 0, color: getTrailColor(record, i), date: formatDate(record.start_time), operator: record.operator_name || "Unknown", vehicle: formatVehicleType(record.vehicle_type), area: formatHa(record.area_hectares), distance: formatKm(record.distance_km) }; bringTrailToTop(selectedTrail); highlightSelectedTrail() }}>
            <span class="legend-color" style="background: {getTrailColor(record, i)}"></span>
            <span class="legend-date">{new Date(record.start_time).toLocaleDateString()}</span>
            <span class="legend-operator">{record.operator_name || "Unknown"}</span>
            {#if record.intervals?.length > 1}
              <span class="legend-intervals">{record.intervals.length} visits</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .field-overlay-container {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    z-index: 100;
    display: flex;
    flex-direction: column;
  }

  .overlay-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: rgba(0, 0, 0, 0.8);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-info h3 { font-size: 18px; font-weight: 600; color: white; margin: 0 0 6px 0; }

  .header-stats { display: flex; align-items: center; gap: 12px; }
  .stat-item { display: flex; align-items: center; gap: 5px; }
  .stat-value { font-size: 15px; font-weight: 600; color: white; }
  .stat-label { font-size: 12px; color: rgba(255, 255, 255, 0.4); }
  .stat-divider { width: 1px; height: 16px; background: rgba(255, 255, 255, 0.1); }

  .close-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: white;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .timeline-filter {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background: rgba(0, 0, 0, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    flex-wrap: wrap;
  }

  .range-selector {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .range-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .range-select {
    padding: 5px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: white;
    font-size: 12px;
    cursor: pointer;
    outline: none;
  }

  .range-select option {
    background: #1a1a1a;
  }

  /* Dual-handle slider */
  .slider-container {
    position: relative;
    flex: 1;
    min-width: 200px;
    height: 24px;
    display: flex;
    align-items: center;
  }

  .slider-track {
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .slider-range {
    position: absolute;
    height: 100%;
    background: rgba(59, 130, 246, 0.5);
    border-radius: 2px;
  }

  .slider-tick {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 10px;
    background: rgba(255, 255, 255, 0.35);
    border-radius: 1px;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .slider-handle {
    position: absolute;
    width: 100%;
    height: 24px;
    -webkit-appearance: none;
    appearance: none;
    background: none;
    pointer-events: none;
    outline: none;
    margin: 0;
  }

  .slider-handle::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #3b82f6;
    border: 2px solid white;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .slider-handle::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #3b82f6;
    border: 2px solid white;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    width: 100%;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .slider-label-start, .slider-label-end {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }

  .map-container {
    flex: 1;
    width: 100%;
    -webkit-tap-highlight-color: transparent;
  }

  .map-container :global(canvas) {
    outline: none !important;
    -webkit-tap-highlight-color: transparent;
  }

  .field-overlay-container {
    -webkit-tap-highlight-color: transparent;
  }

  /* Shared bottom-right info panel */
  .info-panel {
    position: absolute;
    bottom: 16px;
    right: 16px;
    width: 240px;
    max-height: 300px;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 12px 14px;
    z-index: 10;
    overflow-y: auto;
  }

  .info-panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .info-panel-color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .info-panel-title {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }

  .info-panel-count {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .info-panel-close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
  }

  .info-panel-close:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  .info-panel-rows {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .info-panel-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
  }

  .info-panel-legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    cursor: pointer;
    padding: 3px 4px;
    border-radius: 4px;
    transition: background 0.15s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
  }

  .legend-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .legend-color {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .legend-date {
    color: rgba(255, 255, 255, 0.7);
  }

  .legend-operator {
    color: rgba(255, 255, 255, 0.4);
  }

  .legend-intervals {
    color: #60a5fa;
    font-size: 9px;
    padding: 1px 4px;
    background: rgba(59, 130, 246, 0.15);
    border-radius: 4px;
  }

  /* Suppress Mapbox popup fade animation that causes yellow flash on deselect */
  :global(.trail-popup) {
    animation: none !important;
    transition: none !important;
  }
  :global(.trail-popup .mapboxgl-popup-content) {
    animation: none !important;
    transition: none !important;
  }
</style>