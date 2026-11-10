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
  import { supabase } from "$lib/supabaseClient"
  import { calculateZoomDependentWidth } from "$lib/utils/trailGeometry"
  import {
    Calendar,
    X,
    User,
    Tractor,
    Ruler,
    Clock,
    FileText,
    MapPin,
    Layers,
    Loader2,
    Download,
  } from "lucide-svelte"
  import { jsPDF } from "jspdf"
  import {
    suggestMatches,
    suggestActivityAssignments,
  } from "$lib/utils/agworldMatching"
  import {
    recordKey,
    formatDuration,
    formatDate,
    formatTime,
    formatSliderDate,
    formatHa,
    formatKm,
    formatVehicleType,
    getVehicleType,
    formatTimeBetween,
    buildTrailSelection,
    trailPopupHtml,
    matchActivityName,
    activityTypeLabel,
    matchColor,
    formatClusterWindow,
    confidenceLabel,
    clusterSwathLabel,
    bdRows,
  } from "$lib/utils/fieldTrailFormat"
  import {
    getTrailColor as trailColor,
    sortedRecordTimes,
    initialRangeMode,
    sliderBounds,
    timeToPct as pctAlong,
    clampSliderStart,
    clampSliderEnd,
    filterRecords,
    sortByStart,
    startMs,
    availableOperations as listOperations,
    matchedRecordMap as buildMatchedRecordMap,
  } from "$lib/utils/fieldTrailTimeline"
  import {
    getAllOuterRings,
    getBoundsFromBoundary,
    getFieldCentroid,
  } from "$lib/utils/boundaryGeometry"
  import { buildReportData } from "$lib/utils/fieldTrailReport"
  import { writeReportPdf, reportFileName } from "$lib/utils/fieldTrailReportPdf"
  import {
    fetchWorkingWeather,
    boundaryCentroid,
  } from "$lib/services/fieldWeather"
  import { fetchTrailGeojson } from "$lib/services/trailGeojson"

  const dispatch = createEventDispatcher()

  export let fieldBoundary: any = null
  export let records: any[] = []
  export let fieldName = ""
  export let lockedMode = false
  export let fieldAreaHa = 0 // actual field boundary area (not spray coverage)
  export let inputProducts: any[] = [] // real inputs (e.g. Agworld) when available
  export let fieldCrop = "" // crop type for the report summary
  export let agworldActivities: {
    actuals?: any[]
    plans?: any[]
    workOrders?: any[]
    _convertedActualIds?: Set<string>
  } | null = null // cached Agworld activities for this field (for match suggestions)

  let map: mapboxgl.Map | null = null
  let container: HTMLElement
  let popup: mapboxgl.Popup | null = null
  let selectedTrail = null as any
  // Multi-select: record keys currently highlighted on the map + legend
  let selectedTrailIds = new Set<string>()

  // Mobile bottom-sheet drag state
  let panelHeight = 0 // 0 = auto-fit to content
  let dragging = false
  let dragStartY = 0
  let dragStartHeight = 0
  const HEADER_HEIGHT_PX = 44

  function onPanelDragStart(e: MouseEvent | TouchEvent) {
    dragging = true
    const pos = "touches" in e ? e.touches[0] : e
    dragStartY = pos.clientY
    // Measure current height in vh
    const panelEl = document.querySelector(".info-panel") as HTMLElement
    dragStartHeight = panelEl
      ? (panelEl.offsetHeight / window.innerHeight) * 100
      : 30
    document.addEventListener("mousemove", onPanelDragMove)
    document.addEventListener("mouseup", onPanelDragEnd)
    document.addEventListener("touchmove", onPanelDragMove, { passive: false })
    document.addEventListener("touchend", onPanelDragEnd)
    e.preventDefault()
  }
  function onPanelDragMove(e: MouseEvent | TouchEvent) {
    if (!dragging) return
    const pos = "touches" in e ? e.touches[0] : e
    const dy = dragStartY - pos.clientY // positive = dragging up
    const vhPx = window.innerHeight / 100
    panelHeight = Math.max(HEADER_HEIGHT_PX / vhPx, dragStartHeight + dy / vhPx)
  }
  function onPanelDragEnd() {
    dragging = false
    document.removeEventListener("mousemove", onPanelDragMove)
    document.removeEventListener("mouseup", onPanelDragEnd)
    document.removeEventListener("touchmove", onPanelDragMove)
    document.removeEventListener("touchend", onPanelDragEnd)
    // Snap: below 15vh snaps to header-only
    if (panelHeight < 15)
      panelHeight = HEADER_HEIGHT_PX / (window.innerHeight / 100)
  }

  // Full GPS trail highlight state
  let highlightTrailId = null as string | null
  let highlightPath = null as any
  let highlightTrailLoading = false

  // Report state
  let showReport = false
  let reportData = null as any
  let reportLoading = false
  let includeWeather = true
  let includeOperators = true
  let includeProducts = true

  async function generateReport() {
    if (!map || sortedRecords.length === 0) return
    reportLoading = true

    // Capture map snapshot
    const snapshot = map.getCanvas().toDataURL("image/png")

    // Real weather — Open-Meteo lookup for the field's working hours
    const weather = await fetchWorkingWeather(
      sortedRecords,
      await boundaryCentroid(fieldBoundary),
    )

    reportData = buildReportData({
      records: sortedRecords,
      crop: fieldCrop,
      inputProducts,
      snapshot,
      weather,
    })
    reportLoading = false
    showReport = true
  }

  function downloadReportPDF() {
    if (!reportData) return
    const doc = new jsPDF({ unit: "pt", format: "a4" })
    writeReportPdf(doc, reportData, {
      fieldName,
      recordCount: sortedRecords.length,
      includeWeather,
      includeOperators,
      includeProducts,
    })
    doc.save(reportFileName(fieldName))
    // Also open in a new tab
    const blob = doc.output("blob")
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  async function showFullTrail(trailId: string) {
    if (!trailId) return
    if (highlightTrailId === trailId) {
      // Toggle off
      highlightTrailId = null
      highlightPath = null
      updateHighlightTrail()
      return
    }
    highlightTrailLoading = true
    highlightTrailId = trailId
    try {
      const path = await fetchTrailGeojson(supabase, trailId)
      if (path) {
        highlightPath = path
        updateHighlightTrail()
        console.log(
          `[FieldOverlay] Loaded full trail: ${path.coordinates.length} points`,
        )
      } else {
        console.error("[FieldOverlay] Invalid trail GeoJSON for", trailId)
        highlightTrailId = null
        highlightPath = null
        updateHighlightTrail()
      }
    } catch (e) {
      console.error("[FieldOverlay] Failed to load trail:", e)
      highlightTrailId = null
      highlightPath = null
      updateHighlightTrail()
    } finally {
      highlightTrailLoading = false
    }
  }
  let mapLoaded = false
  let renderTimer: ReturnType<typeof setTimeout> | null = null

  // Date range slider state
  let rangeMode = "7d" // default to last 7 days
  let selectedOperationId = "" // "" = all operations
  let sliderMin = 0
  let sliderMax = 100
  let sliderStart = 0
  let sliderEnd = 100
  let rangeInitialized = false

  // Stable per-record colour (always red in locked mode).
  function getTrailColor(record: any, idx: number): string {
    return trailColor(record, idx, lockedMode)
  }

  // Compute the time range from records
  $: recordTimes = sortedRecordTimes(records)
  $: timeMin = recordTimes.length > 0 ? recordTimes[0] : Date.now() - 86400000
  $: timeMax =
    recordTimes.length > 0 ? recordTimes[recordTimes.length - 1] : Date.now()

  // Auto-escalate time range on initial load only: start at 7d, expand until at least one record is visible
  let autoEscalationDone = false
  $: if (!lockedMode && !autoEscalationDone && recordTimes.length > 0) {
    autoEscalationDone = true
    rangeMode = initialRangeMode(recordTimes, Date.now())
  }

  // When rangeMode changes or records load, update slider bounds
  $: {
    ;({ min: sliderMin, max: sliderMax } = sliderBounds({
      rangeMode,
      lockedMode,
      timeMin,
      timeMax,
      now: Date.now(),
    }))
    sliderStart = sliderMin
    sliderEnd = sliderMax
    rangeInitialized = true
  }

  // Records in the slider range (and selected operation)
  $: filteredRecords = filterRecords(
    records,
    sliderStart,
    sliderEnd,
    selectedOperationId,
  )

  // Sorted by start_time — MUST match renderTrails ordering for index-based layer IDs
  $: sortedRecords = sortByStart(filteredRecords)

  // Agworld match suggestions (predictive only — nothing is linked)
  $: matchSuggestions = agworldActivities
    ? suggestMatches(sortedRecords, agworldActivities, fieldAreaHa)
    : []

  // Activity-centric assignments: for every plan → actual / actual / plan /
  // work order, which trail cluster would the algorithm assign it to?
  $: assignments = agworldActivities
    ? suggestActivityAssignments(sortedRecords, agworldActivities, fieldAreaHa)
    : []
  $: assignmentMatched = assignments.filter(
    (a) => a.confidence !== "none",
  ).length
  $: assignmentTotal = assignments.reduce(
    (s, a) => s + (a.confidence !== "none" ? a.score : 0),
    0,
  )
  let showAssignments = true

  // Legend badges: record id → matched Agworld activity name (so the badge
  // identifies which plan/actual each trail record was matched to)
  $: matchedRecordMap = buildMatchedRecordMap(matchSuggestions)

  function matchedInfoFor(record: any): { name: string; type: string } {
    return (
      matchedRecordMap.get(recordKey(record)) || { name: "", type: "" }
    )
  }

  // Timeline match strip helpers
  function timeToPct(t: number): number {
    return pctAlong(t, sliderMin, sliderMax)
  }

  // Hovered match on the timeline strip (for the detail tooltip).
  // A short delay on leave keeps the tooltip open while the mouse travels
  // into it (so the breakdown rows are clickable).
  let hoveredMatch: number | null = null
  // Pinned match: set when a band/badge is clicked, keeps the card open and
  // shows a persistent "selected" state until the user clicks away elsewhere.
  let pinnedMatch: number | null = null
  let hoverTimer: any = null
  function setHover(i: number | null) {
    if (hoverTimer) {
      clearTimeout(hoverTimer)
      hoverTimer = null
    }
    if (i !== null) {
      hoveredMatch = i
      return
    }
    hoverTimer = setTimeout(() => {
      hoveredMatch = null
    }, 180)
  }

  // Which match card is currently displayed (pinned wins over hover)
  $: activeMatch = pinnedMatch !== null ? pinnedMatch : hoveredMatch

  // Expandable per-component breakdown rows (in the timeline tooltip)
  let expandedBd = new Set<string>()
  function toggleBd(key: string) {
    if (expandedBd.has(key)) expandedBd.delete(key)
    else expandedBd.add(key)
    expandedBd = new Set(expandedBd)
  }


  // Available operations from records, with counts, sorted by recency
  $: availableOperations = listOperations(records)

  // Format slider positions to dates
  $: sliderStartPct =
    sliderMax > sliderMin
      ? ((sliderStart - sliderMin) / (sliderMax - sliderMin)) * 100
      : 0
  $: sliderEndPct =
    sliderMax > sliderMin
      ? ((sliderEnd - sliderMin) / (sliderMax - sliderMin)) * 100
      : 100

  // Tick marks for each record's start time along the slider
  $: sliderTicks = records.map((r) =>
    pctAlong(startMs(r), sliderMin, sliderMax),
  )


  function onSliderStartChange(e: Event) {
    const input = e.target as HTMLInputElement
    const val = parseInt(input.value)
    // Prevent start handle from crossing past end handle
    const clamped = clampSliderStart(val, sliderEnd)
    sliderStart = clamped
    // Force the DOM input to reflect the clamped position (prevents visual crossing)
    if (clamped !== val) input.value = String(clamped)
  }
  function onSliderEndChange(e: Event) {
    const input = e.target as HTMLInputElement
    const val = parseInt(input.value)
    // Prevent end handle from crossing past start handle
    const clamped = clampSliderEnd(val, sliderStart)
    sliderEnd = clamped
    // Force the DOM input to reflect the clamped position (prevents visual crossing)
    if (clamped !== val) input.value = String(clamped)
  }


  // Debounced render — prevents flickering while dragging the slider
  function scheduleRender() {
    if (renderTimer) clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      renderTrails()
      renderTimer = null
    }, 150)
  }

  // Highlight selected trail(s) with white outlines (multi-select aware)
  function highlightSelectedTrails() {
    if (!map) return
    // Reset all trail outline layers
    const trailOutlines = map
      .getStyle()
      .layers.filter(
        (l: any) => l.id.startsWith("trail-") && l.id.endsWith("-outline"),
      )
    for (const layer of trailOutlines) {
      try {
        map.setPaintProperty(layer.id, "line-opacity", 0)
      } catch (err) {
        /* ignore */
      }
    }
    if (selectedTrailIds.size === 0) return

    for (const [recordIdx, record] of sortedRecords.entries()) {
      if (!selectedTrailIds.has(recordKey(record))) continue
      // Build list of base IDs to highlight (all intervals for this record)
      const baseIds: string[] = []
      if (record?.interval_paths?.length) {
        for (let i = 0; i < record.interval_paths.length; i++) {
          baseIds.push(`trail-${recordIdx}-${i}`)
        }
      } else {
        baseIds.push(`trail-${recordIdx}`)
      }
      for (const baseId of baseIds) {
        const outlineId = `${baseId}-outline`
        if (map.getLayer(outlineId)) {
          try {
            map.setPaintProperty(outlineId, "line-opacity", 1.0)
          } catch (err) {
            /* ignore */
          }
        }
      }
    }
  }

  function renderTrails() {
    if (!map) return

    const activeRecords = sortedRecords
    console.log(`[FieldOverlay] renderTrails: ${activeRecords.length} records`)

    // Remove existing trail layers/sources
    for (const layer of map
      .getStyle()
      .layers.filter((l: any) => l.id.startsWith("trail-"))) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id)
    }
    for (const source of Object.keys(map.getStyle().sources).filter((s) =>
      s.startsWith("trail-"),
    )) {
      if (map.getSource(source)) map.removeSource(source)
    }

    if (activeRecords.length === 0) {
      console.log("[FieldOverlay] No records to render")
      return
    }

    activeRecords.forEach((record, recordIdx) => {
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
                recordIdx,
                intervalIdx,
                recordId: record.id,
                operator: record.operator_name || "Unknown",
                vehicle: formatVehicleType(getVehicleType(record)),
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
            id: `${layerId}-outline`,
            type: "line",
            source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#ffffff",
              "line-width": calculateZoomDependentWidth(trailWidth, 1.3),
              "line-opacity": 0,
            },
          })

          map!.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
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
                  {
                    type: "Feature",
                    properties: { type: "entry" },
                    geometry: { type: "Point", coordinates: coords[0] },
                  },
                  {
                    type: "Feature",
                    properties: { type: "exit" },
                    geometry: {
                      type: "Point",
                      coordinates: coords[coords.length - 1],
                    },
                  },
                ],
              },
            })
            map!.addLayer({
              id: `${layerId}-markers-entry`,
              type: "circle",
              source: markerSourceId,
              filter: ["==", ["get", "type"], "entry"],
              paint: {
                "circle-radius": 6,
                "circle-color": "#22c55e",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
                "circle-opacity": 0.9,
              },
            })
            map!.addLayer({
              id: `${layerId}-markers-exit`,
              type: "circle",
              source: markerSourceId,
              filter: ["==", ["get", "type"], "exit"],
              paint: {
                "circle-radius": 4,
                "circle-color": "#ef4444",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
                "circle-opacity": 0.9,
              },
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
            properties: {
              recordIdx,
              recordId: record.id,
              operator: record.operator_name || "Unknown",
              vehicle: formatVehicleType(getVehicleType(record)),
              date: formatDate(record.start_time),
              area: formatHa(record.area_hectares),
              distance: formatKm(record.distance_km),
              color,
            },
            geometry: record.field_path,
          },
        })
        map!.addLayer({
          id: `${layerId}-outline`,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": calculateZoomDependentWidth(trailWidth, 1.3),
            "line-opacity": 0,
          },
        })
        map!.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": color,
            "line-width": calculateZoomDependentWidth(trailWidth, 1),
            "line-opacity": 0.85,
          },
        })
      }
    })

    setupHover()
    // Ensure field label is always on top of all trail layers
    if (map!.getLayer("field-label")) map!.moveLayer("field-label")
    if (selectedTrailIds.size > 0) applySelection()
  }

  // Track registered handlers so we can remove them before re-adding
  let hoverHandlerActive = false
  let clickHandlerActive = false

  // Get the current trail layer IDs (recomputed each render)
  function getTrailLayerIds(): string[] {
    if (!map) return []
    return map
      .getStyle()
      .layers.filter(
        (l: any) =>
          l.id.startsWith("trail-") &&
          !l.id.endsWith("-outline") &&
          !l.id.endsWith("-entry") &&
          !l.id.endsWith("-exit") &&
          l.type === "line",
      )
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
    const features = map.queryRenderedFeatures(e.point, {
      layers: trailLayerIds,
    })

    if (features.length > 0) {
      map.getCanvas().style.cursor = "pointer"
      const props = features[0].properties
      if (!props) return
      if (popup) popup.remove()
      popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 10,
        className: "trail-popup",
      })
        .setLngLat(e.lngLat)
        .setHTML(trailPopupHtml(props))
        .addTo(map)
    } else {
      map.getCanvas().style.cursor = "default"
      if (popup) {
        popup.remove()
        popup = null
      }
    }
  }

  // Single mouseleave handler — clear cursor + popup when leaving the map canvas
  function onMapMouseLeave() {
    if (!map) return
    map.getCanvas().style.cursor = "default"
    if (popup) {
      popup.remove()
      popup = null
    }
  }

  // Select a trail from the legend — highlights ALL intervals by default
  function selectTrail(idx: number, record: any) {
    // Hide any active GPS trail highlight when switching records
    highlightTrailId = null
    highlightPath = null
    updateHighlightTrail()
    const key = recordKey(record)
    if (
      selectedTrailIds.size === 1 &&
      selectedTrailIds.has(key) &&
      selectedTrail?.intervalIdx === null
    ) {
      clearSelection()
      return
    }
    pinnedMatch = null
    selectedTrailIds = new Set([key])
    // intervalIdx null = highlight all intervals
    selectedTrail = buildTrailSelection(record, idx, getTrailColor(record, idx))
    applySelection()
  }

  // Select a specific interval/visit from the detail panel
  function selectInterval(recordIdx: number, record: any, intervalIdx: number) {
    // Hide any active GPS trail highlight when switching intervals
    highlightTrailId = null
    highlightPath = null
    updateHighlightTrail()
    const key = recordKey(record)
    if (
      selectedTrailIds.size === 1 &&
      selectedTrailIds.has(key) &&
      selectedTrail?.intervalIdx === intervalIdx
    ) {
      clearSelection()
      return
    }
    pinnedMatch = null
    selectedTrailIds = new Set([key])
    selectedTrail = buildTrailSelection(
      record,
      recordIdx,
      getTrailColor(record, recordIdx),
      intervalIdx,
    )
    applySelection()
  }


  // Single click handler on the map — handles both trail clicks and deadspace clicks
  function onMapClick(e: any) {
    if (!map) return
    const trailLayerIds = getTrailLayerIds()
    const features = map.queryRenderedFeatures(e.point, {
      layers: trailLayerIds,
    })

    if (features.length > 0) {
      // Clicked on a trail — select it
      const props = features[0].properties
      if (!props) return
      // Hide any active GPS trail highlight when switching via map click
      highlightTrailId = null
      highlightPath = null
      updateHighlightTrail()
      pinnedMatch = null
      selectedTrail = props
      const rec = sortedRecords[props.recordIdx]
      selectedTrailIds = new Set([rec ? recordKey(rec) : props.recordId])
      applySelection()
    } else {
      // Clicked on deadspace — deselect
      if (selectedTrailIds.size > 0 || selectedTrail) clearSelection()
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


  // Move selected trails' layers to the top of the render order (multi-select aware)
  function bringSelectedToTop() {
    if (!map) return
    for (const [recordIdx, record] of sortedRecords.entries()) {
      if (!selectedTrailIds.has(recordKey(record))) continue
      const baseIds: string[] = []
      if (record.interval_paths?.length) {
        for (let i = 0; i < record.interval_paths.length; i++) {
          baseIds.push(`trail-${recordIdx}-${i}`)
        }
      } else {
        baseIds.push(`trail-${recordIdx}`)
      }
      for (const baseId of baseIds) {
        if (map.getLayer(`${baseId}-outline`)) map.moveLayer(`${baseId}-outline`)
        if (map.getLayer(baseId)) map.moveLayer(baseId)
        if (map.getLayer(`${baseId}-markers-entry`))
          map.moveLayer(`${baseId}-markers-entry`)
        if (map.getLayer(`${baseId}-markers-exit`))
          map.moveLayer(`${baseId}-markers-exit`)
      }
    }
    if (map.getLayer("field-label")) map.moveLayer("field-label")
  }

  // Apply the current selection (bring selected to top + highlight outlines)
  function applySelection() {
    if (selectedTrailIds.size === 0) {
      restoreLayerOrder()
      highlightSelectedTrails()
      return
    }
    bringSelectedToTop()
    highlightSelectedTrails()
  }

  // Clear all trail selection
  function clearSelection() {
    highlightTrailId = null
    highlightPath = null
    updateHighlightTrail()
    selectedTrailIds = new Set()
    selectedTrail = null
    pinnedMatch = null
    applySelection()
  }

  // Select ALL trails in a matched Agworld cluster (from the timeline strip)
  function selectMatchCluster(i: number) {
    const s = matchSuggestions[i]
    if (!s || s.confidence === "none" || !s.activity) return
    const keys = s.cluster.records.map(recordKey).filter(Boolean)
    if (keys.length === 0) return
    highlightTrailId = null
    highlightPath = null
    updateHighlightTrail()
    // Toggle: clicking the same cluster again deselects
    if (
      selectedTrailIds.size === keys.length &&
      keys.every((k) => selectedTrailIds.has(k))
    ) {
      clearSelection()
      return
    }
    selectedTrailIds = new Set(keys)
    const first = s.cluster.records[0]
    const idx = sortedRecords.findIndex(
      (r) => recordKey(r) === recordKey(first),
    )
    selectedTrail =
      idx >= 0 ? buildTrailSelection(first, idx, getTrailColor(first, idx)) : null
    pinnedMatch = i
    applySelection()
  }

  // Restore original layer order (by start_time) when deselected
  function restoreLayerOrder() {
    if (!map) return
    for (let recordIdx = 0; recordIdx < sortedRecords.length; recordIdx++) {
      const record = sortedRecords[recordIdx]
      if (record.interval_paths?.length) {
        for (let i = 0; i < record.interval_paths.length; i++) {
          const baseId = `trail-${recordIdx}-${i}`
          if (map.getLayer(`${baseId}-outline`))
            map.moveLayer(`${baseId}-outline`)
          if (map.getLayer(baseId)) map.moveLayer(baseId)
          if (map.getLayer(`${baseId}-markers-entry`))
            map.moveLayer(`${baseId}-markers-entry`)
          if (map.getLayer(`${baseId}-markers-exit`))
            map.moveLayer(`${baseId}-markers-exit`)
        }
      } else {
        const baseId = `trail-${recordIdx}`
        if (map.getLayer(`${baseId}-outline`))
          map.moveLayer(`${baseId}-outline`)
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
    // Lock body scroll while overlay is open
    document.body.style.overflow = "hidden"
    document.body.style.position = "fixed"
    document.body.style.width = "100%"
    const allRings = getAllOuterRings(fieldBoundary)
    const fp = (allRings[0] as any)?.[0]
    console.log(
      `[Overlay] Mounting field="${fieldName}" type=${fieldBoundary.type} coords=[${fp?.[0]},${fp?.[1]}] rings=${allRings.length} records=${records.length}`,
    )
    mapboxgl.accessToken = PUBLIC_MAPBOX_ACCESS_TOKEN
    const fieldBBox = getBoundsFromBoundary(fieldBoundary)
    // Calculate max zoom bounds — slightly larger than the field bbox
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity
    for (const [lng, lat] of allRings) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }
    const lngSpan = maxLng - minLng,
      latSpan = maxLat - minLat
    const maxBounds: mapboxgl.LngLatBoundsLike = [
      [minLng - lngSpan * 3.0, minLat - latSpan * 3.0],
      [maxLng + lngSpan * 3.0, maxLat + latSpan * 3.0],
    ]

    map = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/satellite-v9",
      bounds: fieldBBox,
      fitBoundsOptions: { padding: 40 },
      maxBounds, // prevent panning outside the field area
      interactive: !lockedMode,
      attributionControl: false,
      preserveDrawingBuffer: true, // required for toDataURL() snapshot in reports
      dragPan: !lockedMode,
      scrollZoom: !lockedMode,
      boxZoom: !lockedMode,
      doubleClickZoom: !lockedMode,
      touchZoomRotate: !lockedMode,
      keyboard: !lockedMode,
    })
    map.on("load", () => {
      map!.addSource("field-boundary", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: fieldBoundary },
      })
      map!.addLayer({
        id: "field-fill",
        type: "fill",
        source: "field-boundary",
        paint: { "fill-color": "#22c55e", "fill-opacity": 0.08 },
      })
      map!.addLayer({
        id: "field-outline",
        type: "line",
        source: "field-boundary",
        paint: {
          "line-color": "#22c55e",
          "line-width": 2,
          "line-opacity": 0.8,
        },
      })

      // Field name + hectares label at centroid
      const centroid = getFieldCentroid(fieldBoundary)
      if (centroid) {
        map!.addSource("field-label", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {
              name: fieldName,
              area: (fieldAreaHa || totalArea).toFixed(1) + " ha",
            },
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
        let minLngB = Infinity,
          minLatB = Infinity,
          maxLngB = -Infinity,
          maxLatB = -Infinity
        for (const [lng, lat] of allRings) {
          minLngB = Math.min(minLngB, lng)
          minLatB = Math.min(minLatB, lat)
          maxLngB = Math.max(maxLngB, lng)
          maxLatB = Math.max(maxLatB, lat)
        }
        const lngSpanB = maxLngB - minLngB,
          latSpanB = maxLatB - minLatB
        const outerRing: [number, number][] = [
          [minLngB - lngSpanB * 15, minLatB - latSpanB * 15],
          [maxLngB + lngSpanB * 15, minLatB - latSpanB * 15],
          [maxLngB + lngSpanB * 15, maxLatB + latSpanB * 15],
          [minLngB - lngSpanB * 15, maxLatB + latSpanB * 15],
          [minLngB - lngSpanB * 15, minLatB - latSpanB * 15],
        ]
        // For multipolygon, use all outer rings as holes in the mask
        const holeRings =
          fieldBoundary.type === "MultiPolygon"
            ? fieldBoundary.coordinates.map(
                (poly: number[][][]) =>
                  [...poly[0]].reverse() as [number, number][],
              )
            : [
                [...fieldBoundary.coordinates[0]].reverse() as [
                  number,
                  number,
                ][],
              ]
        map!.addSource("greyscale-mask", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [outerRing, ...holeRings],
            },
          },
        })
        map!.addLayer({
          id: "greyscale-overlay",
          type: "fill",
          source: "greyscale-mask",
          paint: { "fill-color": "#1a1a1a", "fill-opacity": 0.6 },
        })
      }

      mapLoaded = true
      console.log("[FieldOverlay] Map loaded, rendering trails", {
        rangeInitialized,
        recordsCount: records.length,
        lockedMode,
      })
      renderTrails()
    })
  })

  // Re-render when filter changes (debounced to prevent flicker)
  $: if (mapLoaded && rangeInitialized && filteredRecords) {
    scheduleRender()
  }

  onDestroy(() => {
    document.body.style.overflow = ""
    document.body.style.position = ""
    document.body.style.width = ""
    document.removeEventListener("mousemove", onPanelDragMove)
    document.removeEventListener("mouseup", onPanelDragEnd)
    document.removeEventListener("touchmove", onPanelDragMove)
    document.removeEventListener("touchend", onPanelDragEnd)
    if (renderTimer) clearTimeout(renderTimer)
    if (popup) popup.remove()
    if (map) map.remove()
  })

  $: totalArea = filteredRecords.reduce(
    (sum, r) => sum + parseFloat(r.area_hectares || 0),
    0,
  )
  $: totalDistance = filteredRecords.reduce(
    (sum, r) => sum + parseFloat(r.distance_km || 0),
    0,
  )

  // Render/remove the full trail highlight path
  function updateHighlightTrail() {
    if (!map || !mapLoaded) return
    const HIGHLIGHT_SOURCE = "highlight-trail"
    const HIGHLIGHT_LAYER = "highlight-trail-line"
    const HIGHLIGHT_OUTLINE = "highlight-trail-outline"

    // Remove previous highlight layers/source
    if (map.getLayer(HIGHLIGHT_OUTLINE)) map.removeLayer(HIGHLIGHT_OUTLINE)
    if (map.getLayer(HIGHLIGHT_LAYER)) map.removeLayer(HIGHLIGHT_LAYER)
    if (map.getSource(HIGHLIGHT_SOURCE)) map.removeSource(HIGHLIGHT_SOURCE)

    if (highlightPath?.coordinates?.length >= 2) {
      map.addSource(HIGHLIGHT_SOURCE, {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: highlightPath },
      })
      map.addLayer({
        id: HIGHLIGHT_OUTLINE,
        type: "line",
        source: HIGHLIGHT_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#000000",
          "line-width": 7,
          "line-opacity": 0.6,
        },
      })
      map.addLayer({
        id: HIGHLIGHT_LAYER,
        type: "line",
        source: HIGHLIGHT_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#fbbf24",
          "line-width": 3,
          "line-opacity": 0.95,
          "line-dasharray": [4, 2],
        },
      })
    }
  }
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
          <span class="stat-label"
            >record{filteredRecords.length !== 1 ? "s" : ""}</span
          >
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <Ruler size={14} class="text-green-400" />
          <span class="stat-value">{(fieldAreaHa || totalArea).toFixed(2)}</span
          >
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
          <option value="3m">3 Months</option>
          <option value="1y">1 Year</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {#if availableOperations.length >= 1}
        <div class="range-selector">
          <Layers size={14} class="text-white/40" />
          <select bind:value={selectedOperationId} class="range-select">
            <option value="">All Operations</option>
            {#each availableOperations as op}
              <option value={op.id}>{op.name} &nbsp;· {op.count}</option>
            {/each}
          </select>
        </div>
      {/if}

      <div class="slider-container">
        <div class="slider-box">
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

        <!-- Match overview strip — directly beneath the slider, same width/axis -->
        {#if agworldActivities && matchSuggestions.length > 0}
          <div class="match-strip">
            <div class="match-strip-track">
              {#each matchSuggestions as s, i}
                {#if s.confidence !== "none" && s.activity}
                  {@const left = timeToPct(s.cluster.start)}
                  {@const width = Math.max(
                    timeToPct(s.cluster.end) - left,
                    1.5,
                  )}
                  <div
                    class="match-band"
                    class:selected={pinnedMatch === i}
                    role="button"
                    tabindex="-1"
                    style="left: {left}%; width: {width}%; background: {matchColor(
                      i,
                    )}"
                    on:mouseenter={() => setHover(i)}
                    on:mouseleave={() => setHover(null)}
                    on:click|stopPropagation={() => selectMatchCluster(i)}
                    on:keydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        selectMatchCluster(i)
                      }
                    }}
                  ></div>
                {/if}
              {/each}
            </div>
            <div class="match-strip-legend">
              <span class="match-strip-title">Matches</span>
              {#each matchSuggestions as s, i}
                {#if s.confidence !== "none" && s.activity}
                  <span
                    class="match-strip-badge"
                    class:selected={pinnedMatch === i}
                    role="button"
                    tabindex="0"
                    style="border-color: {matchColor(i)}66"
                    on:click|stopPropagation={() => selectMatchCluster(i)}
                    on:keydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        selectMatchCluster(i)
                      }
                    }}
                  >
                    <span
                      class="ms-dot"
                      style="background: {matchColor(i)}"
                    ></span>
                    <span class="ms-name">{matchActivityName(s)}</span>
                    <span class="ms-conf"
                      >{confidenceLabel(s.confidence)}</span
                    >
                  </span>
                {/if}
              {/each}
            </div>

            <!-- Match detail card (hover shows it; click pins it open) -->
            {#if activeMatch !== null && matchSuggestions[activeMatch]}
              {@const h = matchSuggestions[activeMatch]}
              {@const bd = h.breakdown}
              <div
                class="match-tooltip"
                role="tooltip"
                on:mouseenter={() => setHover(activeMatch)}
                on:mouseleave={() => setHover(null)}
              >
                <button
                  class="match-tooltip-close"
                  aria-label="Close match card"
                  on:click|stopPropagation={() => {
                    pinnedMatch = null
                    hoveredMatch = null
                    if (hoverTimer) {
                      clearTimeout(hoverTimer)
                      hoverTimer = null
                    }
                  }}
                  on:keydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      pinnedMatch = null
                    }
                  }}
                  >✕</button
                >
                <div class="match-item-top">
                  <span class="match-window"
                    >{formatClusterWindow(h.cluster)}</span
                  >
                  <span class="match-conf match-conf-{h.confidence}"
                    >{confidenceLabel(h.confidence)}</span
                  >
                </div>
                <div class="match-meta">
                  <span
                    >{h.cluster.records.length} record{h.cluster.records
                      .length !== 1
                      ? "s"
                      : ""}</span
                  >
                  <span>· {h.cluster.areaHa.toFixed(2)} ha</span>
                  {#if clusterSwathLabel(h.cluster)}
                    <span>· {clusterSwathLabel(h.cluster)}</span>
                  {/if}
                  {#if h.cluster.vehicles.length}
                    <span
                      >· {[...new Set(h.cluster.vehicles)].join(", ")}</span
                    >
                  {/if}
                </div>
                <div class="match-activity">
                  <span class="match-type">{activityTypeLabel(h.type)}</span>
                  <span class="match-name">{matchActivityName(h)}</span>
                </div>
                <div class="match-signals">
                  {#if h.signals.timing}
                    <span class="signal signal-on">timing</span>
                  {/if}
                  {#if h.signals.vehicle}
                    <span class="signal signal-on">vehicle</span>
                  {/if}
                  {#if h.signals.coverage}
                    <span class="signal signal-on">coverage</span>
                  {/if}
                  {#if !h.signals.timing &&
                    !h.signals.vehicle &&
                    !h.signals.coverage}
                    <span class="signal signal-off">weak signals</span>
                  {/if}
                </div>
                {#if bd}
                  <div class="match-breakdown">
                    {#each bdRows(bd) as b}
                      {@const bdKey = `${h.cluster.start}_${b.label}`}
                      {@const isBdOpen = expandedBd.has(bdKey)}
                      <button
                        class="bd-row"
                        class:bd-open={isBdOpen}
                        on:click={() => toggleBd(bdKey)}
                      >
                        <span class="bd-chev">{isBdOpen ? "▾" : "▸"}</span>
                        <span class="bd-name">{b.label}</span>
                        <div class="bd-bar">
                          <div
                            class="bd-fill"
                            class:bd-fill-low={b.pct < 40}
                            class:bd-fill-mid={b.pct >= 40 && b.pct < 75}
                            style="width: {b.pct}%"
                          ></div>
                        </div>
                        <span class="bd-val"
                          >{b.pct}% ×{Math.round(b.weight * 100)} =
                          {b.contrib}</span
                        >
                      </button>
                      {#if isBdOpen && Object.keys(b.details).length}
                        <div class="bd-details">
                          {#each Object.entries(b.details) as [k, v]}
                            <div class="bd-detail-row">
                              <span class="bd-detail-k">{k}</span>
                              <span class="bd-detail-v">{v}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    {/each}
                    <div class="bd-total">
                      <span>total</span>
                      <span
                        >{Math.round(h.score * 100)}% ({h.score.toFixed(3)})</span
                      >
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="slider-labels">
        <span class="slider-label-start">{formatSliderDate(sliderStart)}</span>
        <span class="slider-label-end">{formatSliderDate(sliderEnd)}</span>
      </div>
    </div>
  {/if}

  <!-- Map + sidebar in flex row (desktop: side by side; mobile: stacked) -->
  <div class="main-area">
    <!-- Left panel: Agworld Assignments (what the matcher would assign) -->
    {#if agworldActivities && assignments.length > 0}
      <div class="assignments-panel">
        <div class="assignments-panel-header">
          <span class="assignments-title">Agworld Assignments</span>
          <span
            class="assignments-count"
            class:all-matched={assignmentMatched === assignments.length}
            >{assignmentMatched}/{assignments.length} matched ·
            total {assignmentTotal.toFixed(2)}</span
          >
          <button
            class="assignments-collapse"
            title="Toggle assignments"
            on:click={() => (showAssignments = !showAssignments)}
            >{showAssignments ? "▾" : "▸"}</button
          >
        </div>
        {#if showAssignments}
          <div class="assignments-panel-body">
            {#each assignments as a}
              <button
                class="assignment-row"
                class:row-selected={pinnedMatch === a.clusterIdx}
                class:row-none={a.confidence === "none"}
                disabled={a.clusterIdx === null}
                on:click={() => {
                  if (a.clusterIdx !== null) selectMatchCluster(a.clusterIdx)
                }}
              >
                <div class="assignment-main">
                  <span class="assignment-type"
                    >{activityTypeLabel(a.type)}</span
                  >
                  <span class="assignment-name"
                    title="{a.label}{a.plan && a.actual ? ' (plan → actual)' : ''}"
                    >{a.label}</span
                  >
                  {#if a.plan && a.actual}
                    <span class="assignment-pair">plan→actual</span>
                  {/if}
                </div>
                <div class="assignment-target">
                  {#if a.cluster}
                    <span class="assignment-window"
                      >{formatClusterWindow(a.cluster)}</span
                    >
                    <span class="assignment-area"
                      >· {a.cluster.areaHa.toFixed(1)} ha</span
                    >
                  {:else}
                    <span class="assignment-none">no nearby trail</span>
                  {/if}
                </div>
                {#if a.cluster}
                  <div class="assignment-score-row">
                    <div class="assignment-bar">
                      <div
                        class="assignment-fill"
                        class:fill-low={a.score < 0.4}
                        class:fill-mid={a.score >= 0.4 && a.score < 0.6}
                        style="width: {Math.round(a.score * 100)}%"
                      ></div>
                    </div>
                    <span
                      class="assignment-score assignment-conf-{a.confidence}"
                      >{Math.round(a.score * 100)}% · {confidenceLabel(
                        a.confidence,
                      )}</span
                    >
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <div class="map-container" bind:this={container}></div>

    <div
      class="info-panel"
      style="--panel-vh: {panelHeight > 0 ? panelHeight + 'vh' : 'auto'}"
    >
      <div
        class="info-panel-header"
        role="button"
        tabindex="0"
        on:mousedown={onPanelDragStart}
        on:touchstart={onPanelDragStart}
      >
        <span class="panel-drag-handle"></span>
        <span class="info-panel-title">Legend</span>
        <span class="info-panel-count"
          >{sortedRecords.length} record{sortedRecords.length !== 1
            ? "s"
            : ""}</span
        >
      </div>
      <div class="info-panel-legend">
        {#if selectedTrailIds.size > 1}
          <div class="multi-select-banner">
            <span>{selectedTrailIds.size} trails selected</span>
            <button class="multi-clear-btn" on:click={clearSelection}
              >Clear</button
            >
          </div>
        {/if}
        {#each sortedRecords as record, i}
          {@const isSelected = selectedTrailIds.has(recordKey(record))}
          {@const prevRecord = i > 0 ? sortedRecords[i - 1] : null}
          {@const timeSincePrev = prevRecord
            ? formatTimeBetween(
                new Date(prevRecord.start_time).getTime(),
                new Date(record.start_time).getTime(),
              )
            : null}
          <button
            class="legend-item"
            class:active={isSelected}
            on:click={() => selectTrail(i, record)}
          >
            <span
              class="legend-color"
              style="background: {getTrailColor(record, i)}"
            ></span>
            <span class="legend-date"
              >{new Date(record.start_time).toLocaleDateString()}</span
            >
            <span class="legend-operator"
              >{record.operator_name || "Unknown"}</span
            >
            {#if matchedInfoFor(record).name}
              {@const matchInfo = matchedInfoFor(record)}
              <span
                class="legend-match-badge"
                title="Matched: {matchInfo.type} — {matchInfo.name}"
                >{matchInfo.name}</span
              >
            {/if}
            {#if record.intervals?.length > 1}
              <span class="legend-intervals"
                >{record.intervals.length} visits</span
              >
            {/if}
            {#if timeSincePrev}
              <span class="legend-time-gap">↑ {timeSincePrev} before</span>
            {/if}
          </button>
          {#if isSelected && selectedTrail}
            <div class="legend-detail">
              <div class="legend-detail-row">
                <User size={12} class="text-white/40" />
                <span>{selectedTrail.operator}</span>
              </div>
              <div class="legend-detail-row">
                <Tractor size={12} class="text-white/40" />
                <span>{selectedTrail.vehicle}</span>
              </div>
              {#if selectedTrail.intervalIdx !== null && selectedTrail.intervalIdx !== undefined}
                <div class="legend-detail-row">
                  <Clock size={12} class="text-white/40" />
                  <span
                    >{selectedTrail.startTime} – {selectedTrail.endTime}</span
                  >
                </div>
              {:else}
                <div class="legend-detail-row">
                  <Clock size={12} class="text-white/40" />
                  <span
                    >{formatTime(record.start_time)} – {formatTime(
                      record.end_time,
                    )}</span
                  >
                </div>
              {/if}
              <div class="legend-detail-row">
                <Ruler size={12} class="text-white/40" />
                <span>{selectedTrail.area} · {selectedTrail.distance}</span>
              </div>
              <!-- Diagnostics (dev) -->
              {#if record.gen_method}
                <div class="legend-diagnostics">
                  <div class="diag-header" role="button" tabindex="0"
                    on:click|stopPropagation={() => (record._showDiag = !record._showDiag)}
                    on:keydown={(e) => e.key === 'Enter' && (record._showDiag = !record._showDiag)}>
                    <span class="diag-method">{record.gen_method}</span>
                    {#if record.gen_edge_noise}
                      <span class="diag-tag diag-tag-warn">edge_noise</span>
                    {/if}
                    {#if record.gen_gap_merges > 0}
                      <span class="diag-tag">merged {record.gen_gap_merges}</span>
                    {/if}
                    <span class="diag-toggle">{record._showDiag ? '▾' : '▸'}</span>
                  </div>
                  {#if record._showDiag}
                    <div class="diag-body">
                      <div class="diag-row"><span>Dominant field</span><span>{record.gen_dominant_field_id?.slice(0, 8) || '—'}</span></div>
                      <div class="diag-row"><span>% of trail pts</span><span>{record.gen_pct_of_dominant != null ? record.gen_pct_of_dominant + '%' : '—'}</span></div>
                      {#if record.gen_pct_of_trail_area != null}
                        <div class="diag-row"><span>% of trail area</span><span>{record.gen_pct_of_trail_area}%</span></div>
                      {/if}
                      {#if record.gen_pct_of_field != null}
                        <div class="diag-row"><span>% of field</span><span>{record.gen_pct_of_field}%</span></div>
                      {/if}
                      {#if record.gen_area_ratio != null}
                        <div class="diag-row"><span>% of dom. area</span><span>{Number(record.gen_area_ratio * 100).toFixed(2)}%</span></div>
                      {/if}
                      {#if record.gen_max_dist_to_dominant_m != null}
                        <div class="diag-row"><span>Dist to dominant</span><span>{record.gen_max_dist_to_dominant_m}m</span></div>
                      {/if}
                      <div class="diag-row"><span>Gap merges</span><span>{record.gen_gap_merges || 0}</span></div>
                    </div>
                  {/if}
                </div>
              {/if}
              <!-- Individual visit selector -->
              {#if record.intervals?.length > 1}
                <div class="interval-selector">
                  <button
                    class="interval-chip"
                    class:active={selectedTrail.intervalIdx === null}
                    on:click|stopPropagation={() => selectTrail(i, record)}
                  >
                    All {record.intervals.length} visits
                  </button>
                  {#each record.intervals as interval, j}
                    <button
                      class="interval-chip"
                      class:active={selectedTrail.intervalIdx === j}
                      on:click|stopPropagation={() =>
                        selectInterval(i, record, j)}
                    >
                      Visit {j + 1}
                      <span class="interval-chip-time"
                        >{formatTime(interval.entry_time)} – {formatTime(
                          interval.exit_time,
                        )}</span
                      >
                    </button>
                  {/each}
                </div>
              {/if}
              {#if record.trail_id}
                <button
                  class="show-trail-btn"
                  class:active={highlightTrailId === record.trail_id}
                  disabled={highlightTrailLoading}
                  on:click|stopPropagation={() =>
                    showFullTrail(record.trail_id)}
                >
                  {#if highlightTrailLoading && highlightTrailId === record.trail_id}
                    <Loader2 size={12} class="animate-spin" />
                  {:else}
                    <MapPin size={12} />
                  {/if}
                  {highlightTrailId === record.trail_id
                    ? "Hide GPS trail"
                    : "Show full GPS trail"}
                </button>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
      <!-- Generate Report button -->
      {#if !lockedMode && sortedRecords.length > 0}
        <button
          class="generate-report-btn"
          on:click={() => generateReport()}
          disabled={reportLoading}
        >
          {#if reportLoading}
            <Loader2 size={14} class="animate-spin" />
          {:else}
            <FileText size={14} />
          {/if}
          {reportLoading ? "Loading weather…" : "Generate Report"}
        </button>
      {/if}
    </div>
  </div>

  <!-- Report panel -->
  {#if showReport}
    <div
      class="report-overlay"
      role="button"
      tabindex="0"
      on:click|self={() => (showReport = false)}
      on:keydown={(e) => e.key === "Escape" && (showReport = false)}
    >
      <div class="report-panel">
        <div class="report-header">
          <h2>Input Report — {fieldName}</h2>
          <div class="report-header-actions">
            <button
              class="report-download-btn"
              on:click={() => downloadReportPDF()}
            >
              <Download size={16} />
              PDF
            </button>
            <button class="report-close" on:click={() => (showReport = false)}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div class="report-toggles">
          <label class="report-toggle">
            <input type="checkbox" bind:checked={includeWeather} />
            <span>Weather Records</span>
          </label>
          <label class="report-toggle">
            <input type="checkbox" bind:checked={includeOperators} />
            <span>Operators</span>
          </label>
          <label class="report-toggle">
            <input type="checkbox" bind:checked={includeProducts} />
            <span>Inputs</span>
          </label>
        </div>
        <div class="report-body">
          <!-- Summary section -->
          <div class="report-section">
            <div class="report-summary-grid">
              <div class="report-summary-item">
                <span class="report-label">Field</span>
                <span class="report-value">{fieldName}</span>
              </div>
              <div class="report-summary-item">
                <span class="report-label">Crop</span>
                <span class="report-value">{reportData.crop}</span>
              </div>
              <div class="report-summary-item">
                <span class="report-label">Started</span>
                <span class="report-value">{reportData.started}</span>
              </div>
              <div class="report-summary-item">
                <span class="report-label">Completed</span>
                <span class="report-value">{reportData.completed}</span>
              </div>
              <div class="report-summary-item">
                <span class="report-label">Treated Area</span>
                <span class="report-value">{reportData.treatedArea} ha</span>
              </div>
              <div class="report-summary-item">
                <span class="report-label">Total Distance</span>
                <span class="report-value">{reportData.totalDistance} km</span>
              </div>
              <div class="report-summary-item">
                <span class="report-label">Records</span>
                <span class="report-value">{sortedRecords.length}</span>
              </div>
              {#if includeOperators}
                <div class="report-summary-item">
                  <span class="report-label">Operators</span>
                  <span class="report-value">{reportData.operators}</span>
                </div>
                <div class="report-summary-item">
                  <span class="report-label">Total Operating Hours</span>
                  <span class="report-value"
                    >{reportData.totalOperatingTime}</span
                  >
                </div>
              {/if}
            </div>
          </div>

          <!-- Map snapshot -->
          {#if reportData.snapshot}
            <div class="report-section">
              <h3>Coverage Map</h3>
              <img
                src={reportData.snapshot}
                alt="Coverage map"
                class="report-snapshot"
              />
            </div>
          {/if}

          <!-- Products / Inputs -->
          {#if includeProducts && reportData.products?.length}
            <div class="report-section">
              <h3>
                <span class="report-section-title">
                  Inputs Applied
                  {#if reportData.productsSource}
                    <span class="weather-source-badge">{reportData.productsSource}</span>
                  {/if}
                </span>
              </h3>
              <table class="report-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Active Ingredient</th>
                    <th>Rate</th>
                    <th>Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {#each reportData.products as p}
                    <tr>
                      <td>{p.name}</td>
                      <td>{p.activeIngredient}</td>
                      <td>{p.rate}</td>
                      <td>{p.usage}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Operating hours -->
          {#if includeOperators && reportData.operatingHours?.length}
            <div class="report-section">
              <h3>
                Operating Hours <span class="report-section-total"
                  >Total: {reportData.totalOperatingTime}</span
                >
              </h3>
              <table class="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Duration</th>
                    <th>Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {#each reportData.operatingHours as oh}
                    <tr>
                      <td>{oh.date}</td>
                      <td>{oh.entry}</td>
                      <td>{oh.exit}</td>
                      <td>{oh.duration}</td>
                      <td>{oh.operator}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Weather records -->
          {#if includeWeather}
            <div class="report-section">
              <h3>
                <span class="report-section-title">
                  Weather Records
                  {#if reportData.weatherSource}
                    <span class="weather-source-badge">{reportData.weatherSource}</span>
                  {/if}
                </span>
              </h3>
              {#if reportData.weatherError}
                <p class="weather-error">Weather lookup failed: {reportData.weatherError}</p>
              {/if}
              {#if reportData.weather?.length === 0}
                <p class="weather-error">No weather data available for the working hours.</p>
              {:else}
                <table class="report-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Conditions</th>
                      <th>Temp</th>
                      <th>Wind</th>
                      <th>Gust</th>
                      <th>Humidity</th>
                      <th>Delta T</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each reportData.weather as w}
                      <tr>
                        <td>{w.time}</td>
                        <td>{w.conditions}</td>
                        <td>{w.temp ?? "-"}°C</td>
                        <td>{w.windSpeed ?? "-"} km/h {w.windDir ?? ""}</td>
                        <td>{w.gust ?? "-"} km/h</td>
                        <td>{w.humidity ?? "-"}%</td>
                        <td>{w.deltaT ?? "-"}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </div>
          {/if}

          <!-- Operations -->
          <div class="report-section">
            <h3>Operations</h3>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Rate</th>
                  <th>Area</th>
                  {#if includeProducts}<th>Cost</th>{/if}
                </tr>
              </thead>
              <tbody>
                {#each reportData.operations as op}
                  <tr>
                    <td>{op.name}</td>
                    <td>{op.rate}</td>
                    <td>{op.area}</td>
                    {#if includeProducts}<td>{op.cost}</td>{/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
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
    margin: 0 0 6px 0;
  }

  .header-stats {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .stat-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .stat-value {
    font-size: 15px;
    font-weight: 600;
    color: white;
  }
  .stat-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }
  .stat-divider {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.1);
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

  /* Dual-handle slider + match strip (stacked, same width) */
  .slider-container {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .slider-box {
    position: relative;
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

  .slider-label-start,
  .slider-label-end {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
  }

  /* Match overview strip — directly under the slider, same width/axis */
  .match-strip {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    min-width: 0;
  }
  .match-strip-track {
    position: relative;
    height: 14px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    overflow: visible;
  }
  .match-band {
    position: absolute;
    top: 1px;
    bottom: 1px;
    border-radius: 3px;
    min-width: 2px;
    opacity: 0.85;
    border: 1px solid rgba(255, 255, 255, 0.15);
    cursor: pointer;
  }
  .match-band.selected {
    opacity: 1;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.75);
    z-index: 1;
  }
  .match-strip-legend {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
  }
  .match-strip-title {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: 2px;
  }
  .match-strip-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.3);
    max-width: 100%;
    cursor: pointer;
  }
  .match-strip-badge.selected {
    border-color: #ffffff;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
  }
  .match-strip-badge .ms-name {
    color: rgba(255, 255, 255, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }
  .ms-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ms-conf {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.45);
  }

  /* Hover detail tooltip for a timeline match — styled like the match card */
  .match-tooltip {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: 60;
    background: rgba(0, 0, 0, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 6px 8px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: auto;
  }
  .match-tooltip-close {
    position: absolute;
    top: 5px;
    right: 6px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.5);
    border-radius: 4px;
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    z-index: 1;
  }
  .match-tooltip-close:hover {
    color: white;
    border-color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.08);
  }
  .match-breakdown {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-top: 1px dashed rgba(255, 255, 255, 0.12);
    padding-top: 4px;
    margin-top: 2px;
  }
  .bd-row {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 9px;
    background: none;
    border: none;
    padding: 2px 0;
    width: 100%;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font-family: inherit;
  }
  .bd-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .bd-row.bd-open {
    background: rgba(255, 255, 255, 0.05);
  }
  .bd-chev {
    width: 10px;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.4);
  }
  .bd-name {
    width: 44px;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.55);
    text-transform: capitalize;
  }
  .bd-bar {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .bd-fill {
    height: 100%;
    border-radius: 3px;
    background: #4ade80;
  }
  .bd-fill-mid {
    background: #fbbf24;
  }
  .bd-fill-low {
    background: #f87171;
  }
  .bd-val {
    width: 92px;
    flex-shrink: 0;
    text-align: right;
    color: rgba(255, 255, 255, 0.5);
    font-variant-numeric: tabular-nums;
  }
  .bd-details {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 3px 6px 4px 15px;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    margin-left: 5px;
    margin-bottom: 2px;
  }
  .bd-detail-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 9px;
  }
  .bd-detail-k {
    color: rgba(255, 255, 255, 0.45);
    flex-shrink: 0;
  }
  .bd-detail-v {
    color: rgba(255, 255, 255, 0.8);
    text-align: right;
    font-variant-numeric: tabular-nums;
    word-break: break-word;
  }
  .bd-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    margin-top: 2px;
    padding-top: 2px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .map-container {
    flex: 1;
    width: 100%;
    background: #1a1a1a;
    -webkit-tap-highlight-color: transparent;
  }

  .map-container :global(canvas) {
    outline: none !important;
    -webkit-tap-highlight-color: transparent;
  }

  .field-overlay-container {
    -webkit-tap-highlight-color: transparent;
  }

  /* Map + sidebar layout — desktop: side-by-side flex row */
  .main-area {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  /* Sidebar legend — desktop: right column; mobile: bottom sheet */
  .info-panel {
    width: 240px;
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .info-panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .panel-drag-handle {
    display: none;
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

  .info-panel-legend {
    overflow-y: auto;
    flex: 1;
    padding: 0 4px 8px;
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
    padding: 4px 6px;
    border-radius: 6px;
    transition: background 0.15s;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    flex-wrap: wrap;
  }

  .legend-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .legend-item.active {
    background: rgba(59, 130, 246, 0.12);
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

  .legend-match-badge {
    font-size: 9px;
    font-weight: 600;
    color: #c4b5fd;
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid rgba(139, 92, 246, 0.4);
    border-radius: 4px;
    padding: 0 4px;
    flex-shrink: 0;
    line-height: 14px;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .multi-select-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    margin: 0 4px;
    background: rgba(139, 92, 246, 0.15);
    border: 1px solid rgba(139, 92, 246, 0.35);
    border-radius: 6px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.85);
    flex-shrink: 0;
  }
  .multi-clear-btn {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
    font-size: 10px;
    padding: 1px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .multi-clear-btn:hover {
    color: white;
    border-color: rgba(255, 255, 255, 0.4);
  }

  /* Agworld Assignments — left panel */
  .assignments-panel {
    width: 280px;
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(20px);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .assignments-panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .assignments-title {
    font-size: 12px;
    font-weight: 600;
    flex: 1;
    color: rgba(255, 255, 255, 0.85);
  }
  .assignments-count {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
  }
  .assignments-count.all-matched {
    color: #4ade80;
  }
  .assignments-collapse {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.7);
    border-radius: 4px;
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .assignments-collapse:hover {
    color: white;
    border-color: rgba(255, 255, 255, 0.3);
  }
  .assignments-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .assignment-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    padding: 5px 7px;
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    width: 100%;
  }
  .assignment-row:hover {
    border-color: rgba(255, 255, 255, 0.2);
  }
  .assignment-row.row-selected {
    border-color: rgba(255, 255, 255, 0.75);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
  }
  .assignment-row.row-none {
    opacity: 0.65;
  }
  .assignment-row:disabled {
    cursor: default;
  }
  .assignment-main {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .assignment-type {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: #c4b5fd;
    background: rgba(139, 92, 246, 0.15);
    padding: 1px 4px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .assignment-name {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .assignment-pair {
    font-size: 8px;
    font-weight: 600;
    text-transform: uppercase;
    color: #60a5fa;
    background: rgba(59, 130, 246, 0.15);
    padding: 1px 4px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .assignment-target {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.55);
    flex-wrap: wrap;
  }
  .assignment-window {
    color: rgba(255, 255, 255, 0.75);
  }
  .assignment-none {
    font-style: italic;
    color: rgba(255, 255, 255, 0.4);
  }
  .assignment-score-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .assignment-bar {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .assignment-fill {
    height: 100%;
    border-radius: 3px;
    background: #4ade80;
  }
  .assignment-fill.fill-mid {
    background: #fbbf24;
  }
  .assignment-fill.fill-low {
    background: #f87171;
  }
  .assignment-score {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .assignment-conf-high {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
  }
  .assignment-conf-medium {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }
  .assignment-conf-low {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
  }
  .assignment-conf-none {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }

  .legend-intervals {
    color: #60a5fa;
    font-size: 9px;
    padding: 1px 4px;
    background: rgba(59, 130, 246, 0.15);
    border-radius: 4px;
  }

  .legend-time-gap {
    color: rgba(251, 191, 36, 0.5);
    font-size: 9px;
    width: 100%;
    padding-left: 16px;
  }

  .legend-detail {
    padding: 6px 8px 8px 20px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    border-left: 2px solid rgba(59, 130, 246, 0.3);
    margin-left: 6px;
    margin-bottom: 4px;
  }

  .legend-detail-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
  }

  /* Diagnostics panel */
  .legend-diagnostics {
    margin-top: 2px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }
  .diag-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    cursor: pointer;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
  }
  .diag-header:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  .diag-method {
    font-family: monospace;
    color: rgba(255, 255, 255, 0.5);
  }
  .diag-tag {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.4);
  }
  .diag-tag-warn {
    background: rgba(251, 191, 36, 0.15);
    color: rgba(251, 191, 36, 0.7);
  }
  .diag-toggle {
    margin-left: auto;
    font-size: 10px;
  }
  .diag-body {
    padding: 4px 8px 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }
  .diag-row {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    padding: 2px 0;
    color: rgba(255, 255, 255, 0.35);
  }
  .diag-row span:last-child {
    font-family: monospace;
    color: rgba(255, 255, 255, 0.5);
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

  /* Full GPS trail button in legend detail */
  .show-trail-btn {
    background: rgba(251, 191, 36, 0.08);
    border: 1px solid rgba(251, 191, 36, 0.2);
    color: rgba(251, 191, 36, 0.7);
    cursor: pointer;
    padding: 5px 10px;
    display: flex;
    align-items: center;
    gap: 5px;
    border-radius: 4px;
    font-size: 11px;
    transition: all 0.15s;
    margin-top: 4px;
    width: fit-content;
  }
  .show-trail-btn:hover {
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.5);
    background: rgba(251, 191, 36, 0.15);
  }
  .show-trail-btn.active {
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.7);
    background: rgba(251, 191, 36, 0.2);
  }
  .show-trail-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  /* Interval visit selector chips */
  .interval-selector {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .interval-chip {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 4px;
    font-size: 11px;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }
  .interval-chip:hover {
    color: rgba(255, 255, 255, 0.85);
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }
  .interval-chip.active {
    color: #60a5fa;
    border-color: rgba(96, 165, 250, 0.4);
    background: rgba(96, 165, 250, 0.12);
  }
  .interval-chip-time {
    color: rgba(255, 255, 255, 0.3);
    font-size: 10px;
  }
  .interval-chip.active .interval-chip-time {
    color: rgba(147, 197, 253, 0.6);
  }

  /* Mobile: bottom sheet, drag to compress/expand */
  @media (max-width: 768px) {
    .assignments-panel {
      display: none;
    }
    .main-area {
      flex-direction: column;
    }
    .map-container {
      flex: 1;
    }
    .info-panel {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-height: 70vh;
      height: var(--panel-vh, auto);
      min-height: 44px;
      border-left: none;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px 12px 0 0;
      z-index: 10;
      transition: height 0.15s ease-out;
    }
    .panel-drag-handle {
      display: block;
      width: 32px;
      height: 4px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      margin: 0 auto 0 0;
    }
    .info-panel-header {
      cursor: grab;
      user-select: none;
    }
    .info-panel-header:active {
      cursor: grabbing;
    }
  }

  .match-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .match-window {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
  }
  .match-conf {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .match-conf-high {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
  }
  .match-conf-medium {
    background: rgba(251, 191, 36, 0.15);
    color: #fbbf24;
  }
  .match-conf-low {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
  }
  .match-conf-none {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }
  .match-meta {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }
  .match-activity {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
  }
  .match-type {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    color: #c4b5fd;
    background: rgba(139, 92, 246, 0.15);
    padding: 1px 4px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .match-name {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }
  .match-signals {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
  .signal {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.45);
  }
  .signal-on {
    background: rgba(59, 130, 246, 0.12);
    border-color: rgba(59, 130, 246, 0.3);
    color: #60a5fa;
  }
  .signal-off {
    font-style: italic;
  }

  /* Generate Report button */
  .generate-report-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    margin-top: 8px;
    background: rgba(59, 130, 246, 0.12);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #60a5fa;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .generate-report-btn:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: #93c5fd;
  }
  .generate-report-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  /* Report panel */
  .report-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .report-panel {
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    max-width: 700px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    color: rgba(255, 255, 255, 0.9);
  }
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    position: sticky;
    top: 0;
    background: #1a1a1a;
    z-index: 1;
  }
  .report-header h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }
  .report-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .report-download-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #60a5fa;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .report-download-btn:hover {
    background: rgba(59, 130, 246, 0.25);
    border-color: rgba(59, 130, 246, 0.5);
    color: #93c5fd;
  }
  .report-close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }
  .report-close:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }
  .report-body {
    padding: 20px;
  }
  .report-toggles {
    display: flex;
    gap: 16px;
    padding: 10px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .report-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    user-select: none;
  }
  .report-toggle input {
    accent-color: #3b82f6;
    cursor: pointer;
  }
  .report-section {
    margin-bottom: 24px;
  }
  .report-section h3 {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 10px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .report-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .weather-source-badge {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    color: #60a5fa;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.35);
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .weather-error {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
    margin: 0 0 10px 0;
  }
  .report-section-total {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
    text-transform: none;
    letter-spacing: 0;
  }
  .report-summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .report-summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .report-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .report-value {
    font-size: 14px;
    font-weight: 500;
  }
  .report-snapshot {
    width: 100%;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .report-table th {
    text-align: left;
    padding: 6px 8px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 500;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .report-table td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    white-space: pre-line;
  }
  .report-table tr:last-child td {
    border-bottom: none;
  }
</style>
