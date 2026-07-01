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

  const TRAIL_COLORS = [
    "#ef4444", "#3b82f6", "#22c55e", "#f97316",
    "#a855f7", "#06b6d4", "#eab308", "#ec4899",
  ]

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

  function formatSliderDate(ts: number): string {
    return new Date(ts).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })
  }

  function onSliderStartChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value)
    sliderStart = Math.min(val, sliderEnd - 3600000)
    console.log("[FieldOverlay] Slider start changed", { val, sliderStart: new Date(sliderStart).toISOString(), sliderEnd: new Date(sliderEnd).toISOString() })
  }
  function onSliderEndChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value)
    sliderEnd = Math.max(val, sliderStart + 3600000)
    console.log("[FieldOverlay] Slider end changed", { val, sliderEnd: new Date(sliderEnd).toISOString(), sliderStart: new Date(sliderStart).toISOString() })
  }

  function getBoundsFromBoundary(boundary: any): mapboxgl.LngLatBoundsLike {
    const coords = boundary.type === "Polygon" ? boundary.coordinates[0] : boundary.coordinates[0][0]
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
    const coords = boundary.type === "Polygon" ? boundary.coordinates[0] : boundary.coordinates[0][0]
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
    if (!map || !map.loaded()) return
    // Reset all outline layers to 0 opacity
    for (const layer of map.getStyle().layers.filter((l: any) => l.id.endsWith("-outline"))) {
      map.setPaintProperty(layer.id, "line-opacity", 0)
    }
    // Show white outline on selected trail
    if (selectedTrail) {
      const baseId = selectedTrail.intervalIdx !== undefined
        ? `trail-${selectedTrail.recordIdx}-${selectedTrail.intervalIdx}`
        : `trail-${selectedTrail.recordIdx}`
      const outlineId = `${baseId}-outline`
      if (map.getLayer(outlineId)) {
        map.setPaintProperty(outlineId, "line-opacity", 1.0)
      }
    }
  }

  // Re-highlight when selection changes
  $: if (mapLoaded && selectedTrail) { highlightSelectedTrail() }

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

    activeRecords.forEach((record, recordIdx) => {
      const color = TRAIL_COLORS[recordIdx % TRAIL_COLORS.length]
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
              id: `${layerId}-markers`, type: "circle", source: markerSourceId,
              paint: { "circle-radius": 5, "circle-color": color, "circle-stroke-width": 2, "circle-stroke-color": "#ffffff", "circle-opacity": 0.9 },
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
    if (selectedTrail) highlightSelectedTrail()
  }

  function setupHover() {
    if (!map) return
    const trailLayers = map.getStyle().layers.filter((l: any) => l.id.startsWith("trail-") && !l.id.endsWith("-outline") && !l.id.endsWith("-markers") && l.type === "line")
    for (const layer of trailLayers) {
      map.on("mouseenter", layer.id, onTrailHover)
      map.on("mouseleave", layer.id, onTrailLeave)
      map.on("click", layer.id, onTrailClick)
    }
    map.getCanvas().style.cursor = "default"
  }

  function onTrailHover(e: any) {
    if (!map) return
    map.getCanvas().style.cursor = "pointer"
    const props = e.features?.[0]?.properties
    if (!props) return
    if (popup) popup.remove()
    popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
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
  }

  function onTrailLeave() {
    if (!map) return
    map.getCanvas().style.cursor = "default"
    if (popup) { popup.remove(); popup = null }
  }

  function onTrailClick(e: any) {
    const props = e.features?.[0]?.properties
    if (!props) return
    selectedTrail = props
  }

  onMount(() => {
    if (!fieldBoundary) return
    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
    const fieldBBox = getBoundsFromBoundary(fieldBoundary)
    // Calculate max zoom bounds — slightly larger than the field bbox
    const coords = fieldBoundary.type === "Polygon" ? fieldBoundary.coordinates[0] : fieldBoundary.coordinates[0][0]
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const [lng, lat] of coords) { minLng = Math.min(minLng, lng); minLat = Math.min(minLat, lat); maxLng = Math.max(maxLng, lng); maxLat = Math.max(maxLat, lat) }
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
        const coords = fieldBoundary.type === "Polygon" ? fieldBoundary.coordinates[0] : fieldBoundary.coordinates[0][0]
        let minLngB = Infinity, minLatB = Infinity, maxLngB = -Infinity, maxLatB = -Infinity
        for (const [lng, lat] of coords) { minLngB = Math.min(minLngB, lng); minLatB = Math.min(minLatB, lat); maxLngB = Math.max(maxLngB, lng); maxLatB = Math.max(maxLatB, lat) }
        const lngSpanB = maxLngB - minLngB, latSpanB = maxLatB - minLatB
        const outerRing: [number, number][] = [
          [minLngB - lngSpanB * 15, minLatB - latSpanB * 15],
          [maxLngB + lngSpanB * 15, minLatB - latSpanB * 15],
          [maxLngB + lngSpanB * 15, maxLatB + latSpanB * 15],
          [minLngB - lngSpanB * 15, maxLatB + latSpanB * 15],
          [minLngB - lngSpanB * 15, minLatB - latSpanB * 15],
        ]
        const holeRing = [...coords].reverse() as [number, number][]
        map!.addSource("greyscale-mask", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [outerRing, holeRing] } },
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

  <!-- Legend -->
  {#if filteredRecords.length > 0}
    <div class="legend">
      {#each filteredRecords as record, i}
        <div class="legend-item">
          <span class="legend-color" style="background: {TRAIL_COLORS[i % TRAIL_COLORS.length]}"></span>
          <span class="legend-date">{new Date(record.start_time).toLocaleDateString()}</span>
          <span class="legend-operator">{record.operator_name || "Unknown"}</span>
          {#if record.intervals?.length > 1}
            <span class="legend-intervals">{record.intervals.length} visits</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Selected trail detail panel -->
  {#if selectedTrail}
    <div class="trail-detail-panel">
      <button class="close-detail" on:click={() => { selectedTrail = null; highlightSelectedTrail() }}>
        <X size={16} />
      </button>
      <div class="detail-header" style="color: {selectedTrail.color}">
        {selectedTrail.date}
      </div>
      <div class="detail-rows">
        <div class="detail-row">
          <User size={14} class="text-white/40" />
          <span>{selectedTrail.operator}</span>
        </div>
        <div class="detail-row">
          <Tractor size={14} class="text-white/40" />
          <span>{selectedTrail.vehicle}</span>
        </div>
        {#if selectedTrail.startTime}
          <div class="detail-row">
            <Clock size={14} class="text-white/40" />
            <span>{selectedTrail.startTime} – {selectedTrail.endTime}</span>
          </div>
        {/if}
        <div class="detail-row">
          <Ruler size={14} class="text-white/40" />
          <span>{selectedTrail.area} · {selectedTrail.distance}</span>
        </div>
      </div>
    </div>
  {/if}
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
  }

  .legend {
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.8);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    max-height: 120px;
    overflow-y: auto;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .legend-color {
    width: 12px;
    height: 12px;
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
    font-size: 10px;
    padding: 1px 5px;
    background: rgba(59, 130, 246, 0.15);
    border-radius: 4px;
  }

  /* Trail detail panel */
  .trail-detail-panel {
    position: absolute;
    bottom: 140px;
    right: 20px;
    width: 260px;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 14px 16px;
    z-index: 10;
  }

  .close-detail {
    position: absolute;
    top: 10px;
    right: 10px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    padding: 2px;
  }

  .detail-header {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 10px;
  }

  .detail-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .detail-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
  }
</style>