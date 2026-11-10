import { describe, expect, it, vi } from "vitest"
import {
  buildWeatherRows,
  compassFromDeg,
  fetchWorkingWeather,
  wmoDescShort,
  workingHours,
  workingTimeRange,
} from "./fieldWeather"

// Local-time timestamps so hour keys match regardless of the test machine's TZ.
const local = (d: number, h: number, m = 0) => new Date(2026, 2, d, h, m).getTime()
const key = (d: number, h: number) =>
  `2026-03-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00`

const records = [
  { start_time: local(3, 9, 15), end_time: local(3, 10, 30) },
  { start_time: local(3, 10, 5), end_time: local(3, 10, 20) },
]

function hourly(keys: string[]) {
  return {
    time: keys,
    temperature_2m: keys.map(() => 21.6),
    dew_point_2m: keys.map(() => 10.2),
    relative_humidity_2m: keys.map(() => 48.4),
    weather_code: keys.map(() => 3),
    wind_speed_10m: keys.map(() => 12.5),
    wind_direction_10m: keys.map(() => 225),
    wind_gusts_10m: keys.map(() => null),
    precipitation: keys.map(() => 0.2),
  }
}

const okJson = (body: any) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)

describe("small helpers", () => {
  it("describes WMO codes", () => {
    expect(wmoDescShort(0)).toBe("Clear")
    expect(wmoDescShort(95)).toBe("Thunderstorm")
    expect(wmoDescShort(12345)).toBe("Unknown")
  })

  it("converts bearings to compass points", () => {
    expect(compassFromDeg(0)).toBe("N")
    expect(compassFromDeg(225)).toBe("SW")
    expect(compassFromDeg(359)).toBe("N")
    expect(compassFromDeg(null)).toBe("")
    expect(compassFromDeg(NaN)).toBe("")
  })
})

describe("working hours", () => {
  it("spans all records", () => {
    expect(workingTimeRange(records)).toEqual({
      min: local(3, 9, 15),
      max: local(3, 10, 30),
    })
    expect(workingTimeRange([{ start_time: "nope" }])).toBeNull()
  })

  it("lists each covered hour once", () => {
    expect([...workingHours(records).keys()]).toEqual([key(3, 9), key(3, 10)])
  })
})

describe("buildWeatherRows", () => {
  it("builds rows only for hours the API returned, in time order", () => {
    const hours = new Map([
      [key(3, 10), local(3, 10)],
      [key(3, 9), local(3, 9)],
      [key(3, 11), local(3, 11)],
    ])
    const rows = buildWeatherRows(hourly([key(3, 9), key(3, 10)]), hours)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      conditions: "Overcast",
      temp: 22,
      windSpeed: 13,
      windDir: "SW",
      gust: null,
      humidity: 48,
      deltaT: "11.4",
      rain: 0.2,
    })
    expect(rows[0]).not.toHaveProperty("_ms")
  })
})

describe("fetchWorkingWeather", () => {
  it("uses ERA5 when it has data", async () => {
    const fetchFn = vi.fn(() => okJson({ hourly: hourly([key(3, 9), key(3, 10)]) }))
    const out = await fetchWorkingWeather(records, [151, -33], fetchFn as any)
    expect(out.source).toBe("Open-Meteo · ERA5")
    expect(out.error).toBe("")
    expect(out.rows).toHaveLength(2)
    expect(fetchFn).toHaveBeenCalledOnce()
    const url = String((fetchFn.mock.calls[0] as any[])[0])
    expect(url).toContain("archive-api.open-meteo.com")
    expect(url).toContain("latitude=-33&longitude=151")
    expect(url).toContain("start_date=2026-03-03&end_date=2026-03-03")
  })

  it("falls back to GFS for recent work", async () => {
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => okJson({ hourly: { time: [] } }))
      .mockImplementationOnce(() => okJson({ hourly: hourly([key(3, 9)]) }))
    const out = await fetchWorkingWeather(records, [151, -33], fetchFn)
    expect(out.source).toBe("Open-Meteo · GFS")
    expect(out.rows).toHaveLength(1)
    expect(String(fetchFn.mock.calls[1][0])).toContain("historical-forecast-api")
  })

  it("reports failures", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("offline")))
    expect(await fetchWorkingWeather(records, [151, -33], failing as any)).toEqual({
      rows: [],
      source: "Open-Meteo · GFS",
      error: "no weather data returned",
    })
    expect((await fetchWorkingWeather([], [1, 2], failing as any)).error).toBe(
      "no time data in records",
    )
    expect((await fetchWorkingWeather(records, null, failing as any)).error).toBe(
      "could not compute field centre",
    )
  })
})
