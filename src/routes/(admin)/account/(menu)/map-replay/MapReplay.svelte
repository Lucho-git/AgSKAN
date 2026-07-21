<!-- src/routes/(admin)/account/(menu)/map-replay/MapReplay.svelte -->
<!--
  Full-map replay: all field boundaries + spray record trails on one map.
  Timeline slider scrubs through time, animates trail drawing.
  Skips dead spots during playback.
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte"
  import { tweened } from "svelte/motion"
  import mapboxgl from "mapbox-gl"
  import { PUBLIC_MAPBOX_ACCESS_TOKEN } from "$env/static/public"
  import {
    Play, Pause, RotateCcw, Clock, ArrowLeft,
  } from "lucide-svelte"

  const dispatch = createEventDispatcher()

  export let records: any[] = []
  export let fields: any[] = []

  let map: mapboxgl.Map | null = null
  let container: HTMLElement
  let animFrame: number | null = null

  // Timeline state
  let timeMin = 0
  let timeMax = 0
  let sliderValue = 0
  let playing = false
  let speed = 0.25 // timeline speed
  const speeds = [0.25, 0.5, 1, 2, 5, 10]
  let autoReplay = true
  let timeRange = "all"
  let selectedOperationId = ""

  $: availableOps = [...new Map(records.map(r => [r.operation_id, { id: r.operation_id, name: (r.operation_name || "Unknown").slice(0, 12) }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))

  // Two-tier playback: timeline advances freely, trails animate in parallel
  let animatingTrails = new Map<string, { startMs: number; record: any; lastProgress: number }>()
  const trailAnimDurationMs = 2000
  const trailSmoothness = 1

  // Pre-computed timeline data
  let timelineSegments: { start: number; end: number }[] = []
  let recordsByTime: { t: number; record: any }[] = []
  let revealedRecords = new Set<string>()
  let revealedCount = 0
  const displayHa = tweened(0, { duration: 300 })
  const displayKm = tweened(0, { duration: 300 })
  const displayCount = tweened(0, { duration: 200 })
  let trailFullCoords = new Map<string, any[]>() // full coordinates per trail for progressive draw

  $: if (records.length > 0 && fields.length > 0) {
    initTimeline()
  }

  function initTimeline() {
    if (records.length === 0) return
    stopPlayback()
    clearAllTrails()
    revealedRecords = new Set()
    revealedCount = 0
    animatingTrails = new Map()

    // Filter by time range
    const now = Date.now()
    const rangeMs = timeRange === "7d" ? 7 * 86400000
      : timeRange === "1m" ? 30 * 86400000
      : timeRange === "3m" ? 90 * 86400000
      : timeRange === "1y" ? 365 * 86400000
      : Infinity

    const filtered = records.filter(r => {
      const t = new Date(r.start_time).getTime()
      if (now - t > rangeMs) return false
      if (selectedOperationId && r.operation_id !== selectedOperationId) return false
      return true
    })

    if (filtered.length === 0) return

    const sorted = [...filtered].sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )

    timeMin = new Date(sorted[0].start_time).getTime()
    timeMax = new Date(sorted[sorted.length - 1].end_time || sorted[sorted.length - 1].start_time).getTime()

    recordsByTime = sorted.map(r => ({
      t: new Date(r.start_time).getTime(),
      record: r,
    }))

    const GAP_THRESHOLD = 30 * 60 * 1000
    timelineSegments = []
    let segStart = timeMin
    let prevEnd = timeMin

    for (const r of sorted) {
      const t = new Date(r.start_time).getTime()
      if (t - prevEnd > GAP_THRESHOLD) {
        timelineSegments.push({ start: segStart, end: prevEnd })
        segStart = t
      }
      const endT = new Date(r.end_time || r.start_time).getTime()
      if (endT > prevEnd) prevEnd = endT
    }
    timelineSegments.push({ start: segStart, end: prevEnd })

    // Start just before first record
    sliderValue = timeMin
    // Kick off first trail animation immediately
    if (sorted.length > 0 && sorted[0].field_path) {
      revealedRecords.add(sorted[0].id)
      revealedCount++
      addTrailSource(sorted[0])
      animatingTrails.set(sorted[0].id, {
        startMs: performance.now(),
        record: sorted[0],
        lastProgress: 0,
      })
    }
    updateMapForTime(timeMin)

    // Auto-start playback
    setTimeout(() => {
      if (map) startPlayback()
    }, 800)
  }

  function updateMapForTime(t: number) {
    if (!map) return
    for (const rt of recordsByTime) {
      const rStart = new Date(rt.record.start_time).getTime()
      const rEnd = new Date(rt.record.end_time || rt.record.start_time).getTime()
      const rid = rt.record.id
      const layerId = `trail-layer-${rid}`

      if (t >= rStart) {
        if (!revealedRecords.has(rid) && rt.record.field_path) {
          addTrailSource(rt.record)
          revealedRecords.add(rid)
          revealedCount++
        }
        if (map.getLayer(layerId)) {
          const active = t < rEnd
          const isAnimating = animatingTrails.has(rid)
          if (isAnimating) {
            map.setPaintProperty(layerId, "line-opacity", 0.9)
            map.setPaintProperty(layerId, "line-width", 3.5)
          } else if (active) {
            map.setPaintProperty(layerId, "line-opacity", 0.9)
            map.setPaintProperty(layerId, "line-width", 3.5)
          } else {
            map.setPaintProperty(layerId, "line-opacity", 0.35)
            map.setPaintProperty(layerId, "line-width", 2)
          }
        }
      }
    }
  }

  function addTrailSource(record: any) {
    if (!map) return
    const sourceId = `trail-${record.id}`
    if (map.getSource(sourceId)) return

    // Extract coordinates from field_path (LineString)
    let coords: any[] = []
    if (record.field_path?.coordinates) {
      coords = record.field_path.coordinates
    } else if (record.field_path?.geometries?.[0]?.coordinates) {
      coords = record.field_path.geometries[0].coordinates
    }
    if (coords.length < 2) return
    trailFullCoords.set(record.id, coords)

    // Start with just first 2 points
    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: coords.slice(0, 2),
        },
      },
    })

    const layerId = `trail-layer-${record.id}`
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": getTrailColor(record),
        "line-width": 3.5,
        "line-opacity": 0.9,
      },
    })
  }

  function updateTrailCoords(rid: string, progress: number) {
    if (!map) return
    const fullCoords = trailFullCoords.get(rid)
    if (!fullCoords || fullCoords.length < 2) return
    const sourceId = `trail-${rid}`
    const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource
    if (!source) return

    const endIdx = Math.max(2, Math.floor(fullCoords.length * progress))
    source.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: fullCoords.slice(0, endIdx),
      },
    })
  }

  function getTrailColor(record: any): string {
    const hash = record.field_id?.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0) || 0
    const hue = hash % 360
    return `hsl(${hue}, 70%, 55%)`
  }

  // Playback — timeline advances freely, trails animate in parallel
  function startPlayback() {
    playing = true
    let lastT = performance.now()
    let lastBatchUpdate = 0
const BATCH_MS = 50 // update coords at most every 50ms (~20fps)

    const tick = () => {
      if (!playing) { animFrame = null; return }
      const now = performance.now()
      const dt = (now - lastT) * speed
      lastT = now

      // Advance main timeline — skip long gaps to next record
      let nextT = sliderValue + dt * 60000

      // Skip to next record if no trail is animating and gap is large
      if (animatingTrails.size === 0) {
        const nextRec = recordsByTime.find(rt => new Date(rt.record.start_time).getTime() > sliderValue + 30000)
        if (nextRec) {
          nextT = new Date(nextRec.record.start_time).getTime() - 30000
        }
      }
      nextT = Math.min(nextT, timeMax)

      // Start new trail animations
      for (const rt of recordsByTime) {
        const rs = new Date(rt.record.start_time).getTime()
        if (nextT >= rs && sliderValue < rs && !revealedRecords.has(rt.record.id) && rt.record.field_path) {
          revealedRecords.add(rt.record.id)
          revealedCount++
          addTrailSource(rt.record)
          animatingTrails.set(rt.record.id, {
            startMs: now,
            record: rt.record,
            lastProgress: 0,
          })
        }
      }

      sliderValue = nextT
      updateMapForTime(sliderValue)

      // Update animating trails (batched)
      if (now - lastBatchUpdate >= BATCH_MS) {
        lastBatchUpdate = now
        for (const [rid, anim] of animatingTrails) {
          const elapsed = now - anim.startMs
          const progress = Math.min(elapsed / trailAnimDurationMs, 1)
          // Only update if progress changed meaningfully (>3%)
          // Only update if progress changed enough
          const stepThreshold = trailSmoothness * 0.005
          if (progress - anim.lastProgress > stepThreshold || progress >= 1) {
            anim.lastProgress = progress
            updateTrailCoords(rid, progress)
            if (progress >= 1) {
              animatingTrails.delete(rid)
              updateTrailCoords(rid, 1)
              flashTrailComplete(rid)
            }
          }
        }
      }

      if (sliderValue >= timeMax) {
        sliderValue = timeMax
        updateMapForTime(timeMax)
        // Don't skip — let animations play out
        if (animatingTrails.size === 0) {
          playing = false
          // Always flash at end
          const trailIds = [...revealedRecords]
          trailIds.forEach((rid, i) => {
            setTimeout(() => flashTrailComplete(rid), Math.floor(i / 3) * 15)
          })
          const staggerEnd = Math.ceil(trailIds.length / 3) * 15 + 500
          if (autoReplay) {
            setTimeout(() => {
              if (!autoReplay) return
              clearAllTrails()
              revealedRecords = new Set()
              revealedCount = 0
              animatingTrails = new Map()
              sliderValue = timeMin
              startPlayback()
            }, staggerEnd + 2000)
          }
        } else {
          // Still animating — keep ticking
          animFrame = requestAnimationFrame(tick)
        }
        return
      }

      animFrame = requestAnimationFrame(tick)
    }
    animFrame = requestAnimationFrame(tick)
  }

  function flashTrailComplete(rid: string) {
    if (!map) return
    const layerId = `trail-layer-${rid}`
    if (!map.getLayer(layerId)) return
    map.setPaintProperty(layerId, "line-opacity", 1)
    map.setPaintProperty(layerId, "line-width", 5)
    setTimeout(() => {
      if (!map?.getLayer(layerId)) return
      map.setPaintProperty(layerId, "line-opacity", 0.6)
      map.setPaintProperty(layerId, "line-width", 3)
    }, 200)
    setTimeout(() => {
      if (!map?.getLayer(layerId)) return
      map.setPaintProperty(layerId, "line-opacity", 0.35)
      map.setPaintProperty(layerId, "line-width", 2)
    }, 500)
  }

  function stopPlayback() {
    playing = false
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null }
  }

  function togglePlay() {
    playing ? stopPlayback() : startPlayback()
  }

  function jumpToStart() {
    stopPlayback()
    clearAllTrails()
    revealedRecords = new Set()
    revealedCount = 0
    animatingTrails = new Map()
    sliderValue = timeMin
  }

  function clearAllTrails() {
    if (!map) return
    for (const rid of revealedRecords) {
      try {
        const layerId = `trail-layer-${rid}`
        const sourceId = `trail-${rid}`
        if (map.getLayer(layerId)) map.removeLayer(layerId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      } catch (_) {}
    }
    trailFullCoords = new Map()
  }

  function onSliderInput(e: Event) {
    stopPlayback()
    sliderValue = parseFloat((e.target as HTMLInputElement).value)
    updateMapForTime(sliderValue)
  }

  function formatTimelineTime(t: number): string {
    const d = new Date(t)
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  // Map init
  onMount(() => {
    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN

    map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/satellite-v9",
      center: [0, 0],
      zoom: 1,
      interactive: true,
      attributionControl: false,
    })

    map.on("load", () => {
      if (!map) return

      // --- Greyscale mask: darkens everything outside fields ---
      const allBounds = new mapboxgl.LngLatBounds()
      const holes: [number, number][][] = []

      for (const field of fields) {
        if (!field.boundary) continue
        const srcId = `field-${field.field_id}`
        map.addSource(srcId, {
          type: "geojson",
          data: { type: "Feature", properties: { name: field.name }, geometry: field.boundary },
        })
        map.addLayer({
          id: `field-fill-${field.field_id}`,
          type: "fill",
          source: srcId,
          paint: { "fill-color": "#22c55e", "fill-opacity": 0.06 },
        })
        map.addLayer({
          id: `field-line-${field.field_id}`,
          type: "line",
          source: srcId,
          paint: { "line-color": "#22c55e", "line-width": 1.5, "line-opacity": 0.3 },
        })

        // Collect bounds and holes for mask
        const coords = field.boundary?.coordinates
        if (!coords) continue
        const rings: [number, number][][] = field.boundary.type === "Polygon"
          ? coords
          : coords.flatMap((poly: [number, number][][]) => poly)
        for (const ring of rings) {
          if (!ring || ring.length === 0) continue
          holes.push([...ring].reverse() as [number, number][])
          for (const [lng, lat] of ring) {
            allBounds.extend([lng, lat])
          }
        }
      }

      // Build world-encompassing mask with field holes
      if (holes.length > 0) {
        const pad = 10
        const outerRing: [number, number][] = [
          [allBounds.getWest() - pad, allBounds.getSouth() - pad],
          [allBounds.getEast() + pad, allBounds.getSouth() - pad],
          [allBounds.getEast() + pad, allBounds.getNorth() + pad],
          [allBounds.getWest() - pad, allBounds.getNorth() + pad],
          [allBounds.getWest() - pad, allBounds.getSouth() - pad],
        ]

        map.addSource("greyscale-mask", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [outerRing, ...holes],
            },
          },
        })
        map.addLayer({
          id: "greyscale-fill",
          type: "fill",
          source: "greyscale-mask",
          paint: {
            "fill-color": "#0a0a0f",
            "fill-opacity": 0.55,
          },
        })
      }

      // Fit to all fields
      if (!allBounds.isEmpty()) {
        map.fitBounds(allBounds, { padding: 40, animate: false })
      }

      initTimeline()

      // Auto-play after short delay
      setTimeout(() => {
        if (map) startPlayback()
      }, 2000)
    })
  })

  onDestroy(() => {
    stopPlayback()
    if (map) { map.remove(); map = null }
  })

  // Live stats — tweened for smooth animation
  $: {
    revealedCount // dependency
    const ha = records.filter(r => revealedRecords.has(r.id)).reduce((s, r) => s + parseFloat(r.area_hectares || 0), 0)
    const km = records.filter(r => revealedRecords.has(r.id)).reduce((s, r) => s + parseFloat(r.distance_km || 0), 0)
    const count = records.filter(r => revealedRecords.has(r.id)).length
    displayHa.set(ha)
    displayKm.set(km)
    displayCount.set(count)
  }
