// src/lib/utils/fieldTrailReport.ts
// Data for the field input report (FieldTrailOverlay → "Report"): totals,
// operating hours, inputs and operations. Weather and the map snapshot are
// gathered by the component and passed in.

import type { WeatherRow } from "$lib/services/fieldWeather"

/* eslint-disable @typescript-eslint/no-explicit-any -- spray records are untyped rows */

export interface OperatingHoursRow {
  date: string
  entry: string
  exit: string
  duration: string
  operator: string
}

export interface ReportData {
  crop: string
  started: string
  completed: string
  treatedArea: string
  totalDistance: string
  operators: string
  totalOperatingTime: string
  operatingHours: OperatingHoursRow[]
  snapshot: string
  weather: WeatherRow[]
  weatherSource: string
  weatherError: string
  products: Array<{ name: string; activeIngredient: string; rate: string; usage: string }>
  productsSource: string
  operations: Array<{ name: string; rate: string; area: string; cost: string }>
}

/** "2h 5m" / "45m". */
export function formatHoursMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** One row per interval (or per record when it has no intervals). */
export function operatingHoursRows(records: any[]): OperatingHoursRow[] {
  const row = (entryTs: any, exitTs: any, operator: string) => {
    const entry = new Date(entryTs)
    const exit = new Date(exitTs)
    const durSec = Math.round((exit.getTime() - entry.getTime()) / 1000)
    const time = (d: Date) =>
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    return {
      date: entry.toLocaleDateString([], {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      entry: time(entry),
      exit: time(exit),
      duration: formatHoursMinutes(Math.floor(durSec / 60)),
      operator,
    }
  }

  const rows: OperatingHoursRow[] = []
  for (const r of records) {
    const operator = r.operator_name || "Unknown"
    if (r.intervals?.length) {
      for (const iv of r.intervals) {
        rows.push(row(iv.entry_time, iv.exit_time, operator))
      }
    } else {
      rows.push(row(r.start_time, r.end_time || r.start_time, operator))
    }
  }
  return rows
}

/** Sum of the rows' "Xh Ym" / "Ym" durations, formatted the same way. */
export function totalOperatingTime(rows: OperatingHoursRow[]): string {
  const totalSec = rows.reduce((sum, o) => {
    const [h, m] = o.duration.includes("h")
      ? o.duration
          .match(/(\d+)h\s*(\d+)?m?/)!
          .slice(1)
          .map(Number)
      : [0, parseInt(o.duration)]
    return sum + (h || 0) * 3600 + (m || 0) * 60
  }, 0)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
}

/**
 * Build the report from records sorted by start time.
 * `inputProducts` are real inputs (e.g. Agworld) — none are invented.
 */
export function buildReportData(opts: {
  records: any[]
  crop: string
  inputProducts: any[] | null | undefined
  snapshot: string
  weather: { rows: WeatherRow[]; source: string; error?: string }
}): ReportData {
  const { records } = opts
  const sum = (key: string) =>
    records.reduce((s, r) => s + parseFloat(r[key] || 0), 0)
  const totalArea = sum("area_hectares")
  const totalDistance = sum("distance_km")
  const last = records[records.length - 1]
  const startTime = records[0]?.start_time
  const endTime = last?.end_time || last?.start_time

  const unique = (key: string) => [
    ...new Set(records.map((r) => r[key] || "Unknown")),
  ]

  const operatingHours = operatingHoursRows(records)

  const products = opts.inputProducts?.length
    ? opts.inputProducts.map((p: any) => ({
        name: p.name || "Unknown",
        activeIngredient: p.activeIngredient || "—",
        rate: p.rate || "—",
        usage: p.usage || "—",
      }))
    : []

  return {
    crop: opts.crop || "Unknown",
    started: new Date(startTime).toLocaleString([], DATE_TIME),
    completed: new Date(endTime).toLocaleString([], DATE_TIME),
    treatedArea: totalArea.toFixed(2),
    totalDistance: totalDistance.toFixed(2),
    operators: unique("operator_name").join(", "),
    totalOperatingTime: totalOperatingTime(operatingHours),
    operatingHours,
    snapshot: opts.snapshot,
    weather: opts.weather.rows,
    weatherSource: opts.weather.source,
    weatherError: opts.weather.error || "",
    products,
    productsSource: products.length ? "Agworld" : "",
    operations: unique("operation_name").map((name) => ({
      name,
      rate: "1 ha/ha",
      area: `${totalArea.toFixed(2)} ha`,
      cost: `$${(totalArea * 20).toFixed(2)}`,
    })),
  }
}
