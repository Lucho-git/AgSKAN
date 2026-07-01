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
  import { Calendar, X, User, Tractor, Ruler, Clock } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  export let fieldBoundary: any = null
  export let records: any[] = []
  export let fieldName = ""

  let map: mapboxgl.Map | null = null
  let container: HTMLElement
  let selectedPeriod = "all"
  let popup: mapboxgl.Popup | null = null
  let selectedTrail = null as any

  const TRAIL_COLORS = [
    "#ef4444", "#3b82f6", "#22c55e", "#f97316",
    "#a855f7", "#06b6d4", "#eab308", "#ec4899",
  ]

  $: filteredRecords = (() => {
    if (selectedPeriod === "all") return records
    const now = Date.now()
    const periods: Record<string, number> = { "1d": 86400000, "7d": 604800000, "30d": 2592000000 }
    const cutoff = now - (periods[selectedPeriod] || 0)
    return records.filter(r => new Date(r.start_time).getTime() > cutoff)
  })()

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

  function renderTrails() {
    if (!map || !map.loaded()) return
    // Remove existing trail layers/sources
    for (const layer of map.getStyle().layers.filter(l => l.id.startsWith("trail-"))) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id)
    }
    for (const source of Object.keys(map.getStyle().sources).filter(s => s.startsWith("trail-"))) {
      if (map.getSource(source)) map.removeSource(source)
    }

    filteredRecords.forEach((record, recordIdx) => {
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
          id: layerId, type: "line", source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": color, "line-width": calculateZoomDependentWidth(trailWidth, 1), "line-opacity": 0.85 },
        })
      }
    })

    setupHover()
  }

  function setupHover() {
    if (!map) return
    const trailLayers = map.getStyle().layers.filter(l => l.id.startsWith("trail-") && l.type === "line")
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
    map = new mapboxgl.Map({
      container, style: "mapbox://styles/mapbox/satellite-v9",
      bounds: getBoundsFromBoundary(fieldBoundary),
      fitBoundsOptions: { padding: 40 },
      interactive: true, attributionControl: false,
    })
    map.on("load", () => {
      map!.addSource("field-boundary", { type: "geojson", data: { type: "Feature", properties: {}, geometry: fieldBoundary } })
      map!.addLayer({ id: "field-fill", type: "fill", source: "field-boundary", paint: { "fill-color": "#22c55e", "fill-opacity": 0.08 } })
      map!.addLayer({ id: "field-outline", type: "line", source: "field-boundary", paint: { "line-color": "#22c55e", "line-width": 2, "line-opacity": 0.8 } })
      renderTrails()
    })
  })

  $: if (map && map.loaded() && selectedPeriod) { renderTrails() }

  onDestroy(() => { if (popup) popup.remove(); if (map) map.remove() })

  $: totalArea = filteredRecords.reduce((sum, r) => sum + parseFloat(r.area_hectares || 0), 0)
  $: totalDistance = filteredRecords.reduce((sum, r) => sum + parseFloat(r.distance_km || 0), 0)
</script>

<div class="field-overlay-container">
  <!-- Header -->
  <div class="overlay-header">
    <div class="header-info">
      <h3>{fieldName}</h3>
      <p>
        {filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""}
        · {totalArea.toFixed(2)} ha total
        · {totalDistance.toFixed(2)} km
      </p>
    </div>
    <button class="close-btn" on:click={() => dispatch("close")}>
      <X size={18} />
    </button>
  </div>

  <!-- Timeline filter -->
  <div class="timeline-filter">
    <Calendar size={14} class="text-white/40" />
    {#each [["1d", "1 Day"], ["7d", "7 Days"], ["30d", "30 Days"], ["all", "All Time"]] as [value, label]}
      <button
        class:active={selectedPeriod === value}
        on:click={() => (selectedPeriod = value)}
      >
        {label}
      </button>
    {/each}
  </div>

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
      <button class="close-detail" on:click={() => (selectedTrail = null)}>
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

  .header-info h3 {
    font-size: 18px;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  .header-info p {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin: 4px 0 0 0;
  }

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
    gap: 8px;
    padding: 10px 20px;
    background: rgba(0, 0, 0, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .timeline-filter button {
    padding: 6px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .timeline-filter button.active {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.3);
    color: #60a5fa;
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