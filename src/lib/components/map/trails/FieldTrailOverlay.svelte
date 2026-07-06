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
  import { Calendar, X, User, Tractor, Ruler, Clock, FileText, MapPin, Layers, Loader2, Download } from "lucide-svelte"
  import { jsPDF } from "jspdf"

  const dispatch = createEventDispatcher()

  export let fieldBoundary: any = null
  export let records: any[] = []
  export let fieldName = ""
  export let lockedMode = false
  export let fieldAreaHa = 0 // actual field boundary area (not spray coverage)

  let map: mapboxgl.Map | null = null
  let container: HTMLElement
  let popup: mapboxgl.Popup | null = null
  let selectedTrail = null as any

  // Mobile bottom-sheet drag state
  let panelHeight = 0   // 0 = auto-fit to content
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
    dragStartHeight = panelEl ? (panelEl.offsetHeight / window.innerHeight) * 100 : 30
    document.addEventListener("mousemove", onPanelDragMove)
    document.addEventListener("mouseup", onPanelDragEnd)
    document.addEventListener("touchmove", onPanelDragMove, { passive: false })
    document.addEventListener("touchend", onPanelDragEnd)
    e.preventDefault()
  }
  function onPanelDragMove(e: MouseEvent | TouchEvent) {
    if (!dragging) return
    const pos = "touches" in e ? e.touches[0] : e
    const dy = dragStartY - pos.clientY  // positive = dragging up
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
    if (panelHeight < 15) panelHeight = HEADER_HEIGHT_PX / (window.innerHeight / 100)
  }

  // Full GPS trail highlight state
  let highlightTrailId = null as string | null
  let highlightPath = null as any
  let highlightTrailLoading = false

  // Report state
  let showReport = false
  let reportData = null as any
  let includeWeather = true
  let includeOperators = true
  let includeProducts = true

  function generateReport() {
    if (!map || sortedRecords.length === 0) return

    // Capture map snapshot
    const snapshot = map.getCanvas().toDataURL("image/png")

    // Compute totals
    const totalArea = sortedRecords.reduce((sum, r) => sum + parseFloat(r.area_hectares || 0), 0)
    const totalDistance = sortedRecords.reduce((sum, r) => sum + parseFloat(r.distance_km || 0), 0)
    const startTime = sortedRecords[0]?.start_time
    const endTime = sortedRecords[sortedRecords.length - 1]?.end_time || sortedRecords[sortedRecords.length - 1]?.start_time
    const operators = [...new Set(sortedRecords.map(r => r.operator_name || "Unknown"))].join(", ")

    // Stub weather data — generate hourly readings during the spray window
    const weatherStart = new Date(startTime)
    const weatherEnd = new Date(endTime)
    const weather: any[] = []
    const conditions = ["Sunny", "Partly Cloudy", "Cloudy", "Clear"]
    const windDirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    for (let t = weatherStart; t <= weatherEnd; t = new Date(t.getTime() + 3600000)) {
      const hour = t.getHours()
      const baseTemp = 15 + 10 * Math.sin((hour - 6) * Math.PI / 12) // peaks at midday
      const temp = Math.round(baseTemp + (Math.random() - 0.5) * 3)
      const humidity = Math.round(60 - 20 * Math.sin((hour - 6) * Math.PI / 12) + (Math.random() - 0.5) * 10)
      const windSpeed = Math.round(8 + Math.random() * 12)
      const gust = windSpeed + Math.round(3 + Math.random() * 5)
      const deltaT = Math.round((temp - (humidity / 100) * (temp + 8)) * 10) / 10
      weather.push({
        time: t.toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
        conditions: conditions[Math.floor(Math.random() * conditions.length)],
        temp,
        windSpeed,
        windDir: windDirs[Math.floor(Math.random() * windDirs.length)],
        gust,
        humidity: Math.max(20, Math.min(95, humidity)),
        deltaT: deltaT.toFixed(1),
      })
    }

    // Stub products — default spray rates × treated area
    const products = [
      { name: "Glyphosate 450", activeIngredient: "Glyphosate", rate: "2 L/ha", usage: `${(totalArea * 2).toFixed(0)} L`, cost: `$${(totalArea * 2 * 8.5).toFixed(2)}` },
      { name: "LI700 Surfactant", activeIngredient: "Surfactant", rate: "0.2 L/ha", usage: `${(totalArea * 0.2).toFixed(1)} L`, cost: `$${(totalArea * 0.2 * 15).toFixed(2)}` },
      { name: "Ammonium Sulphate", activeIngredient: "Nitrogen\nSulphur", rate: "1 kg/ha", usage: `${(totalArea * 1).toFixed(0)} kg`, cost: `$${(totalArea * 1 * 1.2).toFixed(2)}` },
    ]

    // Operations — pull actual operation names from records
    const opNames = [...new Set(sortedRecords.map(r => r.operation_name || "Unknown"))]
    const operations = opNames.map(name => ({
      name,
      rate: "1 ha/ha",
      area: `${totalArea.toFixed(2)} ha`,
      cost: `$${(totalArea * 20).toFixed(2)}`,
    }))

    // Operating hours — from interval entry/exit times across all records
    const operatingHours: any[] = []
    for (const r of sortedRecords) {
      if (r.intervals?.length) {
        for (const iv of r.intervals) {
          const entry = new Date(iv.entry_time)
          const exit = new Date(iv.exit_time)
          const durSec = Math.round((exit.getTime() - entry.getTime()) / 1000)
          const durMin = Math.floor(durSec / 60)
          const durH = Math.floor(durMin / 60)
          const durM = durMin % 60
          operatingHours.push({
            date: entry.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }),
            entry: entry.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            exit: exit.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            duration: durH > 0 ? `${durH}h ${durM}m` : `${durM}m`,
            operator: r.operator_name || "Unknown",
          })
        }
      } else {
        const entry = new Date(r.start_time)
        const exit = new Date(r.end_time || r.start_time)
        const durSec = Math.round((exit.getTime() - entry.getTime()) / 1000)
        const durMin = Math.floor(durSec / 60)
        const durH = Math.floor(durMin / 60)
        const durM = durMin % 60
        operatingHours.push({
          date: entry.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }),
          entry: entry.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          exit: exit.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          duration: durH > 0 ? `${durH}h ${durM}m` : `${durM}m`,
          operator: r.operator_name || "Unknown",
        })
      }
    }
    // Total operating time
    const totalDurSec = operatingHours.reduce((sum, o) => {
      const [h, m] = o.duration.includes("h") ? o.duration.match(/(\d+)h\s*(\d+)?m?/).slice(1).map(Number) : [0, parseInt(o.duration)]
      return sum + (h || 0) * 3600 + (m || 0) * 60
    }, 0)
    const totalH = Math.floor(totalDurSec / 3600)
    const totalM = Math.floor((totalDurSec % 3600) / 60)
    const totalOperatingTime = totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`

    reportData = {
      crop: "Wheat",
      started: new Date(startTime).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      completed: new Date(endTime).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      treatedArea: totalArea.toFixed(2),
      totalDistance: totalDistance.toFixed(2),
      operators,
      totalOperatingTime,
      operatingHours,
      snapshot,
      weather,
      products,
      operations,
    }
    showReport = true
  }

  function downloadReportPDF() {
    if (!reportData) return
    const doc = new jsPDF({ unit: "pt", format: "a4" })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const margin = 40
    let y = margin

    // Title
    doc.setFontSize(18)
    doc.setFont("helvetica", "bold")
    doc.text(`Spray Report — ${fieldName}`, margin, y)
    y += 24

    // Summary
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("Summary", margin, y)
    y += 14
    doc.setFont("helvetica", "normal")
    const summary = [
      `Field: ${fieldName}`,
      `Crop: ${reportData.crop}`,
      `Started: ${reportData.started}`,
      `Completed: ${reportData.completed}`,
      `Treated Area: ${reportData.treatedArea} ha`,
      `Total Distance: ${reportData.totalDistance} km`,
      `Records: ${sortedRecords.length}`,
      ...(includeOperators ? [`Operators: ${reportData.operators}`, `Total Operating Hours: ${reportData.totalOperatingTime}`] : []),
    ]
    for (const line of summary) {
      doc.text(line, margin, y)
      y += 14
    }
    y += 10

    // Map snapshot
    if (reportData.snapshot) {
      doc.setFont("helvetica", "bold")
      doc.text("Coverage Map", margin, y)
      y += 10
      const imgW = pageW - margin * 2
      const imgH = imgW * 0.6
      try {
        doc.addImage(reportData.snapshot, "PNG", margin, y, imgW, imgH)
        y += imgH + 16
      } catch (e) {
        doc.text("[Map snapshot unavailable]", margin, y)
        y += 14
      }
    }

    // Products
    if (includeProducts && reportData.products?.length) {
      if (y > pageH - 80) { doc.addPage(); y = margin }
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.text("Products Applied", margin, y)
      y += 14
      doc.setFontSize(9)
      const pCols = ["Product", "Active Ingredient", "Rate", "Usage", "Cost"]
      const pColW = [0.22, 0.22, 0.14, 0.18, 0.18]
      let cx = margin
      pCols.forEach(h => { doc.setFont("helvetica", "bold"); doc.text(h, cx, y); cx += pColW[pCols.indexOf(h)] * (pageW - margin * 2) })
      y += 12
      doc.setFont("helvetica", "normal")
      for (const p of reportData.products) {
        if (y > pageH - 30) { doc.addPage(); y = margin }
        cx = margin
        const vals = [p.name, p.activeIngredient, p.rate, p.usage, p.cost]
        vals.forEach((v, i) => { doc.text(String(v).split("\n").join(" / "), cx, y); cx += pColW[i] * (pageW - margin * 2) })
        y += 11
      }
      y += 10
    }

    // Operating hours
    if (includeOperators && reportData.operatingHours?.length) {
      if (y > pageH - 80) { doc.addPage(); y = margin }
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.text(`Operating Hours (Total: ${reportData.totalOperatingTime})`, margin, y)
      y += 14
      doc.setFontSize(9)
      const ohCols = ["Date", "Entry", "Exit", "Duration", "Operator"]
      const ohColW = [0.24, 0.16, 0.16, 0.16, 0.28]
      let cx = margin
      ohCols.forEach((h, i) => { doc.setFont("helvetica", "bold"); doc.text(h, cx, y); cx += ohColW[i] * (pageW - margin * 2) })
      y += 12
      doc.setFont("helvetica", "normal")
      for (const oh of reportData.operatingHours) {
        if (y > pageH - 30) { doc.addPage(); y = margin }
        cx = margin
        const vals = [oh.date, oh.entry, oh.exit, oh.duration, oh.operator]
        vals.forEach((v, i) => { doc.text(String(v), cx, y); cx += ohColW[i] * (pageW - margin * 2) })
        y += 11
      }
      y += 10
    }

    // Weather
    if (includeWeather && reportData.weather?.length) {
      if (y > pageH - 80) { doc.addPage(); y = margin }
      doc.setFont("helvetica", "bold")
      doc.text("Weather Records", margin, y)
      y += 14
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      const wCols = ["Time", "Conditions", "Temp", "Wind", "Gust", "Humidity", "Delta T"]
      const wColW = [0.22, 0.16, 0.08, 0.16, 0.1, 0.1, 0.1]
      let cx = margin
      wCols.forEach((h, i) => { doc.setFont("helvetica", "bold"); doc.text(h, cx, y); cx += wColW[i] * (pageW - margin * 2) })
      y += 12
      doc.setFont("helvetica", "normal")
      for (const w of reportData.weather) {
        if (y > pageH - 30) { doc.addPage(); y = margin }
        cx = margin
        const vals = [w.time, w.conditions, `${w.temp}°C`, `${w.windSpeed} km/h ${w.windDir}`, `${w.gust} km/h`, `${w.humidity}%`, w.deltaT]
        vals.forEach((v, i) => { doc.text(String(v), cx, y); cx += wColW[i] * (pageW - margin * 2) })
        y += 11
      }
      y += 10
    }

    // Operations
    if (reportData.operations?.length) {
      if (y > pageH - 60) { doc.addPage(); y = margin }
      doc.setFontSize(11)
      doc.setFont("helvetica", "bold")
      doc.text("Operations", margin, y)
      y += 14
      doc.setFontSize(9)
      const oCols = includeProducts ? ["Operation", "Rate", "Area", "Cost"] : ["Operation", "Rate", "Area"]
      const oColW = includeProducts ? [0.35, 0.2, 0.2, 0.2] : [0.4, 0.3, 0.3]
      let cx = margin
      oCols.forEach(h => { doc.setFont("helvetica", "bold"); doc.text(h, cx, y); cx += oColW[oCols.indexOf(h)] * (pageW - margin * 2) })
      y += 12
      doc.setFont("helvetica", "normal")
      for (const op of reportData.operations) {
        if (y > pageH - 30) { doc.addPage(); y = margin }
        cx = margin
        const vals = includeProducts ? [op.name, op.rate, op.area, op.cost] : [op.name, op.rate, op.area]
        vals.forEach((v, i) => { doc.text(String(v), cx, y); cx += oColW[i] * (pageW - margin * 2) })
        y += 11
      }
    }

    const filename = `spray-report-${fieldName}-${new Date().toISOString().split("T")[0]}.pdf`
    doc.save(filename)
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
      const { data, error } = await supabase.rpc("get_trail_geojson", { p_trail_id: trailId })
      if (error) throw error
      if (data?.path_geojson?.type === "LineString" && data.path_geojson.coordinates?.length >= 2) {
        highlightPath = data.path_geojson
        updateHighlightTrail()
        console.log(`[FieldOverlay] Loaded full trail: ${data.path_geojson.coordinates.length} points`)
      } else {
        console.error("[FieldOverlay] Invalid trail GeoJSON:", data)
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

  // Auto-escalate time range on initial load only: start at 7d, expand until at least one record is visible
  let autoEscalationDone = false
  $: if (!lockedMode && !autoEscalationDone && recordTimes.length > 0) {
    autoEscalationDone = true
    const now = Date.now()
    const escalationSteps = [
      { mode: "7d", span: 604800000 },
      { mode: "30d", span: 2592000000 },
      { mode: "3m", span: 7776000000 },
      { mode: "1y", span: 31536000000 },
      { mode: "all", span: Infinity },
    ]
    for (const step of escalationSteps) {
      const hasRecords = recordTimes.some(t => t >= now - step.span)
      if (hasRecords || step.mode === "all") {
        rangeMode = step.mode
        break
      }
    }
  }

  // When rangeMode changes or records load, update slider bounds
  $: {
    if (rangeMode === "all" || lockedMode) {
      sliderMin = timeMin
      sliderMax = timeMax
    } else {
      const periods: Record<string, number> = { "1d": 86400000, "7d": 604800000, "30d": 2592000000, "3m": 7776000000, "1y": 31536000000 }
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
    if (t < sliderStart || t > sliderEnd) return false
    if (selectedOperationId && r.operation_id !== selectedOperationId) return false
    return true
  })

  // Sorted by start_time — MUST match renderTrails ordering for index-based layer IDs
  $: sortedRecords = filteredRecords.slice().sort((a, b) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )

  // Available operations from records
  $: availableOperations = records
    .filter((r, i, arr) => arr.findIndex(x => x.operation_id === r.operation_id) === i)
    .map(r => ({ id: r.operation_id, name: r.operation_name || "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name))

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

  // Highlight selected trail(s) with white outlines
  function highlightSelectedTrail() {
    if (!map) return
    // Reset all trail outline layers
    const trailOutlines = map.getStyle().layers.filter(
      (l: any) => l.id.startsWith("trail-") && l.id.endsWith("-outline")
    )
    for (const layer of trailOutlines) {
      try { map.setPaintProperty(layer.id, "line-opacity", 0) }
      catch (err) { /* ignore */ }
    }
    if (!selectedTrail) return

    // Build list of base IDs to highlight
    const baseIds: string[] = []
    if (selectedTrail.intervalIdx !== undefined && selectedTrail.intervalIdx !== null) {
      // Single interval
      baseIds.push(`trail-${selectedTrail.recordIdx}-${selectedTrail.intervalIdx}`)
    } else {
      // All intervals for this record
      const record = sortedRecords[selectedTrail.recordIdx]
      if (record?.interval_paths?.length) {
        for (let i = 0; i < record.interval_paths.length; i++) {
          baseIds.push(`trail-${selectedTrail.recordIdx}-${i}`)
        }
      } else {
        baseIds.push(`trail-${selectedTrail.recordIdx}`)
      }
    }

    for (const baseId of baseIds) {
      const outlineId = `${baseId}-outline`
      if (map.getLayer(outlineId)) {
        try { map.setPaintProperty(outlineId, "line-opacity", 1.0) }
        catch (err) { /* ignore */ }
      }
    }
  }

  function renderTrails() {
    if (!map) return

    const activeRecords = sortedRecords
    console.log(`[FieldOverlay] renderTrails: ${activeRecords.length} records`)

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
                recordId: record.id,
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
            properties: { recordIdx, recordId: record.id, operator: record.operator_name || "Unknown", vehicle: formatVehicleType(record.vehicle_type), date: formatDate(record.start_time), area: formatHa(record.area_hectares), distance: formatKm(record.distance_km), color },
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

  // Select a trail from the legend — highlights ALL intervals by default
  function selectTrail(idx: number, record: any) {
    // Hide any active GPS trail highlight when switching records
    highlightTrailId = null
    highlightPath = null
    updateHighlightTrail()
    if (selectedTrail?.recordId === record.id && selectedTrail?.intervalIdx === null) {
      selectedTrail = null
      restoreLayerOrder()
      highlightSelectedTrail()
      return
    }
    selectedTrail = {
      recordIdx: idx,
      recordId: record.id,
      intervalIdx: null,  // null = highlight all intervals
      color: getTrailColor(record, idx),
      date: formatDate(record.start_time),
      operator: record.operator_name || "Unknown",
      vehicle: formatVehicleType(record.vehicle_type),
      area: formatHa(record.area_hectares),
      distance: formatKm(record.distance_km),
      startTime: null,
      endTime: null,
      intervalCount: record.intervals?.length || 1,
    }
    bringTrailToTop(selectedTrail)
    highlightSelectedTrail()
  }

  // Select a specific interval/visit from the detail panel
  function selectInterval(recordIdx: number, record: any, intervalIdx: number) {
    // Hide any active GPS trail highlight when switching intervals
    highlightTrailId = null
    highlightPath = null
    updateHighlightTrail()
    if (selectedTrail?.recordId === record.id && selectedTrail?.intervalIdx === intervalIdx) {
      selectedTrail = null
      restoreLayerOrder()
      highlightSelectedTrail()
      return
    }
    const interval = record.intervals?.[intervalIdx]
    selectedTrail = {
      recordIdx,
      recordId: record.id,
      intervalIdx,
      color: getTrailColor(record, recordIdx),
      date: formatDate(record.start_time),
      operator: record.operator_name || "Unknown",
      vehicle: formatVehicleType(record.vehicle_type),
      area: formatHa(interval?.area_hectares || record.area_hectares),
      distance: formatKm(interval?.distance_km || record.distance_km),
      startTime: interval?.entry_time ? formatTime(interval.entry_time) : null,
      endTime: interval?.exit_time ? formatTime(interval.exit_time) : null,
      intervalCount: record.intervals?.length || 1,
    }
    bringTrailToTop(selectedTrail)
    highlightSelectedTrail()
  }

  // Format time between two spray records (e.g. "2 hours", "3 days", "2 months")
  function formatTimeBetween(prevTime: number, currTime: number): string {
    const diff = currTime - prevTime
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)
    if (years > 0) return `${years} year${years > 1 ? "s" : ""}`
    if (months > 0) return `${months} month${months > 1 ? "s" : ""}`
    if (days > 0) return `${days} day${days > 1 ? "s" : ""}`
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`
    if (minutes > 0) return `${minutes} min`
    return "moments"
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
      // Hide any active GPS trail highlight when switching via map click
      highlightTrailId = null
      highlightPath = null
      updateHighlightTrail()
      selectedTrail = props
      bringTrailToTop(props)
      highlightSelectedTrail()
    } else {
      // Clicked on deadspace — deselect
      if (selectedTrail) {
        highlightTrailId = null
        highlightPath = null
        updateHighlightTrail()
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

  // Move selected trail's layers to the top of the render order
  function bringTrailToTop(props: any) {
    if (!map) return
    const baseIds: string[] = []
    if (props.intervalIdx !== undefined && props.intervalIdx !== null) {
      baseIds.push(`trail-${props.recordIdx}-${props.intervalIdx}`)
    } else {
      // All intervals
      const record = sortedRecords[props.recordIdx]
      if (record?.interval_paths?.length) {
        for (let i = 0; i < record.interval_paths.length; i++) {
          baseIds.push(`trail-${props.recordIdx}-${i}`)
        }
      } else {
        baseIds.push(`trail-${props.recordIdx}`)
      }
    }
    for (const baseId of baseIds) {
      if (map.getLayer(`${baseId}-outline`)) map.moveLayer(`${baseId}-outline`)
      if (map.getLayer(baseId)) map.moveLayer(baseId)
      if (map.getLayer(`${baseId}-markers-entry`)) map.moveLayer(`${baseId}-markers-entry`)
      if (map.getLayer(`${baseId}-markers-exit`)) map.moveLayer(`${baseId}-markers-exit`)
    }
    if (map.getLayer("field-label")) map.moveLayer("field-label")
  }

  // Restore original layer order (by start_time) when deselected
  function restoreLayerOrder() {
    if (!map) return
    for (let recordIdx = 0; recordIdx < sortedRecords.length; recordIdx++) {
      const record = sortedRecords[recordIdx]
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
    // Lock body scroll while overlay is open
    document.body.style.overflow = "hidden"
    document.body.style.position = "fixed"
    document.body.style.width = "100%"
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
      preserveDrawingBuffer: true, // required for toDataURL() snapshot in reports
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
            properties: { name: fieldName, area: (fieldAreaHa || totalArea).toFixed(1) + " ha" },
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

  onDestroy(() => {
    document.body.style.overflow = ""
    document.body.style.position = ""
    document.body.style.width = ""
    document.removeEventListener("mousemove", onPanelDragMove)
    document.removeEventListener("mouseup", onPanelDragEnd)
    document.removeEventListener("touchmove", onPanelDragMove)
    document.removeEventListener("touchend", onPanelDragEnd)
    if (renderTimer) clearTimeout(renderTimer); if (popup) popup.remove(); if (map) map.remove()
  })

  $: totalArea = filteredRecords.reduce((sum, r) => sum + parseFloat(r.area_hectares || 0), 0)
  $: totalDistance = filteredRecords.reduce((sum, r) => sum + parseFloat(r.distance_km || 0), 0)

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
        id: HIGHLIGHT_OUTLINE, type: "line", source: HIGHLIGHT_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#000000", "line-width": 7, "line-opacity": 0.6 },
      })
      map.addLayer({
        id: HIGHLIGHT_LAYER, type: "line", source: HIGHLIGHT_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#fbbf24", "line-width": 3, "line-opacity": 0.95, "line-dasharray": [4, 2] },
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
          <span class="stat-label">record{filteredRecords.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <Ruler size={14} class="text-green-400" />
          <span class="stat-value">{(fieldAreaHa || totalArea).toFixed(2)}</span>
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

    {#if availableOperations.length > 1}
      <div class="range-selector">
        <Layers size={14} class="text-white/40" />
        <select bind:value={selectedOperationId} class="range-select">
          <option value="">All Operations</option>
          {#each availableOperations as op}
            <option value={op.id}>{op.name}</option>
          {/each}
        </select>
      </div>
    {/if}

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

  <!-- Map + sidebar in flex row (desktop: side by side; mobile: stacked) -->
  <div class="main-area">
    <div class="map-container" bind:this={container}></div>

    <div class="info-panel" style="--panel-vh: {panelHeight > 0 ? panelHeight + 'vh' : 'auto'}">
      <div class="info-panel-header"
        role="button"
        tabindex="0"
        on:mousedown={onPanelDragStart}
        on:touchstart={onPanelDragStart}
      >
        <span class="panel-drag-handle"></span>
        <span class="info-panel-title">Legend</span>
        <span class="info-panel-count">{sortedRecords.length} record{sortedRecords.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="info-panel-legend">
        {#each sortedRecords as record, i}
          {@const isSelected = selectedTrail?.recordId === record.id}
          {@const prevRecord = i > 0 ? sortedRecords[i - 1] : null}
          {@const timeSincePrev = prevRecord ? formatTimeBetween(new Date(prevRecord.start_time).getTime(), new Date(record.start_time).getTime()) : null}
          <button class="legend-item" class:active={isSelected} on:click={() => selectTrail(i, record)}>
            <span class="legend-color" style="background: {getTrailColor(record, i)}"></span>
            <span class="legend-date">{new Date(record.start_time).toLocaleDateString()}</span>
            <span class="legend-operator">{record.operator_name || "Unknown"}</span>
            {#if record.intervals?.length > 1}
              <span class="legend-intervals">{record.intervals.length} visits</span>
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
                  <span>{selectedTrail.startTime} – {selectedTrail.endTime}</span>
                </div>
              {:else}
                <div class="legend-detail-row">
                  <Clock size={12} class="text-white/40" />
                  <span>{formatTime(record.start_time)} – {formatTime(record.end_time)}</span>
                </div>
              {/if}
              <div class="legend-detail-row">
                <Ruler size={12} class="text-white/40" />
                <span>{selectedTrail.area} · {selectedTrail.distance}</span>
              </div>
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
                      on:click|stopPropagation={() => selectInterval(i, record, j)}
                    >
                      Visit {j + 1}
                      <span class="interval-chip-time">{formatTime(interval.entry_time)} – {formatTime(interval.exit_time)}</span>
                    </button>
                  {/each}
                </div>
              {/if}
              {#if record.trail_id}
                <button
                  class="show-trail-btn"
                  class:active={highlightTrailId === record.trail_id}
                  disabled={highlightTrailLoading}
                  on:click|stopPropagation={() => showFullTrail(record.trail_id)}
                >
                  {#if highlightTrailLoading && highlightTrailId === record.trail_id}
                    <Loader2 size={12} class="animate-spin" />
                  {:else}
                    <MapPin size={12} />
                  {/if}
                  {highlightTrailId === record.trail_id ? "Hide GPS trail" : "Show full GPS trail"}
                </button>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
      <!-- Generate Report button -->
      {#if !lockedMode && sortedRecords.length > 0}
        <button class="generate-report-btn" on:click={() => generateReport()}>
          <FileText size={14} />
          Generate Report
        </button>
      {/if}
  </div>
  </div>

  <!-- Report panel -->
  {#if showReport}
    <div class="report-overlay" role="button" tabindex="0" on:click|self={() => showReport = false} on:keydown={(e) => e.key === "Escape" && (showReport = false)}>
      <div class="report-panel">
        <div class="report-header">
          <h2>Spray Report — {fieldName}</h2>
          <div class="report-header-actions">
            <button class="report-download-btn" on:click={() => downloadReportPDF()}>
              <Download size={16} />
              PDF
            </button>
            <button class="report-close" on:click={() => showReport = false}>
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
            <span>Products</span>
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
                <span class="report-value">{reportData.totalOperatingTime}</span>
              </div>
              {/if}
            </div>
          </div>

          <!-- Map snapshot -->
          {#if reportData.snapshot}
            <div class="report-section">
              <h3>Coverage Map</h3>
              <img src={reportData.snapshot} alt="Coverage map" class="report-snapshot" />
            </div>
          {/if}

          <!-- Products / Inputs -->
          {#if includeProducts}
          <div class="report-section">
            <h3>Products Applied</h3>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Active Ingredient</th>
                  <th>Rate</th>
                  <th>Usage</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {#each reportData.products as p}
                  <tr>
                    <td>{p.name}</td>
                    <td>{p.activeIngredient}</td>
                    <td>{p.rate}</td>
                    <td>{p.usage}</td>
                    <td>{p.cost}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {/if}

          <!-- Operating hours -->
          {#if includeOperators && reportData.operatingHours?.length}
            <div class="report-section">
              <h3>Operating Hours <span class="report-section-total">Total: {reportData.totalOperatingTime}</span></h3>
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
            <h3>Weather Records</h3>
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
                    <td>{w.temp}°C</td>
                    <td>{w.windSpeed} km/h {w.windDir}</td>
                    <td>{w.gust} km/h</td>
                    <td>{w.humidity}%</td>
                    <td>{w.deltaT}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
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
  .panel-drag-handle { display: none; }

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
    .info-panel-header:active { cursor: grabbing; }
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

  /* Report panel */
  .report-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
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
  .report-header h2 { font-size: 18px; font-weight: 600; margin: 0; }
  .report-header-actions { display: flex; align-items: center; gap: 8px; }
  .report-download-btn {
    display: flex; align-items: center; gap: 5px;
    background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3);
    color: #60a5fa; padding: 5px 12px; border-radius: 6px;
    font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s;
  }
  .report-download-btn:hover {
    background: rgba(59, 130, 246, 0.25); border-color: rgba(59, 130, 246, 0.5); color: #93c5fd;
  }
  .report-close {
    background: none; border: none; color: rgba(255, 255, 255, 0.4);
    cursor: pointer; padding: 4px; border-radius: 4px;
  }
  .report-close:hover { color: white; background: rgba(255, 255, 255, 0.1); }
  .report-body { padding: 20px; }
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
  .report-toggle input { accent-color: #3b82f6; cursor: pointer; }
  .report-section { margin-bottom: 24px; }
  .report-section h3 {
    font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase; letter-spacing: 0.5px;
    margin: 0 0 10px 0; padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex; justify-content: space-between; align-items: center;
  }
  .report-section-total {
    font-size: 12px; font-weight: 500; color: rgba(255, 255, 255, 0.4);
    text-transform: none; letter-spacing: 0;
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
  .report-label { font-size: 11px; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.5px; }
  .report-value { font-size: 14px; font-weight: 500; }
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
  .report-table tr:last-child td { border-bottom: none; }
</style>