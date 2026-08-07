// src/lib/utils/weather.ts
// Shared weather helpers for the map toolbox Weather panel (and reused by the
// integrations weather explorer). Primary source: Open-Meteo (free, no key,
// CORS-enabled) — current conditions + ECMWF 7-day forecast.
import { supabase } from "$lib/supabaseClient"
import { userSettingsApi } from "$lib/api/userSettingsApi"

export interface Loc {
  lat: number
  lng: number
}

/** Fetch wrapper that throws a readable error on non-2xx. */
export async function fetchWithLog(
  label: string,
  url: string,
  opts?: RequestInit,
): Promise<Response> {
  const r = await fetch(url, opts)
  if (!r.ok) {
    throw new Error(`${label} ${r.status}`)
  }
  return r
}

// ── Open-Meteo: live current + short hourly ────────────────────────────────
export async function fetchOpenMeteoCurrent(loc: Loc) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
    `&current=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,soil_moisture_0_to_10cm` +
    `&hourly=temperature_2m,dew_point_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code` +
    `&forecast_days=2&timezone=auto`
  const r = await fetchWithLog("Open-Meteo current", url)
  return r.json()
}

// ── ECMWF 7-day forecast (Open-Meteo forecast API, ECMWF IFS model) ────────
export async function fetchForecast(loc: Loc) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset` +
    `&forecast_days=8&models=ecmwf_ifs025&timezone=auto`
  const r = await fetchWithLog("ECMWF forecast", url)
  return r.json()
}

/** Open-Meteo forecast response → array of daily forecast rows. */
export function forecastDays(j: any): any[] {
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

// ── Helpers ────────────────────────────────────────────────────────────────
export function wmoDesc(code: number): string {
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

export function deltaT(temp: number, dew: number): number {
  if (temp == null || dew == null) return NaN
  return temp - dew
}

export function windDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  return dirs[Math.round(((deg % 360) / 45)) % 8] || ""
}

export function sprayStatus(
  temp: number | null | undefined,
  dew: number | null | undefined,
  wind: number | null | undefined,
  rain: number | null | undefined,
): { label: string; ok: boolean; reasons: string[] } {
  if (temp == null || dew == null || wind == null) {
    return { label: "No data", ok: false, reasons: [] }
  }
  const dt = deltaT(temp, dew)
  const ok =
    dt >= 2 && dt <= 8 && wind >= 3 && wind <= 15 && (rain == null || rain === 0)
  const reasons: string[] = []
  if (dt < 2) reasons.push("Delta T low")
  if (dt > 8) reasons.push("Delta T high")
  if (wind < 3) reasons.push("too calm")
  if (wind > 15) reasons.push("windy")
  if (rain && rain > 0) reasons.push("rain")
  return {
    label: ok ? "OK" : (reasons.length ? reasons.slice(0, 2).join(", ") : "No data"),
    ok,
    reasons,
  }
}

// ── Inline SVG icons ───────────────────────────────────────────────────────
// Animated SVG weather icon (SMIL animations — self-contained, no CSS needed).
export function forecastIcon(code: number | null | undefined): string {
  const c = code ?? 3
  const S = 'width="44" height="44" viewBox="0 0 48 48"'
  const CLOUD =
    "M13.5 31.5 C9 31.5 6 28 6 24 C6 20 9 17 13 16.5 C14.5 12.5 18.5 10 23 10 C28 10 32.5 13.5 33.5 18 C37.5 18.5 41 21.5 41 26 C41 30 37.5 31.5 34 31.5 Z"
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
  if (c === 3) {
    // Overcast cloud: gentle float + a breathing scale pulse (scaled around
    // the cloud's centre so it doesn't drift off to the side).
    const cx = 23.5
    const cy = 20.75
    return `<svg ${S}><g><animateTransform attributeName="transform" type="translate" values="0 0; 0 1.6; 0 0" dur="3.2s" repeatCount="indefinite"/><g transform="translate(${cx} ${cy})"><g><animateTransform attributeName="transform" type="scale" values="1 1; 1.07 1.07; 1 1" dur="3.2s" repeatCount="indefinite"/><path d="${CLOUD}" transform="translate(-${cx} -${cy})" fill="#94a3b8"/></g></g></g></svg>`
  }
  if (c === 45 || c === 48) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/><g stroke="#94a3b8" stroke-width="2.6" stroke-linecap="round"><line x1="14" y1="37" x2="30" y2="37"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" repeatCount="indefinite"/></line><line x1="18" y1="42" x2="34" y2="42"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.4s" begin="0.6s" repeatCount="indefinite"/></line></g></svg>`
  if (c >= 51 && c <= 57) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/>${drop(18, 1.4, "0s")}${drop(24, 1.4, "0.35s")}${drop(30, 1.4, "0.7s")}</svg>`
  if (c >= 61 && c <= 67) return `<svg ${S}><path d="${CLOUD}" fill="#64748b"/>${drop(16, 1.1, "0s")}${drop(22, 1.1, "0.3s")}${drop(28, 1.1, "0.6s")}${drop(34, 1.1, "0.15s")}</svg>`
  if (c >= 71 && c <= 77) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/>${flake(18, -1.5, 2, "0s")}${flake(25, 1.5, 2, "0.5s")}${flake(32, -1, 2, "1s")}</svg>`
  if (c >= 80 && c <= 82) return `<svg ${S}><path d="${CLOUD}" fill="#64748b"/>${drop(16, 1, "0s")}${drop(22, 1, "0.25s")}${drop(28, 1, "0.5s")}${drop(34, 1, "0.75s")}</svg>`
  if (c >= 85 && c <= 86) return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/>${flake(18, -1.5, 1.6, "0s")}${flake(25, 1.5, 1.6, "0.4s")}${flake(32, -1, 1.6, "0.8s")}</svg>`
  if (c >= 95) return `<svg ${S}><path d="${CLOUD}" fill="#64748b"/><path d="M26 31 L18 40 H23 L21 47 L32 36 H25 Z" fill="#facc15"><animate attributeName="opacity" values="1;0.2;1" dur="2.6s" repeatCount="indefinite"/></path></svg>`
  return `<svg ${S}><path d="${CLOUD}" fill="#94a3b8"/></svg>`
}

export const WX_DROPLET =
  '<svg viewBox="0 0 12 14" width="7" height="8"><path d="M6 0.5 C6 0.5 1.5 6 1.5 9 A4.5 4.5 0 0 0 10.5 9 C10.5 6 6 0.5 6 0.5 Z" fill="#38bdf8"/></svg>'
export const WX_PERCENT =
  '<svg viewBox="0 0 14 14" width="7" height="7"><line x1="3" y1="11" x2="11" y2="3" stroke="#a78bfa" stroke-width="1.6" stroke-linecap="round"/><circle cx="4" cy="4" r="1.6" fill="#a78bfa"/><circle cx="10" cy="10" r="1.6" fill="#a78bfa"/></svg>'
export const WX_WIND =
  '<svg viewBox="0 0 24 24" width="13" height="13"><g fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></g></svg>'

export function wxArrow(deg: number): string {
  if (deg == null) return ""
  return `<svg viewBox="0 0 12 12" width="10" height="10"><g transform="rotate(${((deg % 360) + 360) % 360} 6 6)"><path d="M6 1 L9 6.2 H7.2 V11 H4.8 V6.2 H3 Z" fill="#7dd3fc"/></g></svg>`
}

// ── Fields / farms (for location resolution) ──────────────────────────────
export interface FarmField {
  field_id: string
  name: string
  boundary: any
  farm_id?: string | null
}
export interface FarmGroup {
  id: string
  name: string
  fields: FarmField[]
}

/** Load the user's fields (with boundaries) and group them by farm. */
export async function loadFieldsAndFarms(mapId: string): Promise<{
  fields: FarmField[]
  farms: FarmGroup[]
}> {
  const [farmRes, fieldRes] = await Promise.all([
    supabase
      .from("farms")
      .select("id, name")
      .eq("map_id", mapId)
      .order("name"),
    supabase
      .from("fields")
      .select("field_id, name, boundary, farm_id")
      .eq("map_id", mapId)
      .order("name")
      .limit(200),
  ])
  if (farmRes.error) throw farmRes.error
  if (fieldRes.error) throw fieldRes.error

  const fData = (fieldRes.data || []).filter((f) => f.boundary) as FarmField[]
  const groups: Record<string, FarmGroup> = {}
  for (const f of farmRes.data || []) {
    groups[f.id] = { id: f.id, name: f.name, fields: [] }
  }
  const ungrouped: FarmGroup = { id: "", name: "Ungrouped", fields: [] }
  for (const f of fData) {
    if (f.farm_id && groups[f.farm_id]) groups[f.farm_id].fields.push(f)
    else ungrouped.fields.push(f)
  }
  const farms = Object.values(groups)
    .filter((g) => g.fields.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  if (ungrouped.fields.length > 0) farms.push(ungrouped)
  return { fields: fData, farms }
}

/** Centroid of a set of field boundaries (e.g. a whole farm). */
export async function fieldsCentroidCoords(fields: FarmField[]): Promise<Loc | null> {
  if (!fields?.length) return null
  const turf = await import("@turf/turf")
  try {
    const fc = turf.featureCollection(fields.map((f) => turf.feature(f.boundary)))
    const c = turf.centroid(fc)
    const [lng, lat] = c.geometry.coordinates
    return { lat, lng }
  } catch {
    return null
  }
}

/** Centroid of a single field boundary. */
export async function fieldCentroidCoords(boundary: any): Promise<Loc | null> {
  if (!boundary) return null
  const turf = await import("@turf/turf")
  try {
    const c = turf.centroid(turf.feature(boundary))
    const [lng, lat] = c.geometry.coordinates
    return { lat, lng }
  } catch {
    return null
  }
}

// ── Saved weather source (shared by the toolbox hero + panel) ──────────────
export interface StationRef {
  wmo: string
  name: string
  lat: number
  lon: number
  state: string
}
export interface WeatherSource {
  mode: "farm" | "my" | "station"
  farmId: string
  lat: number | null
  lng: number | null
  station?: StationRef | null
}

/**
 * Resolve the user's saved weather source to coordinates + a display label.
 * Falls back to the whole-farm centre when nothing is saved.
 */
export async function resolveWeatherSource(
  source: WeatherSource | null | undefined,
  fields: FarmField[],
  farms: FarmGroup[],
): Promise<{ coords: Loc; label: string } | null> {
  if (source?.mode === "station" && source.station) {
    return {
      coords: { lat: source.station.lat, lng: source.station.lon },
      label: `${source.station.name} · station`,
    }
  }
  if (source?.mode === "my" && source.lat != null && source.lng != null) {
    return { coords: { lat: source.lat, lng: source.lng }, label: "My location" }
  }
  if (source?.mode === "farm" && source.farmId) {
    const farm = farms.find((f) => f.id === source.farmId)
    if (farm?.fields?.length) {
      const c = await fieldsCentroidCoords(farm.fields)
      if (c) return { coords: c, label: `${farm.name} · centre` }
    }
  }
  if (fields.length) {
    const c = await fieldsCentroidCoords(fields)
    if (c) return { coords: c, label: "Farm centre" }
  }
  return null
}

// ── BoM weather stations (official fwo files, via /bom-proxy) ──────────────
const BOM_STATE_LETTER: Record<string, string> = {
  NSW: "N",
  VIC: "V",
  QLD: "Q",
  SA: "S",
  WA: "W",
  TAS: "T",
  NT: "D",
  ACT: "N",
}

let bomStationsCache: any[] | null = null
let liveFeedCache = new Map<string, boolean>()

/** Does this station publish a live fwo observation file? (cached per wmo) */
async function stationHasLiveFeed(station: any): Promise<boolean> {
  const cached = liveFeedCache.get(station.wmo)
  if (cached !== undefined) return cached
  const stateLetter = BOM_STATE_LETTER[station?.state] || "W"
  const url = `/bom-proxy/fwo/ID${stateLetter}60801/ID${stateLetter}60801.${station.wmo}.json`
  try {
    const r = await fetchWithLog("BoM fwo", url)
    const j = await r.json()
    // Some stations return HTTP 200 but an empty observations array (no
    // reading on record) — only count files that actually have data.
    const live = !!j?.observations?.data?.length
    liveFeedCache.set(station.wmo, live)
    return live
  } catch {
    liveFeedCache.set(station.wmo, false)
    return false
  }
}

/** Load + cache the official BoM station list (~2.6MB, parsed to {name, lat, lon, wmo, state}). */
export async function getBomStations(): Promise<any[]> {
  if (bomStationsCache) return bomStationsCache
  const r = await fetchWithLog(
    "BoM stations",
    "/bom-proxy/climate/data/lists_by_element/stations.txt",
  )
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
    // Skip closed stations (a 4-digit end year means it stopped operating) —
    // they don't publish live observations, so including them just produces
    // 404s when picked. Active stations show ".." / "...." as the end year.
    const endYear = line.slice(52).trim().split(/\s+/)[1]
    if (/^\d{4}$/.test(endYear || "")) continue
    out.push({ name, lat, lon, wmo, state })
  }
  bomStationsCache = out
  return out
}

/** Nearest stations to a location (distance in km, great-circle approximation).
 * Only stations that publish a live observation feed are returned. */
export async function loadNearbyStations(
  loc: Loc,
  limit = 12,
): Promise<any[]> {
  const stations = await getBomStations()
  const near = stations
    .map((s) => ({
      ...s,
      distKm: Math.hypot(s.lat - loc.lat, s.lon - loc.lng) * 111.19,
    }))
    .sort((a, b) => a.distKm - b.distKm)
    // Validate a wider pool so we can still return `limit` live stations.
    .slice(0, Math.max(limit * 2, 20))
  const checked = await Promise.all(
    near.map(async (s) => ({ s, live: await stationHasLiveFeed(s) })),
  )
  return checked
    .filter((c) => c.live)
    .map((c) => c.s)
    .slice(0, limit)
}

/** Fetch a station's latest fwo observation. */
export async function fetchBomFwoReading(station: StationRef): Promise<{
  reading: any
  ageH: number
}> {
  const stateLetter = BOM_STATE_LETTER[station?.state] || "W"
  const url = `/bom-proxy/fwo/ID${stateLetter}60801/ID${stateLetter}60801.${station.wmo}.json`
  const r = await fetchWithLog(`BoM fwo (${station.name})`, url)
  const j = await r.json()
  const reading = j?.observations?.data?.[0]
  if (!reading) throw new Error("No BoM fwo reading for " + station.name)
  const t = fwoTime(reading.local_date_time_full)
  const ageH = t ? (Date.now() - new Date(t).getTime()) / 3600000 : Infinity
  return { reading, ageH }
}

/** Try to read a station's observation. Returns null if there's no reading. */
export async function tryStationReading(
  station: StationRef,
): Promise<{ reading: any; ageH: number } | null> {
  try {
    return await fetchBomFwoReading(station)
  } catch {
    return null
  }
}

/** BoM fwo local_date_time_full "YYYYMMDDHHMMSS" → ISO string. */
export function fwoTime(s: string): string | null {
  if (!s || s.length < 14) return null
  const y = +s.slice(0, 4)
  const mo = +s.slice(4, 6) - 1
  const d = +s.slice(6, 8)
  const h = +s.slice(8, 10)
  const mi = +s.slice(10, 12)
  return new Date(y, mo, d, h, mi).toISOString()
}

/** A BoM reading older than this (hours) is treated as "not live". */
export const STALE_STATION_HOURS = 3

/** BoM local_date_time_full → friendly local string, e.g. "Sat, 8 Aug, 2:30 pm". */
export function formatReadingTime(s: string): string {
  const t = fwoTime(s)
  if (!t) return "an unknown time"
  return new Date(t).toLocaleString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Hours → "3h ago", "2 days ago". */
export function formatAgeH(h: number): string {
  if (h == null || !isFinite(h)) return ""
  if (h < 1) return Math.round(h * 60) + "m ago"
  if (h < 48) return Math.round(h) + "h ago"
  return Math.round(h / 24) + " days ago"
}

/** BoM compass direction ("W", "CALM") → degrees. */
export function compassToDeg(c: string): number {
  const map: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  }
  return map[(c || "").toUpperCase()] ?? 0
}

/** Heuristic WMO code from a BoM fwo reading (for the animated icon). */
export function deriveStationCode(reading: any): number {
  const cloud = (reading?.cloud || "").toLowerCase()
  const rain = parseFloat(reading?.rain_trace) || 0
  if (rain > 0) return 61
  if (cloud.includes("thunder")) return 95
  if (cloud.includes("rain") || cloud.includes("shower") || cloud.includes("drizzle")) return 61
  if (cloud.includes("overcast") || cloud.includes("cloudy")) return 3
  if (cloud.includes("fog") || cloud.includes("mist")) return 45
  if (cloud.includes("clear") || cloud.includes("sunny")) return 0
  return 2
}

/** Normalise a BoM fwo reading into the same shape as Open-Meteo's current block. */
export function stationToCurrent(
  station: StationRef,
  reading: any,
  ageH: number,
): any {
  return {
    temperature_2m: reading?.air_temp ?? null,
    apparent_temperature: reading?.apparent_t ?? null,
    dew_point_2m: reading?.dewpt ?? null,
    relative_humidity_2m: reading?.rel_hum ?? null,
    wind_speed_10m: reading?.wind_spd_kmh ?? null,
    wind_direction_10m: compassToDeg(reading?.wind_dir),
    wind_gusts_10m: reading?.gust_kmh ?? null,
    precipitation: parseFloat(reading?.rain_trace) || 0,
    weather_code: deriveStationCode(reading),
    cloud_cover: null,
    stationName: station?.name,
    stationAgeH: ageH,
  }
}

// ── Shared toolbox hero cache (prefetched at map load) ─────────────────────
export interface WeatherHeroData {
  temp: number | null
  cond: string
  iconSvg: string
  locLabel: string
}

let heroCache: { key: string; data: WeatherHeroData | null } | null = null
let fieldsFarmsCache: {
  mapId: string
  fields: FarmField[]
  farms: FarmGroup[]
} | null = null

/** Stable key for a saved weather source (used to detect changes). */
export function weatherHeroKey(
  source: WeatherSource | null | undefined,
): string {
  return JSON.stringify(source ?? null)
}

/** The last successfully-built hero payload (null until one is fetched). */
export function getWeatherHero(): WeatherHeroData | null {
  return heroCache?.data ?? null
}

export async function loadFieldsFarmsCached(mapId: string) {
  if (fieldsFarmsCache?.mapId === mapId) return fieldsFarmsCache
  const r = await loadFieldsAndFarms(mapId)
  fieldsFarmsCache = { mapId, fields: r.fields, farms: r.farms }
  return fieldsFarmsCache
}

/**
 * Build the toolbox hero payload for a source and cache it module-wide so the
 * toolbox button renders instantly — no first-load spinner. Call early (e.g.
 * when the map loads) to warm the cache; failures keep the previous cache.
 */
export async function fetchWeatherHero(
  mapId: string,
  source: WeatherSource | null | undefined,
): Promise<WeatherHeroData | null> {
  try {
    const { fields, farms } = await loadFieldsFarmsCached(mapId)
    let resolved = await resolveWeatherSource(source ?? null, fields, farms)
    if (!resolved) {
      heroCache = { key: weatherHeroKey(source), data: null }
      return null
    }
    let temp: number | null = null
    let cond = "Weather"
    let iconSvg = forecastIcon(3)
    let label = resolved.label
    let cacheSource = source ?? null
    if (source?.mode === "station" && source.station) {
      // Station source: show the station's own observation. If the reading is
      // stale, still show it but mark it as the last reading.
      try {
        const { reading, ageH } = await fetchBomFwoReading(source.station)
        const code = deriveStationCode(reading)
        temp = Math.round(reading.air_temp)
        cond = wmoDesc(code)
        iconSvg = forecastIcon(code)
        if (ageH != null && ageH > STALE_STATION_HOURS) {
          label = `${source.station.name} · last reading`
        }
      } catch {
        // No observation on record — bounce the saved source back to the farm
        // centre so this station is never presented as usable.
        const farmSource = { mode: "farm", farmId: "", lat: null, lng: null }
        await userSettingsApi.updateWeatherSource(farmSource)
        cacheSource = farmSource
        const fb = await resolveWeatherSource(null, fields, farms)
        if (!fb) {
          heroCache = { key: weatherHeroKey(source), data: null }
          return null
        }
        resolved = fb
        label = resolved.label
      }
    }
    if (temp == null) {
      // Non-station source, or a station with no reading — use Open-Meteo
      // current at the resolved location.
      const j = await fetchOpenMeteoCurrent(resolved.coords).catch(() => null)
      const cur = j?.current
      if (cur) {
        temp = Math.round(cur.temperature_2m)
        cond = wmoDesc(cur.weather_code ?? 3)
        iconSvg = forecastIcon(cur.weather_code)
      }
    }
    const data: WeatherHeroData = {
      temp,
      cond,
      iconSvg,
      locLabel: label,
    }
    heroCache = { key: weatherHeroKey(cacheSource), data }
    return data
  } catch {
    return null
  }
}

// ── Shared toolbox weather panel (prefetched at map load) ──────────────────
export interface WeatherPanelData {
  current: any
  forecastDaysList: any[]
  activeLabel: string
  notice: string
  error: string | null
  bounced: boolean
  bouncedStation: string | null
}

let panelCache: { key: string; data: WeatherPanelData | null } | null = null

/** The cached panel payload, but only when it matches the given source. */
export function getWeatherPanel(
  source: WeatherSource | null | undefined,
): WeatherPanelData | null {
  const key = weatherHeroKey(source)
  return panelCache && panelCache.key === key ? panelCache.data : null
}

/**
 * Build the full weather panel payload (hero current + 7-day forecast) and
 * cache it module-wide. Prefetch at map load so the weather menu opens with
 * data already in place; failures keep the previous cache.
 */
export async function fetchWeatherPanel(
  mapId: string,
  source: WeatherSource | null | undefined,
): Promise<WeatherPanelData | null> {
  try {
    const { fields, farms } = await loadFieldsFarmsCached(mapId)
    const resolved = await resolveWeatherSource(source ?? null, fields, farms)
    if (!resolved) {
      panelCache = { key: weatherHeroKey(source), data: null }
      return null
    }
    let activeLabel = resolved.label
    let notice = ""
    let error: string | null = null

    let fc = null
    try {
      fc = await fetchForecast(resolved.coords)
    } catch (e) {
      error = e?.message || String(e)
    }

    let cur = null
    if (source?.mode === "station" && source.station) {
      // Station mode: current conditions from the BoM station; rain chance
      // from Open-Meteo at the station's coordinates.
      try {
        const { reading, ageH } = await fetchBomFwoReading(source.station)
        const om = await fetchOpenMeteoCurrent(resolved.coords).catch(() => null)
        cur = {
          current: stationToCurrent(source.station, reading, ageH),
          daily: om?.daily || {},
        }
        if (ageH != null && ageH > STALE_STATION_HOURS) {
          // Has a reading but isn't reporting live — show the last reading
          // and when it was taken.
          activeLabel = `${source.station.name} · last reading`
          notice = `${source.station.name} isn't reporting live — showing its last reading from ${formatReadingTime(reading.local_date_time_full)} (${formatAgeH(ageH)}).`
        }
      } catch {
        // No reading on record — bounce the saved source back to the farm
        // centre so this station is never presented as usable.
        const farmSource = { mode: "farm", farmId: "", lat: null, lng: null }
        await userSettingsApi.updateWeatherSource(farmSource)
        const result = await fetchWeatherPanel(mapId, farmSource)
        if (!result) {
          panelCache = { key: weatherHeroKey(source), data: null }
          return null
        }
        return {
          ...result,
          bounced: true,
          bouncedStation: source.station.name,
        }
      }
    } else {
      try {
        cur = await fetchOpenMeteoCurrent(resolved.coords)
      } catch (e) {
        error = (error ? error + " · " : "") + (e?.message || String(e))
      }
    }

    let fcDays = fc ? forecastDays(fc) : []
    // ECMWF (models=ecmwf_ifs025) starts its daily series at TOMORROW —
    // prepend a Today card built from the current-conditions call.
    if (cur) {
      const d0 = cur.daily || {}
      const todayCard = {
        date: d0.time?.[0] || new Date().toISOString().slice(0, 10),
        max: d0.temperature_2m_max?.[0],
        min: d0.temperature_2m_min?.[0],
        code: d0.weather_code?.[0] ?? cur.current?.weather_code,
        rain: d0.precipitation_sum?.[0] ?? cur.current?.precipitation ?? 0,
        prob: d0.precipitation_probability_max?.[0],
        wind: null,
        gust: null,
        windDir: null,
        sunrise: null,
        sunset: null,
      }
      if (!fcDays.length || fcDays[0].date !== todayCard.date) {
        fcDays.unshift(todayCard)
      }
    }

    const data: WeatherPanelData = {
      current: cur,
      forecastDaysList: fcDays,
      activeLabel,
      notice,
      error,
      bounced: false,
      bouncedStation: null,
    }
    panelCache = { key: weatherHeroKey(source), data }
    return data
  } catch {
    return null
  }
}
