<script lang="ts">
  import { onMount } from "svelte"
  import Icon from "@iconify/svelte"
  import { toast } from "svelte-sonner"
  import { browser } from "$app/environment"
  import { supabase } from "$lib/supabaseClient"
  import { profileStore } from "$lib/stores/profileStore"

  // ── Categories ──
  const WEATHER_CATEGORIES = [
    { id: "live", name: "Live / Forecast", icon: "solar:bolt-bold", desc: "Current conditions & hourly forecast — for spray decisions now" },
    { id: "historical", name: "Historical / Climate", icon: "solar:calendar-mark-bold", desc: "Daily records & archives — overlay similar sources to sanity-check" },
  ] as const

  // ── Sources (each can belong to one or more categories) ──
  const WEATHER_SOURCES = [
    { id: "open-meteo", name: "Open-Meteo", color: "#38bdf8", implemented: true, categories: ["live", "historical"],
      desc: "Free, no key. Live current/forecast + ERA5 archive (1940+)." },
    { id: "silo", name: "SILO / Long Paddock", color: "#f59e0b", implemented: true, categories: ["historical"],
      desc: "QLD Gov daily climate 1889+ (rain, temp, radiation, evap). Free — just your email." },
    { id: "dpird", name: "DPIRD (WA)", color: "#22c55e", implemented: true, categories: ["live", "historical"],
      desc: "WA Dept station network. Free API key. Live observations + daily summaries." },
    { id: "bom", name: "BoM", color: "#ef4444", implemented: true, categories: ["live"],
      desc: "Official AU observations from nearest station. No key. Live only." },
    { id: "bom-fwo", name: "BoM fwo (station)", color: "#fb7185", implemented: true, categories: ["live"],
      desc: "BoM official station files — includes Delta T & dew point. Nearest station by lat/lon." },
    { id: "visual-crossing", name: "Visual Crossing", color: "#a3e635", implemented: true, categories: ["live", "historical"],
      desc: "Independent commercial blend (models + stations). Free tier. Needs key." },
    { id: "meteostat", name: "Meteostat", color: "#2dd4bf", implemented: true, categories: ["live", "historical"],
      desc: "Independent weather interpolation. Via RapidAPI — paste your x-rapidapi-key." },
    { id: "weatherlink", name: "Davis WeatherLink", color: "#a78bfa", implemented: false, categories: ["live", "historical"],
      desc: "Physical station cloud API (key + token)." },
    { id: "wunderground", name: "Weather Underground", color: "#f472b6", implemented: false, categories: ["live", "historical"],
      desc: "Personal station (PWS) network. IBM API key." },
  ] as const

  const RANGE_PRESETS = [
    { label: "7d", days: 7 },
    { label: "14d", days: 14 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
    { label: "12m", days: 365 },
  ]

  // ── State ──
  let category: "live" | "historical" = "live"
  let selectedSources: string[] = ["open-meteo"]
  // Source-selection UX: Open-Meteo is always the primary model; optionally add one
  // comparison model (VC / Meteostat) and/or switch to a real BoM weather station (live only).
  let secondaryModel = ""
  let stationMode = false
  let nearbyStations: any[] = []
  let stationsLoading = false
  let selectedStation: any = null

  let fields: any[] = []
  let farms: any[] = []
  let fieldsLoading = true
  let selectedFieldId = ""
  let selectedFarmId = ""
  let manualLat = ""
  let manualLng = ""
  let useManual = false
  let activeRange = 14
  let startDate = ""
  let endDate = ""

  let loading = false
  let errorMsg = ""

  // Live data keyed by source id
  let liveData: Record<string, any> = {}
  // Historical comparison data keyed by source id
  let compData: Record<string, any> = {}
  // ECMWF forecast (today + 7 days) via the Open-Meteo forecast API
  let forecastData: any = null
  let siloUsername = ""
  let dpirdKey = ""
  let visualCrossingKey = ""
  let meteostatKey = ""

  let activeLat: number | null = null
  let activeLng: number | null = null

  const categoriesIn = (id: string, cat: string) =>
    (WEATHER_SOURCES as any[]).find((s) => s.id === id)?.categories?.includes(cat)

  const sourceInfo = (id: string) => (WEATHER_SOURCES as any[]).find((s) => s.id === id)

  function applyRange(days: number) {
    activeRange = days
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - (days - 1))
    endDate = end.toISOString().slice(0, 10)
    startDate = start.toISOString().slice(0, 10)
  }

  async function setCategory(cat: "live" | "historical") {
    if (category === cat) return
    category = cat
    if (cat === "live" && (secondaryModel === "silo" || secondaryModel === "dpird")) {
      secondaryModel = ""
    }
    syncSources()
    compData = {}
    liveData = {}
    errorMsg = ""
    if (activeLat != null && activeLng != null) await fetchCompare()
  }

  function toggleSource(id: string) {
    if (selectedSources.includes(id)) {
      selectedSources = selectedSources.filter((x) => x !== id)
    } else {
      selectedSources = [...selectedSources, id]
    }
  }

  // Derive the active source list from the new UI: Open-Meteo primary + optional
  // comparison model (VC/Meteostat) + optional chosen BoM station (live only).
  function syncSources() {
    const out = ["open-meteo"]
    const validModels = category === "historical"
      ? ["visual-crossing", "meteostat", "silo", "dpird"]
      : ["visual-crossing", "meteostat"]
    if (validModels.includes(secondaryModel)) out.push(secondaryModel)
    if (category === "live" && stationMode && selectedStation) out.push("bom-fwo")
    selectedSources = out
  }
  async function onSecondaryModelChange() {
    syncSources()
    await fetchCompare()
  }
  async function toggleStationMode() {
    stationMode = !stationMode
    if (stationMode) await loadNearbyStations()
    syncSources()
    await fetchCompare()
  }
  async function selectStation(st: any) {
    selectedStation = st
    syncSources()
    await fetchCompare()
  }

  onMount(async () => {
    if (browser) {
      siloUsername = localStorage.getItem("weather-silo-username") || ""
      dpirdKey = localStorage.getItem("weather-dpird-key") || ""
      visualCrossingKey = localStorage.getItem("weather-vc-key") || ""
      meteostatKey = localStorage.getItem("weather-meteostat-key") || ""
    }
    applyRange(14)
    await loadFields()
    if (fields.length > 0) selectField(fields[0].field_id)
  })

  async function loadFields() {
    fieldsLoading = true
    try {
      const mapId = $profileStore?.master_map_id
      if (!mapId) { fields = []; farms = []; return }
      const [farmRes, fieldRes] = await Promise.all([
        supabase.from("farms").select("id, name").eq("map_id", mapId).order("name"),
        supabase.from("fields").select("field_id, name, boundary, farm_id").eq("map_id", mapId).order("name").limit(200),
      ])
      if (farmRes.error) throw farmRes.error
      if (fieldRes.error) throw fieldRes.error
      const fData = (fieldRes.data || []).filter((f) => f.boundary)
      fields = fData
      // Group fields by farm
      const groups: Record<string, any> = {}
      for (const f of farmRes.data || []) groups[f.id] = { id: f.id, name: f.name, fields: [] }
      const ungrouped: any = { id: "", name: "Ungrouped", fields: [] }
      for (const f of fData) {
        if (f.farm_id && groups[f.farm_id]) groups[f.farm_id].fields.push(f)
        else ungrouped.fields.push(f)
      }
      farms = Object.values(groups)
        .filter((g) => g.fields.length > 0)
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
      if (ungrouped.fields.length > 0) farms.push(ungrouped)
    } catch (e: any) {
      toast.error(`Failed to load fields: ${e.message}`)
    } finally {
      fieldsLoading = false
    }
  }

  async function selectField(id: string) {
    selectedFieldId = id
    selectedFarmId = ""
    useManual = false
    await fetchCompare()
  }

  async function selectFarm(id: string) {
    selectedFarmId = id
    selectedFieldId = ""
    useManual = false
    await fetchCompare()
  }

  async function selectManual() {
    useManual = true
    selectedFieldId = ""
    selectedFarmId = ""
    if (manualLat.trim() && manualLng.trim()) await fetchCompare()
  }

  async function applyRangeAndReload(days: number) {
    applyRange(days)
    await fetchCompare()
  }

  async function resolveCoords(): Promise<{ lat: number; lng: number } | null> {
    if (useManual) {
      const lat = parseFloat(manualLat)
      const lng = parseFloat(manualLng)
      if (isNaN(lat) || isNaN(lng)) { toast.error("Enter valid latitude / longitude"); return null }
      return { lat, lng }
    }
    const turf = await import("@turf/turf")
    // Whole farm → centroid of ALL the farm's field boundaries combined
    if (selectedFarmId) {
      const grp = farms.find((g) => g.id === selectedFarmId)
      if (grp?.fields?.length) {
        try {
          const fc = turf.featureCollection(grp.fields.map((f: any) => turf.feature(f.boundary)))
          const c = turf.centroid(fc)
          const [lng, lat] = c.geometry.coordinates
          return { lat, lng }
        } catch {
          toast.error("Could not compute farm centre")
          return null
        }
      }
    }
    const field = fields.find((f) => f.field_id === selectedFieldId)
    if (!field?.boundary) { toast.error("Select a field with a boundary"); return null }
    try {
      const c = turf.centroid(turf.feature(field.boundary))
      const [lng, lat] = c.geometry.coordinates
      return { lat, lng }
    } catch {
      toast.error("Could not compute field centre")
      return null
    }
  }

  function setActiveLocation(lat: number, lng: number) {
    activeLat = lat
    activeLng = lng
  }

  async function fetchCompare() {
    const loc = await resolveCoords()
    if (!loc) return
    setActiveLocation(loc.lat, loc.lng)
    if (stationMode) { loadNearbyStations() }
    loading = true
    errorMsg = ""
    const errs: string[] = []
    try {
      forecastData = null
      const forecastP = (async () => {
        try { forecastData = await fetchForecast(loc) } catch (e: any) { errs.push(e.message || String(e)) }
      })()
      if (category === "live") {
        liveData = {}
        await Promise.all(selectedSources.map(async (id) => {
          try {
            if (id === "open-meteo") liveData["open-meteo"] = await fetchOpenMeteoCurrent(loc)
            if (id === "bom") liveData["bom"] = await fetchBomObservations(loc)
            if (id === "bom-fwo") liveData["bom-fwo"] = selectedStation ? await fetchBomFwoStation(selectedStation) : await fetchBomFwo(loc)
            if (id === "dpird") liveData["dpird"] = await fetchDPIRDLatest(loc)
            if (id === "visual-crossing") liveData["visual-crossing"] = await fetchVisualCrossing(loc, false)
            if (id === "meteostat") liveData["meteostat"] = await fetchMeteostat(loc, false)
          } catch (e: any) { errs.push(e.message || String(e)) }
        }))
      } else {
        compData = {}
        const updates: Record<string, any> = {}
        await Promise.all(selectedSources.map(async (id) => {
          try {
            if (id === "open-meteo") updates["open-meteo"] = await fetchOpenMeteoArchive(loc)
            if (id === "silo") updates["silo"] = await fetchSILO(loc)
            if (id === "dpird") updates["dpird"] = await fetchDPIRDDaily(loc)
            if (id === "visual-crossing") updates["visual-crossing"] = await fetchVisualCrossing(loc, true)
            if (id === "meteostat") updates["meteostat"] = await fetchMeteostat(loc, true)
          } catch (e: any) { errs.push(e.message || String(e)) }
        }))
        // Single immutable assignment → one clean re-render with all sources at once
        compData = { ...compData, ...updates }
      }
      await forecastP
    } finally {
      loading = false
    }
    if (errs.length > 0) errorMsg = errs.join(" · ")
  }

  // ── Open-Meteo: live current + hourly forecast ──
  async function fetchOpenMeteoCurrent(loc: { lat: number; lng: number }) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
      `&current=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,soil_moisture_0_to_10cm` +
      `&hourly=temperature_2m,dew_point_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover` +
      `&forecast_days=2&timezone=auto`
    const r = await fetchWithLog("Open-Meteo current", url)
    const j = await r.json()
    logRequest("Open-Meteo current", url.replace("https://", ""), r.status, j.current)
    return j
  }

  // ── Open-Meteo: daily archive (for historical comparison) ──
  async function fetchOpenMeteoArchive(loc: { lat: number; lng: number }) {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lng}` +
      `&start_date=${startDate}&end_date=${endDate}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,shortwave_radiation_sum,wind_speed_10m_max` +
      `&timezone=auto`
    const r = await fetchWithLog("Open-Meteo archive", url)
    const j = await r.json()
    logRequest("Open-Meteo archive", url.replace("https://", ""), r.status, j.daily)
    return j
  }

  // ── ECMWF 7-day forecast (Open-Meteo forecast API, ECMWF IFS model) ──
  async function fetchForecast(loc: { lat: number; lng: number }) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset` +
      `&forecast_days=8&models=ecmwf_ifs025&timezone=auto`
    const r = await fetchWithLog("ECMWF forecast", url)
    const j = await r.json()
    logRequest("ECMWF forecast", url.replace("https://", ""), r.status, { current: j.current, days: forecastDays(j).length, sample: forecastDays(j)[0] })
    return j
  }

  // Open-Meteo forecast response → array of daily forecast rows
  function forecastDays(j: any): any[] {
    const d = j?.daily || {}
    const n = d.time?.length || 0
    const out: any[] = []
    for (let i = 0; i < n; i++) {
      out.push({
        date: d.time?.[i],
        max: d.temperature_2m_max?.[i],
        min: d.temperature_2m_min?.[i],
        code: d.weather_code?.[i],
        rain: d.precipitation_sum?.[i] ?? 0,
        prob: d.precipitation_probability_max?.[i] ?? 0,
        wind: d.wind_speed_10m_max?.[i],
        gust: d.wind_gusts_10m_max?.[i],
        windDir: d.wind_direction_10m_dominant?.[i],
        sunrise: d.sunrise?.[i],
        sunset: d.sunset?.[i],
      })
    }
    return out
  }

  function dayLabel(dateStr: string, i: number): string {
    if (i === 0) return "Today"
    const p = (dateStr || "").split("-")
    if (p.length < 3) return ""
    const dt = new Date(+p[0], +p[1] - 1, +p[2])
    if (isNaN(dt.getTime())) return ""
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dt.getDay()]
  }

  // ── SILO / Long Paddock — daily gridded climate ──
  async function fetchSILO(loc: { lat: number; lng: number }) {
    if (!siloUsername.trim()) { toast.error("Enter your SILO email to compare SILO data"); return null }
    const start = startDate.replace(/-/g, "")
    const end = endDate.replace(/-/g, "")
    const url = `/silo-proxy/cgi-bin/silo/DataDrillDataset.php` +
      `?format=json&lat=${loc.lat.toFixed(2)}&lon=${loc.lng.toFixed(2)}` +
      `&start=${start}&finish=${end}` +
      `&username=${encodeURIComponent(siloUsername.trim())}&password=apirequest` +
      `&comment=RXNHVJEGM`
    const r = await fetchWithLog("SILO", url)
    const j = await r.json()
    if (j.error) throw new Error(String(j.error))
    logRequest("SILO", url.replace("/silo-proxy", "silo.longpaddock"), r.status, { rows: siloRows(j).length, sample: siloRows(j)[0] })
    return j
  }

  // Flatten SILO's nested JSON
  function siloRows(data: any): any[] {
    return (data?.data || []).map((d: any) => {
      const vars: Record<string, any> = {}
      for (const v of d.variables || []) vars[v.variable_code] = v.value
      return { date: d.date, ...vars }
    })
  }

  // ── BoM — unofficial geohash API (browser-callable, no key) ──
  async function fetchBomObservations(loc: { lat: number; lng: number }) {
    const g = await fetchWithLog("BoM geocode", `https://api.weather.bom.gov.au/v1/locations?search=${loc.lat},${loc.lng}`)
    const gj = await g.json()
    const geohash = gj.data?.[0]?.geohash
    if (!geohash) throw new Error("No BoM location found near these coordinates")
    const o = await fetchWithLog("BoM observations", `https://api.weather.bom.gov.au/v1/locations/${geohash.slice(0, 6)}/observations`)
    const oj = await o.json()
    if (!oj.data) throw new Error("No BoM observations available")
    logRequest("BoM geohash", `api.weather.bom.gov.au/v1/locations/${geohash.slice(0, 6)}/observations`, o.status, oj)
    return { geohash, time: oj.metadata?.observation_time, ...oj.data }
  }

  // ── BoM fwo — official station files (delta_t, dewpt), via proxy ──
  let bomStationsCache: any[] | null = null
  const BOM_STATE_LETTER: Record<string, string> = { NSW: "N", VIC: "V", QLD: "Q", SA: "S", WA: "W", TAS: "T", NT: "D", ACT: "N" }

  // In-memory cache for quota-based historical endpoints (Visual Crossing, Meteostat).
  // Keyed by source + coords + range, so re-loads (source toggles, category switches,
  // re-clicking a field) reuse the earlier response instead of burning another quota record/call.
  let histCache: Record<string, any> = {}

  async function getBomStations(): Promise<any[]> {
    if (bomStationsCache) return bomStationsCache
    const r = await fetchWithLog("BoM stations.txt", "/bom-proxy/climate/data/lists_by_element/stations.txt")
    const text = await r.text()
    const out: any[] = []
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      const name = (line.slice(12, 52) || "").trim()
      const ll = line.match(/(-?\d+\.\d{4})\s+(-?\d+\.\d{4})/)
      const lat = ll ? parseFloat(ll[1]) : NaN
      const lon = ll ? parseFloat(ll[2]) : NaN
      const wm = line.match(/(\d{5})\s*$/)
      const wmo = wm ? wm[1] : null
      const sm = line.match(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/)
      const state = sm ? sm[1] : null
      if (isNaN(lat) || isNaN(lon) || !wmo || !state) continue
      out.push({ name, lat, lon, wmo, state })
    }
    bomStationsCache = out
    logRequest("BoM stations.txt", "/bom-proxy/climate/data/lists_by_element/stations.txt", r.status, { stations: out.length })
    return out
  }

  // Pick nearest station whose latest fwo reading is fresh (≤6h old); fall back to nearest with any reading
  async function fetchBomFwo(loc: { lat: number; lng: number }) {
    const stations = await getBomStations()
    const sorted = stations
      .map((s) => ({ ...s, d: Math.hypot(s.lat - loc.lat, s.lon - loc.lng) }))
      .sort((a, b) => a.d - b.d)
    const candidates = sorted.slice(0, 6)
    const FRESH_MS = 6 * 3600 * 1000
    let best: any = null, fallback: any = null
    for (const s of candidates) {
      try {
        const stateLetter = BOM_STATE_LETTER[s.state] || "W"
        const url = `/bom-proxy/fwo/ID${stateLetter}60801/ID${stateLetter}60801.${s.wmo}.json`
        const r = await fetch(url)
        if (!r.ok) continue
        const j = await r.json()
        const reading = j?.observations?.data?.[0]
        if (!reading) continue
        const t = fwoTime(reading.local_date_time_full)
        const ts = t ? new Date(t).getTime() : 0
        const ageH = ts ? (Date.now() - ts) / 3600000 : Infinity
        const entry = { s, reading, distKm: s.d * 111.19, ageH }
        if (!fallback) fallback = entry
        if (ts && ageH <= FRESH_MS / 3600000) { best = entry; break }
      } catch { /* try next */ }
    }
    const chosen = best || fallback
    if (!chosen) throw new Error("No BoM fwo station with data nearby")
    const url = `/bom-proxy/fwo/ID${BOM_STATE_LETTER[chosen.s.state] || "W"}60801/ID${BOM_STATE_LETTER[chosen.s.state] || "W"}60801.${chosen.s.wmo}.json`
    logRequest(`BoM fwo (${chosen.s.name})`, url, 200, { nearestStation: chosen.s, distKm: chosen.distKm, readingAgeH: chosen.ageH, latest: chosen.reading })
    return { nearest: chosen.s, distKm: chosen.distKm, ageH: chosen.ageH, reading: chosen.reading }
  }

  // List nearest BoM stations (from the official stations list) to pick from manually
  async function loadNearbyStations() {
    if (activeLat == null || activeLng == null) { nearbyStations = []; return }
    stationsLoading = true
    try {
      const stations = await getBomStations()
      nearbyStations = stations
        .map((s) => ({ ...s, distKm: Math.hypot(s.lat - activeLat, s.lon - activeLng) * 111.19 }))
        .sort((a, b) => a.distKm - b.distKm)
        .slice(0, 12)
    } catch (e: any) {
      toast.error("Could not load nearby stations: " + (e.message || e))
    } finally {
      stationsLoading = false
    }
  }

  // Fetch a specific BoM fwo station's latest reading (for the station picker)
  async function fetchBomFwoStation(station: any) {
    const stateLetter = BOM_STATE_LETTER[station.state] || "W"
    const url = `/bom-proxy/fwo/ID${stateLetter}60801/ID${stateLetter}60801.${station.wmo}.json`
    const r = await fetchWithLog(`BoM fwo (${station.name})`, url)
    const j = await r.json()
    const reading = j?.observations?.data?.[0]
    if (!reading) throw new Error("No BoM fwo reading for " + station.name)
    const t = fwoTime(reading.local_date_time_full)
    const ageH = t ? (Date.now() - new Date(t).getTime()) / 3600000 : Infinity
    logRequest(`BoM fwo (${station.name})`, url, r.status, { reading })
    return { nearest: station, distKm: station.distKm, ageH, reading }
  }

  // Public BoM FWO product page for a station (open in new tab)
  function bomFwoLink(station: any): string {
    const letter = BOM_STATE_LETTER[station?.state] || "W"
    return `https://www.bom.gov.au/products/ID${letter}60801/ID${letter}60801.${station?.wmo}.shtml`
  }

  // ── Visual Crossing — independent blend, CORS-enabled, needs free key ──
  // Quota-friendly: free tier = 1000 records/day and every hourly point counts as a record.
  // Live → just today with include=current (~1-2 records instead of 24/day × range).
  // Historical → days only, 1 record/day (a 12m range = 365 records, not ~8760).
  async function fetchVisualCrossing(loc: { lat: number; lng: number }, historical: boolean) {
    if (!visualCrossingKey.trim()) { toast.error("Enter your Visual Crossing API key to use it"); return null }
    const key = visualCrossingKey.trim()
    if (historical) {
      const ck = `vc|${loc.lat.toFixed(3)}|${loc.lng.toFixed(3)}|${startDate}|${endDate}`
      if (histCache[ck]) { logRequest("Visual Crossing (cached)", "cached", 200, { days: (histCache[ck].days || []).length }); return histCache[ck] }
    }
    const today = new Date().toISOString().slice(0, 10)
    const range = historical ? `${startDate}/${endDate}` : `${today}/${today}`
    const include = historical ? "days" : "current"
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${loc.lat},${loc.lng}/${range}?unitGroup=metric&key=${encodeURIComponent(key)}&include=${include}&contentType=json`
    const r = await fetchWithLog("Visual Crossing", url, undefined, url.replace(`key=${encodeURIComponent(key)}`, "key=***"))
    const j = await r.json()
    logRequest("Visual Crossing", url.replace(`key=${encodeURIComponent(key)}`, "key=***"), r.status, { days: j.days?.length, current: j.currentConditions, sample: j.days?.[0] })
    if (historical) histCache[`vc|${loc.lat.toFixed(3)}|${loc.lng.toFixed(3)}|${startDate}|${endDate}`] = j
    return j
  }

  function visualCrossingDays(j: any): any[] {
    return (j?.days || []).map((d: any) => ({ date: d.datetime, max_temp: d.tempmax, min_temp: d.tempmin, rain: d.precip }))
  }

  // ── Meteostat via RapidAPI (meteostat.p.rapidapi.com) — needs proxy (no CORS) ──
  async function fetchMeteostat(loc: { lat: number; lng: number }, historical: boolean) {
    if (!meteostatKey.trim()) { toast.error("Enter your Meteostat (RapidAPI) key to use it"); return null }
    const key = meteostatKey.trim()
    const headers = { "x-rapidapi-host": "meteostat.p.rapidapi.com", "x-rapidapi-key": key }
    if (historical) {
      const ck = `ms|${loc.lat.toFixed(3)}|${loc.lng.toFixed(3)}|${startDate}|${endDate}`
      if (histCache[ck]) { logRequest("Meteostat daily (cached)", "cached", 200, { rows: (histCache[ck].data || []).length }); return histCache[ck] }
    }
    const url = historical
      ? `/rapidapi-proxy/point/daily?lat=${loc.lat}&lon=${loc.lng}&start=${startDate}&end=${endDate}`
      : `/rapidapi-proxy/point/hourly?lat=${loc.lat}&lon=${loc.lng}&start=${new Date().toISOString().slice(0, 10)}&end=${new Date().toISOString().slice(0, 10)}`
    const r = await fetchWithLog(historical ? "Meteostat daily (RapidAPI)" : "Meteostat hourly (RapidAPI)", url, { headers })
    const j = await r.json()
    if (j.error) throw new Error(String(j.error))
    let result = j
    if (!historical) {
      // No point/current on RapidAPI — hourly rows are in UTC, so use the latest
      // row that has already happened (the last row can be "tonight" in UTC and
      // would show an overnight reading as "current").
      const rows = j.data || []
      const now = Date.now()
      let best: any = null
      let bestT = -Infinity
      for (const r of rows) {
        const t = r.time ? new Date(String(r.time).replace(" ", "T") + "Z").getTime() : NaN
        if (isNaN(t) || t > now) continue
        if (t > bestT) { bestT = t; best = r }
      }
      result = { data: best || rows[rows.length - 1] || null }
    }
    logRequest(historical ? "Meteostat daily (RapidAPI)" : "Meteostat hourly (RapidAPI)", url.replace(key, "key=***"), r.status, historical ? { rows: (j.data || []).length, sample: j.data?.[0] } : j.data)
    if (historical) histCache[`ms|${loc.lat.toFixed(3)}|${loc.lng.toFixed(3)}|${startDate}|${endDate}`] = result
    return result
  }

  // Meteostat point/daily response → { date, max_temp, min_temp, rain }
  function meteostatDays(j: any): any[] {
    return (j?.data || [])
      .filter((r: any) => r?.date)
      .map((r: any) => ({
        date: (r.date || "").slice(0, 10),
        max_temp: r.tmax ?? null,
        min_temp: r.tmin ?? null,
        rain: r.prcp ?? 0,
      }))
  }

  function meteostatCoco(code: number, prcp?: number): string {
    const map: Record<number, string> = { 1: "Clear", 2: "Mostly clear", 3: "Partly cloudy", 4: "Overcast", 5: "Fog", 6: "Light rain", 7: "Rain", 8: "Heavy rain", 9: "Snow", 10: "Showers", 11: "Thunderstorm", 12: "Light rain", 13: "Moderate rain", 14: "Drizzle", 15: "Heavy rain", 16: "Light snow", 17: "Heavy snow", 18: "Rain showers", 19: "Sleet", 20: "Unknown" }
    return map[code] || (code && prcp != null && prcp > 0 ? "Rain" : code ? "Unknown" : "")
  }

  // ── Request logging (for debugging API responses) ──
  let requestLogs: { time: string; label: string; url: string; status: number; body: any }[] = []
  let expandedLog: number | null = null
  let selectedLogs: number[] = []
  function logRequest(label: string, url: string, status: number, body: any) {
    requestLogs = [
      { time: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), label, url, status, body },
      ...requestLogs,
    ].slice(0, 50)
    selectedLogs = []
  }
  function clearLogs() { requestLogs = []; expandedLog = null; selectedLogs = [] }
  function toggleLog(i: number) { expandedLog = expandedLog === i ? null : i }
  function toggleSelectLog(i: number) {
    selectedLogs = selectedLogs.includes(i) ? selectedLogs.filter((x) => x !== i) : [...selectedLogs, i]
  }
  function copyLogs() {
    const idxs = selectedLogs.length ? selectedLogs : requestLogs.map((_, i) => i)
    const out = idxs
      .map((i) => ({ label: requestLogs[i]?.label, time: requestLogs[i]?.time, status: requestLogs[i]?.status, url: requestLogs[i]?.url, body: requestLogs[i]?.body }))
      .filter((x) => x.label != null)
    if (!out.length) return
    const text = JSON.stringify(out, null, 2)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast.success(`Copied ${out.length} log${out.length !== 1 ? "s" : ""} to clipboard`))
        .catch(() => toast.error("Copy failed"))
    } else {
      toast.error("Clipboard not available")
    }
  }

  // Fetch wrapper that logs BOTH success and error responses to the request log
  async function fetchWithLog(label: string, url: string, opts?: RequestInit, logUrl?: string): Promise<Response> {
    const r = await fetch(url, opts)
    const lu = logUrl || url
    if (!r.ok) {
      let errBody = ""
      try { errBody = await r.text() } catch {}
      logRequest(`${label} (error)`, lu, r.status, errBody ? { error: String(errBody).substring(0, 2000) } : { error: r.statusText })
      throw new Error(`${label} ${r.status}`)
    }
    return r
  }

  // ── DPIRD — WA Dept API v2 (api.agric.wa.gov.au, api-key header, proxy only) ──
  async function dpirdHeaders() {
    if (!dpirdKey.trim()) { toast.error("Enter your DPIRD API key to use DPIRD data"); return null }
    return { "api-key": dpirdKey.trim() }
  }

  async function dpirdStationCode(loc: { lat: number; lng: number }): Promise<string | null> {
    const h = await dpirdHeaders()
    if (!h) return null
    const url = `/dpird-proxy/stations/nearby?latitude=${loc.lat}&longitude=${loc.lng}&radius=200`
    const r = await fetchWithLog("DPIRD nearest station", url, { headers: h })
    const j = await r.json()
    const list = j.data || j || []
    const first = Array.isArray(list) ? list[0] : list
    const code = first?.stationCode || first?.station_code
    if (!code) throw new Error("No DPIRD station found near these coordinates")
    logRequest("DPIRD nearest station", url, r.status, { code, name: first?.stationName || first?.name })
    return code
  }

  async function fetchDPIRDLatest(loc: { lat: number; lng: number }) {
    const code = await dpirdStationCode(loc)
    if (!code) return null
    const h = await dpirdHeaders()
    const url = `/dpird-proxy/stations/${code}/latest`
    const r = await fetchWithLog(`DPIRD latest (${code})`, url, { headers: h! })
    const j = await r.json()
    logRequest(`DPIRD latest (${code})`, url, r.status, j.data || j)
    return { code, data: j.data || j }
  }

  async function fetchDPIRDDaily(loc: { lat: number; lng: number }) {
    const code = await dpirdStationCode(loc)
    if (!code) return null
    const h = await dpirdHeaders()
    const url = `/dpird-proxy/stations/${code}/summaries/daily?startDate=${startDate}&endDate=${endDate}`
    const r = await fetchWithLog(`DPIRD daily (${code})`, url, { headers: h! })
    const j = await r.json()
    logRequest(`DPIRD daily (${code})`, url, r.status, { rows: dpirdRows(j).length, sample: dpirdRows(j)[0] })
    return { code, data: j.data || j }
  }

  // Normalize DPIRD daily summaries → { date, max_temp, min_temp, rain }
  function dpirdRows(data: any): any[] {
    const rows = data?.data || data || []
    if (!Array.isArray(rows)) return []
    return rows.map((r: any) => ({
      date: (r.dateTime || r.date || "").slice(0, 10),
      max_temp: r.airTemperatureMax ?? r.airTemperatureMaximum ?? r.maxTemp,
      min_temp: r.airTemperatureMin ?? r.airTemperatureMinimum ?? r.minTemp,
      rain: r.rainfall ?? r.rain,
    }))
  }

  // ── Normalize current conditions from any live source → uniform shape ──
  function normalizeLive(id: string, data: any): any {
    if (id === "open-meteo") {
      const c = data?.current || {}
      return {
        source: "Open-Meteo",
        stationLabel: "Grid cell (ERA5/GFS model)",
        color: "#38bdf8",
        time: c.time, temp: c.temperature_2m, dew: c.dew_point_2m,
        dt: deltaT(c.temperature_2m, c.dew_point_2m),
        wind: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m,
        rain: c.precipitation, humidity: c.relative_humidity_2m, pressure: c.surface_pressure,
        cloud: c.cloud_cover, desc: wmoDesc(c.weather_code) + (c.precipitation && c.precipitation > 0 ? ` · ${c.precipitation}mm rain` : "") + (c.cloud_cover != null && c.weather_code <= 3 ? ` · ${c.cloud_cover}% cloud` : ""),
        soil: c.soil_moisture_0_to_10cm ?? null,
        extra: "",
      }
    }
    if (id === "bom") {
      const d = data || {}
      const station = d.station || {}
      const w = d.wind || {}
      const g = d.gust || {}
      const mx = d.max_temp || {}
      const mn = d.min_temp || {}
      const distKm = station.distance != null ? (station.distance / 1000) : null
      return {
        source: "BoM",
        stationLabel: station.name ? `${station.name}${distKm != null ? " · " + distKm.toFixed(1) + " km away" : ""}` : "BoM",
        color: "#ef4444",
        time: d.time, temp: d.temp, dew: null,
        dt: null,
        wind: w.speed_kilometre, windDir: w.direction, gust: g.speed_kilometre,
        rain: d.rain_since_9am, humidity: d.humidity, pressure: null,
        cloud: null, desc: "",
        extra: `max ${mx.value != null ? mx.value + "°" : '-'} · min ${mn.value != null ? mn.value + "°" : '-'} · since 9am ${d.rain_since_9am ?? '-'}mm`,
      }
    }
    if (id === "bom-fwo") {
      const r = data?.reading || {}
      const nearest = data?.nearest || {}
      const distKm = data?.distKm
      const ageH = data?.ageH
      const ageNote = ageH != null && isFinite(ageH) ? (ageH < 1 ? ` · ${Math.round(ageH * 60)} min old` : ` · ${ageH.toFixed(1)}h old`) : ""
      return {
        source: "BoM fwo",
        stationLabel: `${r.name || nearest.name || "BoM fwo"}${distKm != null ? " · " + distKm.toFixed(1) + " km away" : ""}${ageNote}`,
        color: "#fb7185",
        time: fwoTime(r.local_date_time_full),
        temp: r.air_temp, dew: r.dewpt,
        dt: r.delta_t,
        wind: r.wind_spd_kmh, windDir: r.wind_dir === "CALM" ? 0 : compassToDeg(r.wind_dir), gust: r.gust_kmh,
        rain: parseFloat(r.rain_trace), humidity: r.rel_hum, pressure: r.press_msl,
        cloud: null, desc: r.weather && r.weather !== "-" ? r.weather : "",
        extra: `apparent ${r.apparent_t != null ? Math.round(r.apparent_t) + "°" : '-'} · station obs`,
      }
    }
    if (id === "visual-crossing") {
      const c = data?.currentConditions || {}
      const d0 = data?.days?.[0] || {}
      return {
        source: "Visual Crossing",
        stationLabel: "Model + station blend (commercial)",
        color: "#a3e635",
        // currentConditions.datetime is time-only ("14:00:00") → Invalid Date;
        // datetimeEpoch is a proper local timestamp, render it as UTC ISO.
        time: c.datetimeEpoch ? new Date(c.datetimeEpoch * 1000).toISOString() : null,
        temp: c.temp, dew: c.dew,
        dt: deltaT(c.temp, c.dew),
        wind: c.windspeed, windDir: c.winddir, gust: c.windgust,
        rain: c.precip, humidity: c.humidity, pressure: c.pressure,
        cloud: c.cloudcover, desc: d0.description || c.conditions || "",
        extra: "",
      }
    }
    if (id === "meteostat") {
      const d = data?.data || {}
      return {
        source: "Meteostat",
        stationLabel: "Interpolation (stations + model)",
        color: "#2dd4bf",
        time: d.time ? d.time.replace(" ", "T") + "Z" : null,
        temp: d.temp, dew: d.dwpt,
        dt: deltaT(d.temp, d.dwpt),
        wind: d.wspd, windDir: d.wdir, gust: d.wpgt,
        rain: d.prcp, humidity: d.rhum, pressure: d.pres,
        cloud: null, desc: meteostatCoco(d.coco, d.prcp),
        extra: "",
      }
    }
    if (id === "dpird") {
      const d = data?.data || data || {}
      const w0 = (d.wind && d.wind[0]) || {}
      const wa = w0.avg || {}
      const wm = w0.max || {}
      return {
        source: "DPIRD",
        stationLabel: d.stationName || data?.code || "DPIRD",
        color: "#22c55e",
        time: d.dateTime, temp: d.airTemperature, dew: d.dewPoint,
        dt: d.deltaT,
        wind: wa.speed, windDir: wa.direction?.degrees, gust: wm.speed,
        rain: d.rainfall, humidity: d.relativeHumidity, pressure: d.barometricPressure,
        cloud: null, desc: d.sprayingConditions?.summary || d.sprayingConditions || "",
        extra: `solar ${d.solarIrradiance != null ? Math.round(d.solarIrradiance) + " W/m²" : '-'} · evap ${d.panEvaporation ?? d.evapotranspiration ?? '-'}`,
      }
    }
    return null
  }

  // ── Helpers (live) ──
  function wmoDesc(code: number): string {
    const map: Record<number, string> = {
      0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
      45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
      61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
      71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
      80: "Light showers", 81: "Showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
      95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Severe thunderstorm",
    }
    return map[code] || "Unknown"
  }

  // Animated SVG weather icon (SMIL animations — self-contained, no CSS needed) for a WMO weather code
  function forecastIcon(code: number | null | undefined): string {
    const c = code ?? 3
    const S = 'width="44" height="44" viewBox="0 0 48 48"'
    const CLOUD = "M13.5 31.5 C9 31.5 6 28 6 24 C6 20 9 17 13 16.5 C14.5 12.5 18.5 10 23 10 C28 10 32.5 13.5 33.5 18 C37.5 18.5 41 21.5 41 26 C41 30 37.5 31.5 34 31.5 Z"
    const rays = (cx: number, cy: number, r: number, len: number, w: number) =>
      `<g stroke="#fbbf24" stroke-width="${w}" stroke-linecap="round">` +
      `<line x1="${cx}" y1="${cy - r - len}" x2="${cx}" y2="${cy - r}"/><line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${cy + r + len}"/>` +
      `<line x1="${cx - r - len}" y1="${cy}" x2="${cx - r}" y2="${cy}"/><line x1="${cx + r}" y1="${cy}" x2="${cx + r + len}" y2="${cy}"/>` +
      `<line x1="${cx - (r + len) * 0.71}" y1="${cy - (r + len) * 0.71}" x2="${cx - r * 0.71}" y2="${cy - r * 0.71}"/><line x1="${cx + r * 0.71}" y1="${cy + r * 0.71}" x2="${cx + (r + len) * 0.71}" y2="${cy + (r + len) * 0.71}"/>` +
      `<line x1="${cx + (r + len) * 0.71}" y1="${cy - (r + len) * 0.71}" x2="${cx + r * 0.71}" y2="${cy - r * 0.71}"/><line x1="${cx - r * 0.71}" y1="${cy + r * 0.71}" x2="${cx - (r + len) * 0.71}" y2="${cy + (r + len) * 0.71}"/>` +
      `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="26s" repeatCount="indefinite"/></g>`
    const drop = (x: number, dur: string, begin: string) =>
      `<path d="M${x} 36 L${x - 2} 40 A2 2 0 0 0 ${x + 2} 40 Z" fill="#38bdf8"><animate attributeName="opacity" values="0;1;0" dur="${dur}" begin="${begin}" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0; 0 6" dur="${dur}" begin="${begin}" repeatCount="indefinite"/></path>`
    const flake = (x: number, dx: number, dur: string, begin: string) =>
      `<circle cx="${x}" cy="37" r="2.2" fill="#e2e8f0"><animate attributeName="opacity" values="0;1;0" dur="${dur}" begin="${begin}" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0; ${dx} 6" dur="${dur}" begin="${begin}" repeatCount="indefinite"/></circle>`

    if (c === 0) return `<svg ${S}>${rays(24, 24, 8.5, 5, 3.2)}<circle cx="24" cy="24" r="8.5" fill="#fbbf24"/></svg>`
    if (c === 1 || c === 2) return `<svg ${S}><circle cx="15" cy="12" r="8" fill="#fbbf24"/>${rays(15, 12, 8, 3, 2.4)}<path d="${CLOUD}" fill="#94a3b8"/></svg>`
    if (c === 3) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/></svg>`
    if (c === 45 || c === 48) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/><g stroke="#94a3b8" stroke-width="2.6" stroke-linecap="round"><line x1="14" y1="37" x2="30" y2="37"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" repeatCount="indefinite"/></line><line x1="18" y1="42" x2="34" y2="42"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" begin="0.6s" repeatCount="indefinite"/></line></g></svg>`
    if (c >= 51 && c <= 57) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/>${drop(18, 1.4, "0s")}${drop(24, 1.4, "0.35s")}${drop(30, 1.4, "0.7s")}</svg>`
    if (c >= 61 && c <= 67) return `<svg ${S}><path d="${CLOUD}" fill="#64748b"/>${drop(16, 1.1, "0s")}${drop(22, 1.1, "0.3s")}${drop(28, 1.1, "0.6s")}${drop(34, 1.1, "0.15s")}</svg>`
    if (c >= 71 && c <= 77) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/>${flake(18, -1.5, 2, "0s")}${flake(25, 1.5, 2, "0.5s")}${flake(32, -1, 2, "1s")}</svg>`
    if (c >= 80 && c <= 82) return `<svg ${S}><path d="${CLOUD}" fill="#64748b"/>${drop(16, 1, "0s")}${drop(22, 1, "0.25s")}${drop(28, 1, "0.5s")}${drop(34, 1, "0.75s")}</svg>`
    if (c >= 85 && c <= 86) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/>${flake(18, -1.5, 1.6, "0s")}${flake(25, 1.5, 1.6, "0.4s")}${flake(32, -1, 1.6, "0.8s")}</svg>`
    if (c >= 95) return `<svg ${S}><path d="${CLOUD}" fill="#64748b"/><path d="M26 31 L18 40 H23 L21 47 L32 36 H25 Z" fill="#facc15"><animate attributeName="opacity" values="1;0.2;1" dur="2.6s" repeatCount="indefinite"/></path></svg>`
    return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/></svg>`
  }

  // Small inline symbol icons for the forecast cards (rain, rain chance, wind speed, wind direction)
  const WX_DROPLET = '<svg viewBox="0 0 12 14" width="7" height="8"><path d="M6 0.5 C6 0.5 1.5 6 1.5 9 A4.5 4.5 0 0 0 10.5 9 C10.5 6 6 0.5 6 0.5 Z" fill="#38bdf8"/></svg>'
  const WX_PERCENT = '<svg viewBox="0 0 14 14" width="7" height="7"><line x1="3" y1="11" x2="11" y2="3" stroke="#a78bfa" stroke-width="1.6" stroke-linecap="round"/><circle cx="4" cy="4" r="1.6" fill="#a78bfa"/><circle cx="10" cy="10" r="1.6" fill="#a78bfa"/></svg>'
  const WX_WIND = '<svg viewBox="0 0 24 24" width="13" height="13"><g fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></g></svg>'
  function wxArrow(deg: number): string {
    if (deg == null) return ""
    return `<svg viewBox="0 0 12 12" width="10" height="10"><g transform="rotate(${((deg % 360) + 360) % 360} 6 6)"><path d="M6 1 L9 6.2 H7.2 V11 H4.8 V6.2 H3 Z" fill="#7dd3fc"/></g></svg>`
  }

  function deltaT(temp: number, dew: number): number {
    if (temp == null || dew == null) return NaN
    return temp - dew
  }

  function windDir(deg: number): string {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return dirs[Math.round(((deg % 360) / 45)) % 8] || ""
  }

  // BoM fwo compass ("W", "NE") → degrees; "CALM" → 0
  function compassToDeg(c: string): number {
    const map: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 }
    return map[(c || "").toUpperCase()] ?? 0
  }

  // BoM fwo local_date_time_full "YYYYMMDDHHMMSS" → Date
  function fwoTime(s: string): string | null {
    if (!s || s.length < 14) return null
    const y = +s.slice(0, 4), mo = +s.slice(4, 6) - 1, d = +s.slice(6, 8), h = +s.slice(8, 10), mi = +s.slice(10, 12)
    return new Date(y, mo, d, h, mi).toISOString()
  }

  function sprayStatus(temp: number, dew: number, wind: number, rain: number): { label: string; cls: string; ok: boolean; note: string } {
    if (temp == null || dew == null || wind == null) return { label: "No data", cls: "bg-base-200/30 text-contrast-content/40", ok: false, note: "" }
    const dt = deltaT(temp, dew)
    const ok = dt >= 2 && dt <= 8 && wind >= 3 && wind <= 15 && (rain == null || rain === 0)
    if (ok) return { label: "OK", cls: "bg-success/15 text-success", ok: true, note: "Suitable for spraying: Delta T within the ideal 2–8°C, wind 3–15 km/h and no rain — low drift risk and good droplet coverage expected." }
    const reasons: string[] = []
    const notes: string[] = []
    if (dt < 2) { reasons.push("Delta T low"); notes.push("Delta T is low (<2°C) — droplets hang in the air and a temperature inversion can carry product off-target; consider delaying.") }
    if (dt > 8) { reasons.push("Delta T high"); notes.push("Delta T is high (>8°C) — droplets evaporate before reaching the target, giving poor coverage; spray earlier or later in the day.") }
    if (wind < 3) { reasons.push("too calm"); notes.push("Wind is very light (<3 km/h) — possible inversion; spray may linger and drift unpredictably.") }
    if (wind > 15) { reasons.push("windy"); notes.push("Wind is strong (>15 km/h) — high drift risk to neighbouring paddocks.") }
    if (rain && rain > 0) { reasons.push("rain"); notes.push("Rain present or expected — product may wash off before it dries.") }
    return { label: reasons.slice(0, 2).join(", "), cls: "bg-warning/15 text-warning", ok: false, note: notes.join(" ") }
  }

  // Hourly rows from Open-Meteo (live panel)
  function hourlyRows(data: any): any[] {
    if (!data?.hourly) return []
    const h = data.hourly
    const n = h.time?.length || 0
    const rows: any[] = []
    for (let i = 0; i < n; i++) {
      const temp = h.temperature_2m?.[i]
      const dew = h.dew_point_2m?.[i]
      const wind = h.wind_speed_10m?.[i]
      const rain = h.precipitation?.[i]
      rows.push({
        time: h.time[i],
        temp, dew,
        dt: isNaN(deltaT(temp, dew)) ? null : deltaT(temp, dew),
        wind, gust: h.wind_gusts_10m?.[i],
        windDir: h.wind_direction_10m?.[i],
        rain, cloud: h.cloud_cover?.[i],
        status: sprayStatus(temp, dew, wind, rain),
      })
    }
    return rows
  }

  // ── Historical comparison series ──
  function buildDailySeries(data: Record<string, any>): { tempMax: any[]; tempMin: any[]; rain: any[] } {
    const out = { tempMax: [] as any[], tempMin: [] as any[], rain: [] as any[] }
    if (data["open-meteo"]) {
      const d = data["open-meteo"].daily || {}
      const times: string[] = d.time || []
      out.tempMax.push({ label: "Open-Meteo", color: "#38bdf8", points: times.map((t, i) => ({ x: t.slice(0, 10), y: d.temperature_2m_max?.[i] })) })
      out.tempMin.push({ label: "Open-Meteo", color: "#38bdf8", points: times.map((t, i) => ({ x: t.slice(0, 10), y: d.temperature_2m_min?.[i] })) })
      out.rain.push({ label: "Open-Meteo", color: "#38bdf8", points: times.map((t, i) => ({ x: t.slice(0, 10), y: d.precipitation_sum?.[i] })) })
    }
    if (data["silo"]) {
      const rows = siloRows(data["silo"])
      out.tempMax.push({ label: "SILO", color: "#f59e0b", points: rows.map((r) => ({ x: r.date, y: r.max_temp })) })
      out.tempMin.push({ label: "SILO", color: "#f59e0b", points: rows.map((r) => ({ x: r.date, y: r.min_temp })) })
      out.rain.push({ label: "SILO", color: "#f59e0b", points: rows.map((r) => ({ x: r.date, y: r.daily_rain })) })
    }
    if (data["dpird"]) {
      const rows = dpirdRows(data["dpird"])
      out.tempMax.push({ label: "DPIRD", color: "#22c55e", points: rows.map((r) => ({ x: r.date, y: r.max_temp })) })
      out.tempMin.push({ label: "DPIRD", color: "#22c55e", points: rows.map((r) => ({ x: r.date, y: r.min_temp })) })
      out.rain.push({ label: "DPIRD", color: "#22c55e", points: rows.map((r) => ({ x: r.date, y: r.rain })) })
    }
    if (data["visual-crossing"]) {
      const rows = visualCrossingDays(data["visual-crossing"])
      out.tempMax.push({ label: "Visual Crossing", color: "#a3e635", points: rows.map((r) => ({ x: r.date, y: r.max_temp })) })
      out.tempMin.push({ label: "Visual Crossing", color: "#a3e635", points: rows.map((r) => ({ x: r.date, y: r.min_temp })) })
      out.rain.push({ label: "Visual Crossing", color: "#a3e635", points: rows.map((r) => ({ x: r.date, y: r.rain })) })
    }
    if (data["meteostat"]) {
      const rows = meteostatDays(data["meteostat"])
      out.tempMax.push({ label: "Meteostat", color: "#2dd4bf", points: rows.map((r) => ({ x: r.date, y: r.max_temp })) })
      out.tempMin.push({ label: "Meteostat", color: "#2dd4bf", points: rows.map((r) => ({ x: r.date, y: r.min_temp })) })
      out.rain.push({ label: "Meteostat", color: "#2dd4bf", points: rows.map((r) => ({ x: r.date, y: r.rain })) })
    }
    return out
  }

  // ── Lightweight SVG chart builder (overlays multiple series on a shared date axis) ──
  function buildChart(series: any[], opts: any = {}) {
    const W = opts.width || 560
    const H = opts.height || 190
    const padL = 40, padR = 10, padT = 12, padB = 24
    const dates = [...new Set(series.flatMap((s) => s.points.filter((p: any) => p.y != null).map((p: any) => p.x)))].sort()
    if (dates.length === 0) return null
    let minY = Infinity, maxY = -Infinity
    for (const s of series) for (const p of s.points) {
      if (p.y == null) continue
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    if (!isFinite(minY)) { minY = 0; maxY = 1 }
    const span = maxY - minY || 1
    minY -= span * 0.06
    maxY += span * 0.06
    const plotW = W - padL - padR
    const plotH = H - padT - padB
    const xAt = (d: string) => (dates.length === 1 ? padL + plotW / 2 : padL + (dates.indexOf(d) / (dates.length - 1)) * plotW)
    const yAt = (v: number) => padT + (1 - (v - minY) / (maxY - minY)) * plotH
    const DASHES = ["", "5 3", "1 3", "7 2 2 2"]
    const paths = series.map((s, i) => {
      const pts = s.points.filter((p: any) => p.y != null).map((p: any) => `${xAt(p.x).toFixed(1)},${yAt(p.y).toFixed(1)}`)
      return { d: pts.length ? `M${pts.join(" L")}` : "", color: s.color, label: s.label, dash: DASHES[i % DASHES.length], opacity: 0.85 }
    })
    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const v = minY + (maxY - minY) * (i / 4)
      return { v, y: yAt(v) }
    })
    const step = Math.max(1, Math.ceil(dates.length / 6))
    const xTicks = dates.filter((_, i) => i % step === 0).map((d) => ({ d, x: xAt(d) }))
    return { W, H, padL, padR, padT, padB, paths, yTicks, xTicks }
  }

  // Reactive chart inputs — the $: statement must reference compData directly (Svelte 4
  // only re-runs $: when variables named in the statement change, not state read inside
  // a called function). So buildDailySeries takes compData as an explicit argument.
  $: dailySeries = buildDailySeries(compData)
  $: chartMax = buildChart(dailySeries.tempMax)
  $: chartMin = buildChart(dailySeries.tempMin)
  $: chartRain = buildChart(dailySeries.rain)

  function fmtDay(d: string) {
    return new Date(d + "T12:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })
  }

  // Dash pattern used for a source on the overlay charts (must match buildDailySeries push order)
  const SERIES_ORDER = ["open-meteo", "silo", "dpird", "visual-crossing", "meteostat"]
  const SERIES_DASHES = ["", "5 3", "1 3", "7 2 2 2"]
  function seriesDash(id: string): string {
    const i = SERIES_ORDER.indexOf(id)
    return SERIES_DASHES[i >= 0 ? i % SERIES_DASHES.length : 0]
  }
</script>

<div class="page-header">
  <div class="header-left">
    <Icon icon="solar:cloud-sunny-bold-duotone" width="24" height="24" class="text-blue-400" />
    <div>
      <h1>Weather Explorer</h1>
      <p class="header-subtitle">
        Experimental — compare weather providers, overlay similar datasets, and sanity-check the data
      </p>
    </div>
  </div>
</div>

<!-- Category toggle -->
<div class="grid grid-cols-2 gap-2">
  {#each WEATHER_CATEGORIES as c}
    <button
      class="rounded-xl border p-3 text-left transition-colors {category === c.id ? 'border-primary/60 bg-primary/5' : 'border-base-300 bg-base-200/40 hover:bg-base-200/60'}"
      on:click={() => setCategory(c.id)}
    >
      <div class="flex items-center gap-2 text-sm font-semibold text-contrast-content">
        <Icon icon={c.icon} width="16" height="16" class={category === c.id ? 'text-primary' : 'text-contrast-content/40'} />
        {c.name}
      </div>
      <p class="mt-0.5 text-[10px] leading-snug text-contrast-content/40">{c.desc}</p>
    </button>
  {/each}
</div>

<!-- Source selection: Open-Meteo primary + optional comparison model / station -->
<div class="mt-3 rounded-xl border border-base-300 bg-base-200/40 p-4">
  <div class="flex items-center justify-between mb-2">
    <span class="text-[11px] uppercase font-bold text-contrast-content/40">Sources</span>
    <span class="text-[10px] text-contrast-content/30">Open-Meteo is primary · add a comparison source</span>
  </div>

  <!-- Primary model (locked) -->
  <div class="flex items-center gap-2 text-xs text-contrast-content">
    <span class="w-3 h-3 rounded-sm bg-primary border border-primary flex items-center justify-center" style="color:#fff"><Icon icon="solar:check-bold" width="9" height="9" /></span>
    <span class="font-semibold">Open-Meteo</span>
    <span class="text-[9px] uppercase text-contrast-content/30">primary</span>
    <span class="ml-auto text-[9px] text-contrast-content/30">grid model · always on</span>
  </div>

  <!-- Comparison source dropdown -->
  <div class="mt-3 flex flex-wrap items-center gap-2">
    <span class="text-[10px] text-contrast-content/40">Compare source:</span>
    <select class="select select-sm select-bordered flex-1 min-w-[170px]" bind:value={secondaryModel} on:change={onSecondaryModelChange}>
      <option value="">None</option>
      <option value="visual-crossing">Visual Crossing</option>
      <option value="meteostat">Meteostat</option>
      {#if category === "historical"}
        <option value="silo">SILO (AU gridded, BoM-based)</option>
        <option value="dpird">DPIRD (WA stations)</option>
      {/if}
    </select>
  </div>

  <!-- Use a weather station instead -->
  <div class="mt-3 border-t border-base-300/40 pt-3">
    <button class="btn btn-xs min-h-0 h-6 {stationMode ? 'btn-primary' : 'btn-ghost'}" on:click={toggleStationMode}>
      <Icon icon="solar:map-point-bold" width="11" height="11" />
      {stationMode ? 'Using a weather station' : 'Use a weather station instead'}
    </button>
    {#if stationMode}
      <div class="mt-2.5">
        {#if stationsLoading}
          <div class="text-[10px] text-contrast-content/40">Loading nearby stations…</div>
        {:else if nearbyStations.length === 0}
          <div class="text-[10px] text-contrast-content/40">Pick a field or enter coordinates to find nearby stations.</div>
        {:else}
          <div class="text-[10px] text-contrast-content/40 mb-1.5">Nearest BoM stations:</div>
          <div class="max-h-56 overflow-y-auto space-y-1">
            {#each nearbyStations as st}
              <button
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11px] border transition-colors {selectedStation?.wmo === st.wmo ? 'border-primary/60 bg-primary/5 text-primary' : 'border-base-300 bg-base-100/40 text-contrast-content/70 hover:bg-base-200/60'}"
                on:click={() => selectStation(st)}
              >
                <Icon icon="solar:map-point-bold" width="11" height="11" class="text-contrast-content/30 shrink-0" />
                <span class="font-medium truncate">{st.name}</span>
                <span class="ml-auto text-[9px] text-contrast-content/40 shrink-0">{st.distKm.toFixed(1)} km</span>
              </button>
            {/each}
          </div>
        {/if}
        {#if selectedStation}
          <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-contrast-content/60">
            <span>Using <b class="text-contrast-content">{selectedStation.name}</b> · {selectedStation.distKm.toFixed(1)} km</span>
            <a href={bomFwoLink(selectedStation)} target="_blank" rel="noopener" class="link link-primary">View on BoM FWO ↗</a>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if selectedSources.includes("silo") && category === "historical"}
    <!-- SILO email -->
    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-base-300/40 pt-3">
      <span class="text-[10px] text-contrast-content/40">SILO email (no account needed, just an address):</span>
      <input
        class="input input-sm input-bordered flex-1 min-w-[180px]"
        placeholder="you@email.com"
        bind:value={siloUsername}
        on:change={() => { if (browser) localStorage.setItem("weather-silo-username", siloUsername.trim()) }}
      />
    </div>
  {/if}

  {#if selectedSources.includes("dpird")}
    <!-- DPIRD API key -->
    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-base-300/40 pt-3">
      <span class="text-[10px] text-contrast-content/40">DPIRD API key (free from dpird.wa.gov.au — stored locally):</span>
      <input
        class="input input-sm input-bordered flex-1 min-w-[180px] font-mono"
        type="password"
        placeholder="dpird api key"
        bind:value={dpirdKey}
        on:change={() => { if (browser) localStorage.setItem("weather-dpird-key", dpirdKey.trim()) }}
      />
    </div>
  {/if}

  {#if selectedSources.includes("visual-crossing")}
    <!-- Visual Crossing key -->
    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-base-300/40 pt-3">
      <span class="text-[10px] text-contrast-content/40">Visual Crossing key (free from visualcrossing.com — stored locally):</span>
      <input
        class="input input-sm input-bordered flex-1 min-w-[180px] font-mono"
        type="password"
        placeholder="visual crossing api key"
        bind:value={visualCrossingKey}
        on:change={() => { if (browser) localStorage.setItem("weather-vc-key", visualCrossingKey.trim()) }}
      />
    </div>
  {/if}

  {#if selectedSources.includes("meteostat")}
    <!-- Meteostat RapidAPI key -->
    <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-base-300/40 pt-3">
      <span class="text-[10px] text-contrast-content/40">Meteostat x-rapidapi-key (from rapidapi.com — stored locally):</span>
      <input
        class="input input-sm input-bordered flex-1 min-w-[180px] font-mono"
        type="password"
        placeholder="x-rapidapi-key"
        bind:value={meteostatKey}
        on:change={() => { if (browser) localStorage.setItem("weather-meteostat-key", meteostatKey.trim()) }}
      />
    </div>
  {/if}

  {#if category === "historical"}
    <!-- Range + compare -->
    <div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-base-300/40 pt-3">
      <span class="text-[11px] uppercase font-bold text-contrast-content/40 mr-1">Range</span>
      {#each RANGE_PRESETS as p}
        <button class="btn btn-xs min-h-0 h-6 {activeRange === p.days ? 'btn-primary' : 'btn-ghost'}" on:click={() => applyRangeAndReload(p.days)}>{p.label}</button>
      {/each}
      <span class="text-[10px] text-contrast-content/30 ml-auto">{startDate} → {endDate}</span>
      <button class="btn btn-sm btn-primary ml-2" on:click={fetchCompare} disabled={loading || selectedSources.length === 0}>
        {#if loading}<span class="loading loading-spinner loading-xs"></span>{:else}<Icon icon="solar:refresh-bold" width="14" height="14" />{/if}
        Fetch
      </button>
    </div>
  {/if}
</div>

<!-- Body: field list + data -->
<div class="mt-4 grid lg:grid-cols-[280px_1fr] gap-4 items-start">
  <!-- Field list -->
  <div class="rounded-xl border border-base-300 bg-base-200/40 overflow-hidden lg:sticky lg:top-4">
    <div class="flex items-center justify-between px-3 py-2 border-b border-base-300 bg-base-200/50">
      <span class="text-[11px] uppercase font-bold text-contrast-content/40">Fields</span>
      <span class="text-[10px] text-contrast-content/30">{fields.length}</span>
    </div>
    <div class="max-h-[55vh] overflow-y-auto">
      {#if fieldsLoading}
        <div class="p-3 text-xs text-contrast-content/40">Loading fields…</div>
      {:else if fields.length === 0}
        <div class="p-3 text-xs text-contrast-content/40">No fields with boundaries on this map.</div>
      {:else}
        {#each farms as grp}
          <div class="border-b border-base-300/40 last:border-b-0">
            <div class="flex items-center gap-1 px-3 pt-2 pb-1 text-[9px] uppercase font-bold text-contrast-content/35">
              <Icon icon="solar:folder-bold" width="10" height="10" class="text-contrast-content/30 shrink-0" />
              <span class="truncate">{grp.name}</span>
              <span class="ml-auto text-contrast-content/25 shrink-0">{grp.fields.length}</span>
            </div>
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors {selectedFarmId === grp.id && !selectedFieldId && !useManual ? 'bg-primary/10 text-primary' : 'text-contrast-content/70 hover:bg-base-200/60'}"
              on:click={() => selectFarm(grp.id)}
            >
              <Icon icon="solar:widget-add-bold-duotone" width="13" height="13" class="text-primary/60 shrink-0" />
              <span class="truncate font-medium">Whole {grp.name}</span>
              {#if selectedFarmId === grp.id && !selectedFieldId && !useManual}
                <Icon icon="solar:check-circle-bold" width="14" height="14" class="ml-auto text-success/60 shrink-0" />
              {/if}
            </button>
            {#each grp.fields as f}
              <button
                class="w-full flex items-center gap-2 pl-7 pr-3 py-1.5 text-left text-xs transition-colors {selectedFieldId === f.field_id && !useManual ? 'bg-primary/10 text-primary' : 'text-contrast-content/70 hover:bg-base-200/60'}"
                on:click={() => selectField(f.field_id)}
              >
                <Icon icon="solar:map-point-bold" width="12" height="12" class="text-success/60 shrink-0" />
                <span class="truncate font-medium">{f.name}</span>
                {#if selectedFieldId === f.field_id && !useManual}
                  <Icon icon="solar:check-circle-bold" width="14" height="14" class="ml-auto text-success/60 shrink-0" />
                {/if}
              </button>
            {/each}
          </div>
        {/each}
      {/if}
      <button
        class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors border-t border-base-300/40 {useManual ? 'bg-primary/10 text-primary' : 'text-contrast-content/70 hover:bg-base-200/60'}"
        on:click={selectManual}
      >
        <Icon icon="solar:map-point-linear" width="14" height="14" class="text-contrast-content/40 shrink-0" />
        <span class="font-medium">Manual coordinates</span>
        {#if useManual}<Icon icon="solar:check-circle-bold" width="14" height="14" class="ml-auto text-success/60 shrink-0" />{/if}
      </button>
    </div>
    {#if useManual}
      <div class="flex gap-2 p-3 border-t border-base-300 bg-base-200/50">
        <input class="input input-xs input-bordered w-full" placeholder="Latitude" bind:value={manualLat} on:change={selectManual} />
        <input class="input input-xs input-bordered w-full" placeholder="Longitude" bind:value={manualLng} on:change={selectManual} />
      </div>
    {/if}
  </div>

  <!-- Data column -->
  <div class="min-w-0">
    {#if activeLat != null && activeLng != null}
      <div class="mb-3 text-xs text-contrast-content/40">
        <Icon icon="solar:map-point-bold" width="12" height="12" class="inline -mt-0.5" />
        {activeLat.toFixed(5)}, {activeLng.toFixed(5)}
        {#if useManual}· manual coordinates
        {:else if selectedFarmId}· {farms.find((g) => g.id === selectedFarmId)?.name || ''} (farm centre)
        {:else}· {fields.find((f) => f.field_id === selectedFieldId)?.name || ''} (field centre)
        {/if}
      </div>
    {/if}

    {#if errorMsg}
      <div class="text-error text-xs">{errorMsg}</div>
    {/if}

    <!-- ═══ WEATHER FORECAST (ECMWF) ═══ -->
    {#if forecastData}
      {@const fdays = forecastDays(forecastData)}
      {@const fcur = forecastData.current || {}}
      {#if fdays.length > 0}
        <div class="mb-3 rounded-xl border border-base-300 bg-base-200/30 overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-base-300 bg-base-200/50">
            <span class="flex items-center gap-1.5 text-xs font-bold uppercase text-contrast-content/50">
              <Icon icon="solar:cloud-sunny-bold-duotone" width="13" height="13" class="text-primary" />
              Weather Forecast
            </span>
            <span class="text-[10px] text-contrast-content/40">
              ECMWF{fcur.temperature_2m != null ? ` · now ${Math.round(fcur.temperature_2m)}°${fcur.weather_code != null ? " " + wmoDesc(fcur.weather_code) : ""}` : ""}
            </span>
          </div>
          <div class="flex gap-2 overflow-x-auto p-3">
            {#each fdays as d, i}
              {@const isToday = i === 0}
              <div class="min-w-[128px] shrink-0 rounded-xl border p-2.5 text-center {isToday ? 'border-primary/50 bg-primary/5' : 'border-base-300 bg-base-100/40'}">
                <div class="text-[10px] uppercase font-bold {isToday ? 'text-primary' : 'text-contrast-content/45'}">{dayLabel(d.date, i)}</div>
                <div class="my-1 flex justify-center">{@html forecastIcon(d.code)}</div>
                <div class="text-sm font-bold text-contrast-content leading-none">{d.max != null ? Math.round(d.max) + '°' : '-'}<span class="text-[10px] font-medium text-contrast-content/40"> / {d.min != null ? Math.round(d.min) + '°' : '-'}</span></div>
                <div class="mt-1 text-[9px] leading-tight text-contrast-content/55 min-h-[12px]">{wmoDesc(d.code)}</div>
                <div class="mt-1 flex items-center justify-center gap-1 text-[9px] text-contrast-content/60">
                  <span class="flex items-center gap-0.5">{@html WX_DROPLET}{d.rain != null ? d.rain.toFixed(1) + 'mm' : '-'}</span>
                  <span class="opacity-40">·</span>
                  <span class="flex items-center gap-0.5">{@html WX_PERCENT}{d.prob != null ? d.prob : '-'}</span>
                </div>
                <div class="mt-1 flex items-center justify-center gap-1 text-[9px] text-contrast-content/60">
                  <span class="flex items-center gap-0.5">{@html WX_WIND}{d.wind != null ? Math.round(d.wind) : '-'} km/h</span>
                  <span class="flex items-center gap-0.5">{@html wxArrow(d.windDir)}{d.windDir != null ? windDir(d.windDir) : ''}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <!-- ═══ LIVE PANEL ═══ -->
    {#if category === "live"}
      {@const liveIds = selectedSources.filter((id) => liveData[id])}
      {#if liveIds.length > 0}
        <!-- Current conditions per source -->
        <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {#each liveIds as id}
            {@const n = normalizeLive(id, liveData[id])}
            {@const cst = sprayStatus(n.temp, n.dew, n.wind, n.rain)}
            <div class="rounded-xl border border-base-300 bg-base-200/30 overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 border-b border-base-300 bg-base-200/50">
                <span class="flex items-center gap-1.5 text-xs font-bold text-contrast-content">
                  <span class="w-2 h-2 rounded-full" style="background:{n.color}"></span>
                  {n.source}
                </span>
                <span class="text-[9px] text-contrast-content/30">{n.time ? new Date(n.time).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              {#if n.stationLabel}
                <div class="px-3 py-1.5 bg-base-100/30 border-b border-base-300/40 text-[10px] text-contrast-content/50 flex items-center gap-1">
                  <Icon icon="solar:map-point-bold" width="10" height="10" class="text-contrast-content/30 shrink-0" />
                  <span class="truncate">{n.stationLabel}</span>
                </div>
              {/if}
              <div class="grid grid-cols-3 gap-px bg-base-300/30">
                <div class="p-2.5 text-center bg-base-100/40">
                  <div class="text-[8px] uppercase font-bold text-contrast-content/35">Temp</div>
                  <div class="text-base font-bold text-contrast-content">{n.temp != null ? Math.round(n.temp) + '°' : '-'}</div>
                  <div class="text-[9px] text-contrast-content/40"></div>
                </div>
                <div class="p-2.5 text-center bg-base-100/40">
                  <div class="text-[8px] uppercase font-bold text-contrast-content/35">Delta T</div>
                  <div class="text-base font-bold text-contrast-content">{n.dt != null && !isNaN(n.dt) ? n.dt.toFixed(1) + '°' : '-'}</div>
                  <div class="text-[9px] text-contrast-content/40">{n.dew != null ? 'dew ' + Math.round(n.dew) + '°' : ''}</div>
                </div>
                <div class="p-2.5 text-center bg-base-100/40">
                  <div class="text-[8px] uppercase font-bold text-contrast-content/35">Wind</div>
                  <div class="text-base font-bold text-contrast-content">{n.wind != null ? Math.round(n.wind) + '' : '-'}{n.windDir != null ? ' ' + windDir(n.windDir) : ''}</div>
                  <div class="text-[9px] text-contrast-content/40">km/h</div>
                </div>
                <div class="p-2.5 text-center bg-base-100/40">
                  <div class="text-[8px] uppercase font-bold text-contrast-content/35">Rain</div>
                  <div class="text-base font-bold text-contrast-content">{n.rain != null ? n.rain + '' : '-'}</div>
                  <div class="text-[9px] text-contrast-content/40">mm{n.cloud != null ? ' · ' + n.cloud + '%' : ''}</div>
                </div>
                <div class="p-2.5 text-center bg-base-100/40">
                  <div class="text-[8px] uppercase font-bold text-contrast-content/35">Humidity</div>
                  <div class="text-base font-bold text-contrast-content">{n.humidity != null ? Math.round(n.humidity) + '%' : '-'}</div>
                  <div class="text-[9px] text-contrast-content/40">{n.pressure != null ? Math.round(n.pressure) + ' hPa' : ''}</div>
                </div>
                <div class="p-2.5 text-center bg-base-100/40">
                  <div class="text-[8px] uppercase font-bold text-contrast-content/35">Soil</div>
                  <div class="text-base font-bold text-contrast-content">{n.soil != null ? Math.round(n.soil * 100) + '%' : '-'}</div>
                  <div class="text-[9px] text-contrast-content/40">0–10 cm</div>
                </div>
              </div>
              {#if n.desc}
                <div class="flex items-start gap-1.5 px-3 py-2 border-t border-base-300/40 bg-base-100/30">
                  <Icon icon="solar:cloud-sunny-bold-duotone" width="12" height="12" class="text-contrast-content/30 shrink-0 mt-0.5" />
                  <div class="min-w-0">
                    <div class="text-[8px] uppercase font-bold text-contrast-content/35">Conditions</div>
                    <div class="text-[10px] text-contrast-content/70 leading-snug">{n.desc}</div>
                  </div>
                </div>
              {/if}
              {#if cst.note}
                <div class="flex items-start gap-1.5 px-3 py-2 border-t border-base-300/40 bg-base-100/30">
                  <Icon icon="solar:droplet-bold" width="12" height="12" class="shrink-0 mt-0.5 {cst.ok ? 'text-success' : 'text-warning'}" />
                  <div class="min-w-0">
                    <div class="text-[8px] uppercase font-bold {cst.ok ? 'text-success' : 'text-warning'}">Spraying · {cst.label}</div>
                    <div class="text-[10px] text-contrast-content/70 leading-snug">{cst.note}</div>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Hourly forecast chart (Open-Meteo only — it's the sole source with a forecast) -->
        {#if liveData["open-meteo"]}
          {@const hrows = hourlyRows(liveData["open-meteo"])}
          {@const tempSeries = [{ label: "Open-Meteo", color: "#38bdf8", points: hrows.map((r) => ({ x: r.time, y: r.temp })) }]}
          {@const dtSeries = [{ label: "Open-Meteo", color: "#f59e0b", points: hrows.map((r) => ({ x: r.time, y: r.dt })) }]}
          {@const hchart = buildChart(tempSeries)}
          {@const dtchart = buildChart(dtSeries)}
          <div class="mt-3 rounded-xl border border-base-300 bg-base-200/30 p-3">
            <div class="text-[11px] uppercase font-bold text-contrast-content/40 mb-2">Hourly Forecast</div>
            <div class="flex flex-wrap gap-3 text-[10px] text-contrast-content/60 mb-2">
              <span class="flex items-center gap-1.5"><span class="w-3 h-0.5 rounded" style="background:#38bdf8"></span>Temp (°C)</span>
              <span class="flex items-center gap-1.5"><span class="w-3 h-0.5 rounded" style="background:#f59e0b"></span>Delta T (°C)</span>
            </div>
            <div class="grid lg:grid-cols-2 gap-3">
              {#if hchart}
                <svg viewBox="0 0 {hchart.W} {hchart.H}" class="w-full h-auto text-contrast-content">
                  {#each hchart.yTicks as t}<line x1={hchart.padL} x2={hchart.W - hchart.padR} y1={t.y} y2={t.y} stroke="currentColor" stroke-opacity="0.08" /><text x={hchart.padL - 6} y={t.y + 3} text-anchor="end" font-size="9" fill="currentColor" fill-opacity="0.4">{Math.round(t.v)}</text>{/each}
                  {#each hchart.xTicks as t}<text x={t.x} y={hchart.H - 8} text-anchor="middle" font-size="9" fill="currentColor" fill-opacity="0.4">{fmtDay(t.d.slice(0,10))} {t.d.slice(11,16)}</text>{/each}
                  {#each hchart.paths as p}{#if p.d}<path d={p.d} fill="none" stroke={p.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />{/if}{/each}
                </svg>
              {/if}
              {#if dtchart}
                <svg viewBox="0 0 {dtchart.W} {dtchart.H}" class="w-full h-auto text-contrast-content">
                  {#each dtchart.yTicks as t}<line x1={dtchart.padL} x2={dtchart.W - dtchart.padR} y1={t.y} y2={t.y} stroke="currentColor" stroke-opacity="0.08" /><text x={dtchart.padL - 6} y={t.y + 3} text-anchor="end" font-size="9" fill="currentColor" fill-opacity="0.4">{Math.round(t.v)}</text>{/each}
                  {#each dtchart.xTicks as t}<text x={t.x} y={dtchart.H - 8} text-anchor="middle" font-size="9" fill="currentColor" fill-opacity="0.4">{fmtDay(t.d.slice(0,10))} {t.d.slice(11,16)}</text>{/each}
                  {#each dtchart.paths as p}{#if p.d}<path d={p.d} fill="none" stroke={p.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />{/if}{/each}
                </svg>
              {/if}
            </div>
          </div>
        {/if}
      {:else if loading}
        <div class="text-xs text-contrast-content/40 text-center py-6"><span class="loading loading-spinner loading-sm"></span> Fetching live weather…</div>
      {:else}
        <div class="mt-6 text-center py-8 text-contrast-content/30">
          <Icon icon="solar:bolt-bold" width="32" height="32" class="opacity-30 mx-auto mb-2" />
          <p class="text-sm">Pick a field to load current conditions from your selected sources.</p>
        </div>
      {/if}
    {/if}

    <!-- ═══ HISTORICAL PANEL ═══ -->
    {#if category === "historical"}
      {@const hasComp = Object.keys(compData).length > 0}
      {#if hasComp}
        <div class="rounded-xl border border-base-300 bg-base-200/30 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-base-300 bg-base-200/50">
            <span class="text-xs font-bold uppercase text-contrast-content/50">Historical Comparison</span>
            <span class="text-[10px] text-contrast-content/30">{startDate} → {endDate} · {selectedSources.length} source{selectedSources.length !== 1 ? 's' : ''}</span>
          </div>

          <!-- Legend -->
          <div class="flex flex-wrap gap-3 px-4 py-2 text-[10px] text-contrast-content/60">
            {#each selectedSources as id}
              {@const s = sourceInfo(id)}
              <span class="flex items-center gap-1.5">
                <svg width="18" height="5"><line x1="0" y1="2.5" x2="18" y2="2.5" stroke="{s.color}" stroke-width="2" stroke-dasharray={seriesDash(id)} /></svg>
                {s.name}
              </span>
            {/each}
          </div>

          <!-- Overlay charts -->
          <div class="space-y-3 p-3">
            <div>
              <div class="text-[10px] uppercase font-bold text-contrast-content/35 mb-1">Max temperature (°C) — overlaid</div>
              {#if chartMax}
                <svg viewBox="0 0 {chartMax.W} {chartMax.H}" class="w-full h-auto text-contrast-content">
                  {#each chartMax.yTicks as t}<line x1={chartMax.padL} x2={chartMax.W - chartMax.padR} y1={t.y} y2={t.y} stroke="currentColor" stroke-opacity="0.08" /><text x={chartMax.padL - 6} y={t.y + 3} text-anchor="end" font-size="9" fill="currentColor" fill-opacity="0.4">{Math.round(t.v)}</text>{/each}
                  {#each chartMax.xTicks as t}<text x={t.x} y={chartMax.H - 8} text-anchor="middle" font-size="9" fill="currentColor" fill-opacity="0.4">{fmtDay(t.d)}</text>{/each}
                  {#each chartMax.paths as p}{#if p.d}<path d={p.d} fill="none" stroke={p.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={p.dash} stroke-opacity={p.opacity} />{/if}{/each}
                </svg>
              {/if}
            </div>
            <div>
              <div class="text-[10px] uppercase font-bold text-contrast-content/35 mb-1">Min temperature (°C) — overlaid</div>
              {#if chartMin}
                <svg viewBox="0 0 {chartMin.W} {chartMin.H}" class="w-full h-auto text-contrast-content">
                  {#each chartMin.yTicks as t}<line x1={chartMin.padL} x2={chartMin.W - chartMin.padR} y1={t.y} y2={t.y} stroke="currentColor" stroke-opacity="0.08" /><text x={chartMin.padL - 6} y={t.y + 3} text-anchor="end" font-size="9" fill="currentColor" fill-opacity="0.4">{Math.round(t.v)}</text>{/each}
                  {#each chartMin.xTicks as t}<text x={t.x} y={chartMin.H - 8} text-anchor="middle" font-size="9" fill="currentColor" fill-opacity="0.4">{fmtDay(t.d)}</text>{/each}
                  {#each chartMin.paths as p}{#if p.d}<path d={p.d} fill="none" stroke={p.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={p.dash} stroke-opacity={p.opacity} />{/if}{/each}
                </svg>
              {/if}
            </div>
            <div>
              <div class="text-[10px] uppercase font-bold text-contrast-content/35 mb-1">Rainfall (mm/day) — overlaid</div>
              {#if chartRain}
                <svg viewBox="0 0 {chartRain.W} {chartRain.H}" class="w-full h-auto text-contrast-content">
                  {#each chartRain.yTicks as t}<line x1={chartRain.padL} x2={chartRain.W - chartRain.padR} y1={t.y} y2={t.y} stroke="currentColor" stroke-opacity="0.08" /><text x={chartRain.padL - 6} y={t.y + 3} text-anchor="end" font-size="9" fill="currentColor" fill-opacity="0.4">{Math.round(t.v)}</text>{/each}
                  {#each chartRain.xTicks as t}<text x={t.x} y={chartRain.H - 8} text-anchor="middle" font-size="9" fill="currentColor" fill-opacity="0.4">{fmtDay(t.d)}</text>{/each}
                  {#each chartRain.paths as p}{#if p.d}<path d={p.d} fill="none" stroke={p.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={p.dash} stroke-opacity={p.opacity} />{/if}{/each}
                </svg>
              {/if}
            </div>
          </div>

          <!-- Source detail tables -->
          {#if compData["silo"]}
            {@const srows = siloRows(compData["silo"])}
            {@const ssum = srows.length ? {
              n: srows.length,
              rain: srows.reduce((a, r) => a + (r.daily_rain || 0), 0),
              max: srows.reduce((a, r) => a + (r.max_temp || 0), 0) / srows.length,
              min: srows.reduce((a, r) => a + (r.min_temp || 0), 0) / srows.length,
              rad: srows.reduce((a, r) => a + (r.radiation || 0), 0) / srows.length,
              evap: srows.reduce((a, r) => a + (r.evap_pan || 0), 0),
            } : null}
            <details class="border-t border-base-300">
              <summary class="cursor-pointer px-4 py-2.5 text-[11px] font-bold uppercase text-contrast-content/40 hover:text-contrast-content/60">SILO Daily Data</summary>
              {#if ssum}
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-px bg-base-300/30">
                  <div class="p-3 text-center bg-base-100/40"><div class="text-[9px] uppercase font-bold text-contrast-content/35">Rain total</div><div class="text-base font-bold text-contrast-content">{ssum.rain.toFixed(1)} mm</div></div>
                  <div class="p-3 text-center bg-base-100/40"><div class="text-[9px] uppercase font-bold text-contrast-content/35">Mean max</div><div class="text-base font-bold text-contrast-content">{ssum.max.toFixed(1)}°C</div></div>
                  <div class="p-3 text-center bg-base-100/40"><div class="text-[9px] uppercase font-bold text-contrast-content/35">Mean min</div><div class="text-base font-bold text-contrast-content">{ssum.min.toFixed(1)}°C</div></div>
                  <div class="p-3 text-center bg-base-100/40"><div class="text-[9px] uppercase font-bold text-contrast-content/35">Radiation</div><div class="text-base font-bold text-contrast-content">{ssum.rad.toFixed(1)} MJ/m²</div></div>
                  <div class="p-3 text-center bg-base-100/40"><div class="text-[9px] uppercase font-bold text-contrast-content/35">Evap total</div><div class="text-base font-bold text-contrast-content">{ssum.evap.toFixed(1)} mm</div></div>
                </div>
              {/if}
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-contrast-content">
                  <thead><tr class="text-[10px] uppercase text-contrast-content/35">
                    <th class="text-left px-3 py-2">Date</th><th class="text-left px-2 py-2">Rain</th><th class="text-left px-2 py-2">Max</th>
                    <th class="text-left px-2 py-2">Min</th><th class="text-left px-2 py-2">RH max</th><th class="text-left px-2 py-2">RH min</th>
                    <th class="text-left px-2 py-2">Rad</th><th class="text-left px-2 py-2">Evap</th><th class="text-left px-2 py-2">MSLP</th>
                  </tr></thead>
                  <tbody>
                    {#each srows as d}
                      <tr class="border-t border-base-300/20">
                        <td class="px-3 py-1.5 font-medium">{fmtDay(d.date)}</td>
                        <td class="px-2 py-1.5">{d.daily_rain != null ? d.daily_rain.toFixed(1) : '-'} mm</td>
                        <td class="px-2 py-1.5">{d.max_temp != null ? d.max_temp.toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{d.min_temp != null ? d.min_temp.toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5 text-contrast-content/60">{d.rh_tmax != null ? Math.round(d.rh_tmax) + '%' : '-'}</td>
                        <td class="px-2 py-1.5 text-contrast-content/60">{d.rh_tmin != null ? Math.round(d.rh_tmin) + '%' : '-'}</td>
                        <td class="px-2 py-1.5">{d.radiation != null ? d.radiation.toFixed(1) : '-'}</td>
                        <td class="px-2 py-1.5">{d.evap_pan != null ? d.evap_pan.toFixed(1) : '-'} mm</td>
                        <td class="px-2 py-1.5 text-contrast-content/60">{d.mslp != null ? Math.round(d.mslp) : '-'} hPa</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </details>
          {/if}

          {#if compData["open-meteo"]}
            <details class="border-t border-base-300">
              <summary class="cursor-pointer px-4 py-2.5 text-[11px] font-bold uppercase text-contrast-content/40 hover:text-contrast-content/60">Open-Meteo Daily Data</summary>
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-contrast-content">
                  <thead><tr class="text-[10px] uppercase text-contrast-content/35">
                    <th class="text-left px-3 py-2">Date</th><th class="text-left px-2 py-2">Max</th><th class="text-left px-2 py-2">Min</th>
                    <th class="text-left px-2 py-2">Rain</th><th class="text-left px-2 py-2">Rad</th><th class="text-left px-2 py-2">Max wind</th>
                  </tr></thead>
                  <tbody>
                    {#each (compData["open-meteo"].daily?.time || []) as t, i}
                      <tr class="border-t border-base-300/20">
                        <td class="px-3 py-1.5 font-medium">{fmtDay(t.slice(0, 10))}</td>
                        <td class="px-2 py-1.5">{compData["open-meteo"].daily.temperature_2m_max?.[i] != null ? compData["open-meteo"].daily.temperature_2m_max[i].toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{compData["open-meteo"].daily.temperature_2m_min?.[i] != null ? compData["open-meteo"].daily.temperature_2m_min[i].toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{compData["open-meteo"].daily.precipitation_sum?.[i] != null ? compData["open-meteo"].daily.precipitation_sum[i].toFixed(1) + ' mm' : '-'}</td>
                        <td class="px-2 py-1.5">{compData["open-meteo"].daily.shortwave_radiation_sum?.[i] != null ? compData["open-meteo"].daily.shortwave_radiation_sum[i].toFixed(0) : '-'}</td>
                        <td class="px-2 py-1.5 text-contrast-content/60">{compData["open-meteo"].daily.wind_speed_10m_max?.[i] != null ? Math.round(compData["open-meteo"].daily.wind_speed_10m_max[i]) + ' km/h' : '-'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </details>
          {/if}

          {#if compData["dpird"]}
            {@const drows = dpirdRows(compData["dpird"])}
            <details class="border-t border-base-300">
              <summary class="cursor-pointer px-4 py-2.5 text-[11px] font-bold uppercase text-contrast-content/40 hover:text-contrast-content/60">DPIRD Daily Data (station {compData["dpird"].code || ''})</summary>
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-contrast-content">
                  <thead><tr class="text-[10px] uppercase text-contrast-content/35">
                    <th class="text-left px-3 py-2">Date</th><th class="text-left px-2 py-2">Max</th><th class="text-left px-2 py-2">Min</th><th class="text-left px-2 py-2">Rain</th>
                  </tr></thead>
                  <tbody>
                    {#each drows as d}
                      <tr class="border-t border-base-300/20">
                        <td class="px-3 py-1.5 font-medium">{fmtDay(d.date)}</td>
                        <td class="px-2 py-1.5">{d.max_temp != null ? d.max_temp.toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{d.min_temp != null ? d.min_temp.toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{d.rain != null ? d.rain.toFixed(1) + ' mm' : '-'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </details>
          {/if}

          {#if compData["visual-crossing"]}
            {@const vrows = visualCrossingDays(compData["visual-crossing"])}
            <details class="border-t border-base-300">
              <summary class="cursor-pointer px-4 py-2.5 text-[11px] font-bold uppercase text-contrast-content/40 hover:text-contrast-content/60">Visual Crossing Daily Data</summary>
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-contrast-content">
                  <thead><tr class="text-[10px] uppercase text-contrast-content/35">
                    <th class="text-left px-3 py-2">Date</th><th class="text-left px-2 py-2">Max</th><th class="text-left px-2 py-2">Min</th><th class="text-left px-2 py-2">Rain</th>
                  </tr></thead>
                  <tbody>
                    {#each vrows as d}
                      <tr class="border-t border-base-300/20">
                        <td class="px-3 py-1.5 font-medium">{fmtDay(d.date)}</td>
                        <td class="px-2 py-1.5">{d.max_temp != null ? d.max_temp.toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{d.min_temp != null ? d.min_temp.toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{d.rain != null ? d.rain.toFixed(1) + ' mm' : '-'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </details>
          {/if}

          {#if compData["meteostat"]}
            {@const mrows = meteostatDays(compData["meteostat"])}
            <details class="border-t border-base-300">
              <summary class="cursor-pointer px-4 py-2.5 text-[11px] font-bold uppercase text-contrast-content/40 hover:text-contrast-content/60">Meteostat Daily Data</summary>
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-contrast-content">
                  <thead><tr class="text-[10px] uppercase text-contrast-content/35">
                    <th class="text-left px-3 py-2">Date</th><th class="text-left px-2 py-2">Max</th><th class="text-left px-2 py-2">Min</th><th class="text-left px-2 py-2">Rain</th>
                  </tr></thead>
                  <tbody>
                    {#each mrows as d}
                      <tr class="border-t border-base-300/20">
                        <td class="px-3 py-1.5 font-medium">{fmtDay(d.date)}</td>
                        <td class="px-2 py-1.5">{d.max_temp != null ? d.max_temp.toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{d.min_temp != null ? d.min_temp.toFixed(1) + '°' : '-'}</td>
                        <td class="px-2 py-1.5">{d.rain != null ? d.rain.toFixed(1) + ' mm' : '-'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </details>
          {/if}
        </div>
      {:else if loading}
        <div class="text-xs text-contrast-content/40 text-center py-6"><span class="loading loading-spinner loading-sm"></span> Fetching historical data…</div>
      {:else}
        <div class="mt-6 text-center py-8 text-contrast-content/30">
          <Icon icon="solar:calendar-mark-bold" width="32" height="32" class="opacity-30 mx-auto mb-2" />
          <p class="text-sm">Select sources above and pick a field to overlay &amp; compare historical datasets.</p>
        </div>
      {/if}
    {/if}

    <!-- Request log -->
    <details class="mt-4 rounded-xl border border-base-300 bg-base-200/30 overflow-hidden" open={false}>
      <summary class="flex items-center gap-2 cursor-pointer px-4 py-2.5 text-[11px] font-bold uppercase text-contrast-content/40 hover:text-contrast-content/60">
        <Icon icon="solar:document-text-bold" width="13" height="13" />
        API Request Log ({requestLogs.length})
        {#if requestLogs.length > 0}
          <div class="flex items-center gap-1 ml-auto" on:click|stopPropagation>
            <button class="btn btn-xs btn-ghost normal-case text-[10px]" on:click={() => { selectedLogs = requestLogs.map((_, i) => i) }}>Select all</button>
            <button class="btn btn-xs btn-ghost normal-case text-[10px] flex items-center gap-1" on:click={copyLogs}>
              <Icon icon="solar:copy-bold" width="11" height="11" />
              Copy {selectedLogs.length ? selectedLogs.length + ' ' : ''}JSON
            </button>
            <button class="btn btn-xs btn-ghost normal-case text-[10px]" on:click={clearLogs}>Clear</button>
          </div>
        {/if}
      </summary>
      {#if requestLogs.length === 0}
        <div class="px-4 py-3 text-xs text-contrast-content/30">No requests yet — pick a field to load data.</div>
      {:else}
        <div class="space-y-2 p-3">
          {#each requestLogs as log, i}
            <div class="rounded-lg border border-base-300 bg-base-100/40 overflow-hidden">
              <div class="flex flex-wrap items-center gap-2 px-3 py-1.5 text-[10px]">
                <input type="checkbox" class="checkbox checkbox-xs" checked={selectedLogs.includes(i)} on:change={() => toggleSelectLog(i)} title="Select for bulk copy" />
                <span class="font-bold text-contrast-content">{log.label}</span>
                <span class="text-contrast-content/35">{log.time}</span>
                <span class="px-1.5 rounded text-[9px] font-bold {log.status >= 200 && log.status < 300 ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}">{log.status}</span>
                <button class="btn btn-xs btn-ghost ml-auto normal-case text-[10px]" on:click={() => toggleLog(i)}>
                  {expandedLog === i ? 'Hide' : 'Show'} JSON
                </button>
              </div>
              <div class="px-3 pb-1 text-[10px] text-contrast-content/35 font-mono truncate">{log.url}</div>
              {#if expandedLog === i}
                <pre class="mx-3 mb-2 p-2 rounded bg-base-200/50 text-[10px] text-contrast-content/60 overflow-x-auto max-h-60">{JSON.stringify(log.body, null, 2)}</pre>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </details>
  </div>
</div>

<style>
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    gap: 16px;
    flex-wrap: wrap;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    color: oklch(var(--contrast-content));
  }
  .header-subtitle {
    font-size: 12px;
    opacity: 0.6;
    margin: 2px 0 0;
    color: oklch(var(--contrast-content));
  }
</style>