</script>

<div class="map-replay">
  <!-- Map container -->
  <div bind:this={container} class="map-container"></div>

  <!-- Back button -->
  <button class="back-btn" on:click={() => dispatch("close")} title="Back to Records">
    <ArrowLeft size={18} />
  </button>

  <!-- Live legend + filters -->
  <div class="map-legend">
    <div class="legend-stat">
      <span class="legend-unit">ha</span>
      <span class="legend-value">{$displayHa.toFixed(0)}</span>
    </div>
    <div class="legend-stat">
      <span class="legend-unit">km</span>
      <span class="legend-value">{$displayKm.toFixed(0)}</span>
    </div>
    <div class="legend-stat">
      <span class="legend-unit">trails</span>
      <span class="legend-value">{$displayCount.toFixed(0)}</span>
    </div>
    <div class="legend-divider"></div>
    <select bind:value={timeRange} on:change={() => { initTimeline() }} class="legend-select">
      <option value="7d">7 Days</option>
      <option value="1m">1 Month</option>
      <option value="3m">3 Months</option>
      <option value="1y">1 Year</option>
      <option value="all">All Time</option>
    </select>
    {#if availableOps.length > 0}
      <select bind:value={selectedOperationId} on:change={() => { initTimeline() }} class="legend-select">
        <option value="">All Ops</option>
        {#each availableOps as op}
          <option value={op.id}>{op.name}</option>
        {/each}
      </select>
    {/if}
  </div>

  <!-- Bottom bar: slider + playback controls -->
  <div class="bottom-bar">
    <div class="slider-row">
      <span class="time-label">{formatTimelineTime(timeMin)}</span>
      <input type="range" class="timeline-slider" min={timeMin} max={timeMax} bind:value={sliderValue} on:input={onSliderInput} />
      <span class="time-label">{formatTimelineTime(timeMax)}</span>
    </div>
    <div class="play-row">
      <button class="ctrl-btn" on:click={() => { jumpToStart(); startPlayback() }} title="Replay">
        <RotateCcw size={14} />
      </button>
      <button class="ctrl-btn ctrl-play" on:click={togglePlay} title={playing ? "Pause" : "Play"}>
        {#if playing}<Pause size={16} />{:else}<Play size={16} />{/if}
      </button>
      <span class="speed-section">
        <span class="speed-label">{speed}x</span>
        <button class="ctrl-btn ctrl-sm" on:click={() => { const i = speeds.indexOf(speed); speed = speeds[Math.max(0, i - 1)] }}>−</button>
        <button class="ctrl-btn ctrl-sm" on:click={() => { const i = speeds.indexOf(speed); speed = speeds[Math.min(speeds.length - 1, i + 1)] }}>+</button>
      </span>
      <span class="play-spacer"></span>
      <span class="current-time-label">
        <Clock size={11} /><span>{formatTimelineTime(sliderValue)}</span>
      </span>
      <label class="auto-replay-label">
        <input type="checkbox" bind:checked={autoReplay} />
        <span>Loop</span>
      </label>
    </div>
  </div>
</div>

<style>
  .map-replay {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .map-container {
    width: 100%;
    height: 100%;
  }
  .back-btn {
    position: absolute;
    top: 16px;
    left: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(10, 10, 20, 0.85);
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.15s;
    z-index: 10;
  }
  .back-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.2);
  }
  .map-legend {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(10, 10, 20, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 10px 12px;
    width: 140px;
  }
  .legend-stat {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .legend-unit {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex: 1;
  }
  .legend-value {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    font-family: monospace;
    min-width: 50px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .legend-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 2px 0;
  }
  .legend-select {
    padding: 4px 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.6);
    font-size: 10px;
    cursor: pointer;
    outline: none;
    width: 100%;
    max-width: 100%;
  }
  .legend-select option { background: #1a1a2e; color: #fff; }
  /* Filters floating pill */
  .filters-pill {
    position: absolute;
    top: 80px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(10, 10, 20, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 6px 10px;
    z-index: 9;
  }
  .pill-select {
    padding: 4px 6px;
    border: none;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.6);
    font-size: 10px;
    cursor: pointer;
    outline: none;
  }
  .pill-select option { background: #1a1a2e; color: #fff; }
  .pill-loop {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    margin-left: 2px;
  }
  .pill-loop input { accent-color: #60a5fa; }

  /* Bottom bar: slider + play controls */
  .bottom-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 20;
    background: rgba(10, 10, 20, 0.95);
    backdrop-filter: blur(12px);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding: 8px 16px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .timeline-slider {
    flex: 1;
    -webkit-appearance: none;
    height: 6px;
    border-radius: 3px;
    background: rgba(255,255,255,0.1);
    outline: none;
  }
  .timeline-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: #60a5fa;
    cursor: pointer;
    border: 2px solid rgba(255,255,255,0.2);
  }
  .time-label {
    font-size: 10px;
    color: rgba(255,255,255,0.35);
    white-space: nowrap;
    font-family: monospace;
  }
  .play-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .playback-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.7);
    cursor: pointer;
    transition: all 0.15s;
  }
  .ctrl-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .ctrl-play { width: 36px; height: 36px; border-radius: 50%; }
  .ctrl-sm { width: 22px; height: 22px; font-size: 12px; }
  .speed-section {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .speed-label {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    min-width: 28px;
    text-align: center;
  }
  .current-time-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: rgba(255,255,255,0.3);
  }
  .play-spacer { flex: 1; }
  .auto-replay-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
  }
  .auto-replay-label input { accent-color: #60a5fa; }

  @media (max-width: 640px) {
    .map-legend { top: 8px; right: 8px; width: 120px; padding: 6px 8px; }
    .legend-value { font-size: 14px; min-width: 36px; }
    .legend-unit { font-size: 8px; }
    .legend-select { font-size: 9px; padding: 3px 5px; }
    .bottom-bar { padding: 6px 10px 8px; gap: 4px; }
    .ctrl-btn { width: 26px; height: 26px; }
    .ctrl-play { width: 32px; height: 32px; }
    .ctrl-sm { width: 20px; height: 20px; }
    .time-label { font-size: 9px; }
    .speed-label { font-size: 10px; min-width: 24px; }
    .current-time-label { font-size: 9px; }
    .auto-replay-label { font-size: 10px; }
    .back-btn { top: 8px; left: 8px; width: 28px; height: 28px; }
  }
</style>
