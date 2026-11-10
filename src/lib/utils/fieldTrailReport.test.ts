import { describe, expect, it } from "vitest"
import {
  buildReportData,
  formatHoursMinutes,
  operatingHoursRows,
  totalOperatingTime,
} from "./fieldTrailReport"

const t = (h: number, m = 0) => new Date(2026, 2, 3, h, m).toISOString()

const records = [
  {
    start_time: t(8),
    end_time: t(11),
    area_hectares: "10.5",
    distance_km: 4,
    operator_name: "Kim",
    operation_name: "Spray",
    intervals: [
      { entry_time: t(8), exit_time: t(9, 30) },
      { entry_time: t(10), exit_time: t(10, 45) },
    ],
  },
  {
    start_time: t(13),
    end_time: null,
    area_hectares: null,
    distance_km: "1.25",
    operator_name: null,
    operation_name: "Spray",
  },
]

describe("formatHoursMinutes", () => {
  it("formats", () => {
    expect(formatHoursMinutes(45)).toBe("45m")
    expect(formatHoursMinutes(125)).toBe("2h 5m")
  })
})

describe("operatingHoursRows", () => {
  it("has a row per interval, or per record without intervals", () => {
    const rows = operatingHoursRows(records)
    expect(rows.map((r) => r.duration)).toEqual(["1h 30m", "45m", "0m"])
    expect(rows.map((r) => r.operator)).toEqual(["Kim", "Kim", "Unknown"])
  })

  it("totals the durations", () => {
    expect(totalOperatingTime(operatingHoursRows(records))).toBe("2h 15m")
    expect(totalOperatingTime([])).toBe("0m")
  })
})

describe("buildReportData", () => {
  const weather = { rows: [], source: "Open-Meteo · ERA5", error: "x" }

  it("totals area and distance and lists operators", () => {
    const data = buildReportData({
      records,
      crop: "",
      inputProducts: [],
      snapshot: "data:image/png;base64,xx",
      weather,
    })
    expect(data).toMatchObject({
      crop: "Unknown",
      treatedArea: "10.50",
      totalDistance: "5.25",
      operators: "Kim, Unknown",
      totalOperatingTime: "2h 15m",
      weatherSource: "Open-Meteo · ERA5",
      weatherError: "x",
      products: [],
      productsSource: "",
      operations: [
        { name: "Spray", rate: "1 ha/ha", area: "10.50 ha", cost: "$210.00" },
      ],
    })
    expect(data.started).toBe(
      new Date(t(8)).toLocaleString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    )
  })

  it("uses real input products only, with placeholders for gaps", () => {
    const data = buildReportData({
      records,
      crop: "Wheat",
      inputProducts: [{ name: "Glyphosate", rate: "2 L/ha" }],
      snapshot: "",
      weather,
    })
    expect(data.productsSource).toBe("Agworld")
    expect(data.products).toEqual([
      { name: "Glyphosate", activeIngredient: "—", rate: "2 L/ha", usage: "—" },
    ])
  })
})
