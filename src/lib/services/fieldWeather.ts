// src/lib/services/fieldWeather.ts
// Hourly weather (Open-Meteo) for the hours a field was worked, for the
// field input report. Uses the ERA5 archive, falling back to the past GFS
// forecast for recent work (ERA5 lags ~5 days).

/* eslint-disable @typescript-eslint/no-explicit-any -- spray records / API JSON are untyped */

export interface WeatherRow {
  time: string
  conditions: string
  temp: number | null
  windSpeed: number | null
  windDir: string
  gust: number | null
  humidity: number | null
  deltaT: string | null
  rain: number
}

export interface WeatherLookup {
  rows: WeatherRow[]
  source: string
  error: string
}

const WMO_SHORT: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Violent showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Severe thunderstorm",
}

/** Short description for a WMO weather code. */
export function wmoDescShort(code: number): string {
  return WMO_SHORT[code] || "Unknown"
}

/** 8-point compass direction for a bearing ("" when unknown). */
export function compassFromDeg(deg: number | null | undefined): string {
  if (deg == null || isNaN(deg)) return ""
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  return dirs[Math.round((deg % 360) / 45) % 8] || ""
}

const pad = (n: number) => String(n).padStart(2, "0")
/** Local YYYY-MM-DD. */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Earliest start / latest end across the records, or null without times. */
export function workingTimeRange(
  records: any[],
): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  for (const r of records) {
    const s = new Date(r.start_time).getTime()
    const e = new Date(r.end_time || r.start_time).getTime()
    if (!isNaN(s) && s < min) min = s
    if (!isNaN(e) && e > max) max = e
  }
  return isFinite(min) && isFinite(max) ? { min, max } : null
}

/**
 * Local top-of-hour slots ("YYYY-MM-DDTHH:00" → ms) covered by any record,
 * deduplicated, in first-seen order.
 */
export function workingHours(records: any[]): Map<string, number> {
  const hours = new Map<string, number>()
  for (const r of records) {
    const recEnd = new Date(r.end_time || r.start_time)
    const h = new Date(r.start_time)
    h.setMinutes(0, 0, 0)
    for (let t = h.getTime(); t <= recEnd.getTime(); t += 3600000) {
      const d = new Date(t)
      const key = `${localDate(d)}T${pad(d.getHours())}:00`
      if (!hours.has(key)) hours.set(key, t)
    }
  }
  return hours
}

/** One report row per working hour that the API returned data for. */
export function buildWeatherRows(
  hourly: any,
  hours: Map<string, number>,
): WeatherRow[] {
  const hh = hourly || {}
  const byTime = new Map<string, number>()
  ;(hh.time || []).forEach((t: string, i: number) =>
    byTime.set(String(t).slice(0, 16), i),
  )

  const rows: Array<WeatherRow & { _ms: number }> = []
  for (const [key, ms] of hours) {
    const idx = byTime.get(key)
    if (idx == null) continue
    const temp = hh.temperature_2m?.[idx]
    const humidity = hh.relative_humidity_2m?.[idx]
    const dew = hh.dew_point_2m?.[idx]
    const dt =
      temp != null && dew != null ? Math.round((temp - dew) * 10) / 10 : null
    rows.push({
      time: new Date(ms).toLocaleString([], {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
      conditions: wmoDescShort(hh.weather_code?.[idx]),
      temp: temp != null ? Math.round(temp) : null,
      windSpeed:
        hh.wind_speed_10m?.[idx] != null
          ? Math.round(hh.wind_speed_10m[idx])
          : null,
      windDir: compassFromDeg(hh.wind_direction_10m?.[idx]),
      gust:
        hh.wind_gusts_10m?.[idx] != null
          ? Math.round(hh.wind_gusts_10m[idx])
          : null,
      humidity: humidity != null ? Math.round(humidity) : null,
      deltaT: dt != null ? dt.toFixed(1) : null,
      rain: hh.precipitation?.[idx] ?? 0,
      _ms: ms,
    })
  }
  rows.sort((a, b) => a._ms - b._ms)
  return rows.map(({ _ms, ...row }) => row)
}

const HOURLY_FIELDS =
  "temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m"

async function getJson(fetchFn: typeof fetch, url: string): Promise<any> {
  try {
    const r = await fetchFn(url)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

/**
 * Weather for the field's working hours.
 * @param centroid [lng, lat] of the field, or null when it couldn't be computed
 */
export async function fetchWorkingWeather(
  records: any[],
  centroid: [number, number] | null,
  fetchFn: typeof fetch = fetch,
): Promise<WeatherLookup> {
  const range = workingTimeRange(records)
  if (!range) return { rows: [], source: "", error: "no time data in records" }
  if (!centroid)
    return { rows: [], source: "", error: "could not compute field centre" }
  const [lng, lat] = centroid
  if (lat == null || lng == null)
    return { rows: [], source: "", error: "no field boundary" }

  const params = `latitude=${lat}&longitude=${lng}&start_date=${localDate(new Date(range.min))}&end_date=${localDate(new Date(range.max))}&timezone=auto&hourly=${HOURLY_FIELDS}`

  let source = "Open-Meteo · ERA5"
  let data = await getJson(
    fetchFn,
    `https://archive-api.open-meteo.com/v1/archive?${params}`,
  )
  if (!data?.hourly?.time?.length) {
    source = "Open-Meteo · GFS"
    data = await getJson(
      fetchFn,
      `https://historical-forecast-api.open-meteo.com/v1/forecast?${params}`,
    )
  }
  if (!data?.hourly?.time?.length)
    return { rows: [], source, error: "no weather data returned" }

  return {
    rows: buildWeatherRows(data.hourly, workingHours(records)),
    source,
    error: "",
  }
}

/** [lng, lat] centroid of a boundary via turf, or null on failure. */
export async function boundaryCentroid(
  boundary: any,
): Promise<[number, number] | null> {
  try {
    const turf = await import("@turf/turf")
    const c = turf.centroid(turf.feature(boundary))
    return [c.geometry.coordinates[0], c.geometry.coordinates[1]]
  } catch {
    return null
  }
}
