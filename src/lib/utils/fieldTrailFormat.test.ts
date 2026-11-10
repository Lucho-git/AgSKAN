import { describe, expect, it } from "vitest"
import {
  activityTypeLabel,
  bdRows,
  buildTrailSelection,
  clusterSwathLabel,
  confidenceLabel,
  formatClusterWindow,
  formatDuration,
  formatHa,
  formatKm,
  formatTime,
  formatTimeBetween,
  formatVehicleType,
  getVehicleType,
  matchActivityName,
  matchColor,
  MATCH_COLORS,
  recordKey,
  trailPopupHtml,
} from "./fieldTrailFormat"

describe("recordKey", () => {
  it("prefers id, then trail_id, then start_time", () => {
    expect(recordKey({ id: "a", trail_id: "b", start_time: "c" })).toBe("a")
    expect(recordKey({ trail_id: "b", start_time: "c" })).toBe("b")
    expect(recordKey({ start_time: "c" })).toBe("c")
    expect(recordKey(null)).toBeUndefined()
  })
})

describe("number formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0s")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(125)).toBe("2m")
    expect(formatDuration(3725)).toBe("1h 2m")
  })

  it("formats area and distance from strings or numbers", () => {
    expect(formatHa("12.345")).toBe("12.35 ha")
    expect(formatHa(null)).toBe("0.00 ha")
    expect(formatKm(3)).toBe("3.00 km")
  })

  it("splits vehicle type names", () => {
    expect(formatVehicleType("SimpleTractor")).toBe("Simple Tractor")
    expect(formatVehicleType("")).toBe("Unknown")
    expect(getVehicleType({ vehicle_type: "Ute" })).toBe("Ute")
    expect(getVehicleType({ vehicle_marker: { type: "Header" } })).toBe("Header")
    expect(getVehicleType({})).toBe("")
  })
})

describe("formatTimeBetween", () => {
  const MIN = 60000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR
  it("picks the largest whole unit", () => {
    expect(formatTimeBetween(0, 30000)).toBe("moments")
    expect(formatTimeBetween(0, 5 * MIN)).toBe("5 min")
    expect(formatTimeBetween(0, HOUR)).toBe("1 hour")
    expect(formatTimeBetween(0, 3 * HOUR)).toBe("3 hours")
    expect(formatTimeBetween(0, 2 * DAY)).toBe("2 days")
    expect(formatTimeBetween(0, 61 * DAY)).toBe("2 months")
    expect(formatTimeBetween(0, 400 * DAY)).toBe("1 year")
  })
})

describe("buildTrailSelection", () => {
  const record = {
    id: "r1",
    start_time: "2026-03-01T01:00:00Z",
    operator_name: "Kim",
    vehicle_type: "SimpleTractor",
    area_hectares: 10,
    distance_km: 4,
    intervals: [
      {
        area_hectares: 3,
        distance_km: 1.5,
        entry_time: "2026-03-01T01:00:00Z",
        exit_time: "2026-03-01T02:00:00Z",
      },
      { area_hectares: 0 },
    ],
  }

  it("describes a whole record", () => {
    expect(buildTrailSelection(record, 2, "#f00")).toMatchObject({
      recordIdx: 2,
      recordId: "r1",
      intervalIdx: null,
      color: "#f00",
      operator: "Kim",
      vehicle: "Simple Tractor",
      area: "10.00 ha",
      distance: "4.00 km",
      startTime: null,
      endTime: null,
      intervalCount: 2,
    })
  })

  it("describes one interval, falling back to record totals", () => {
    const sel = buildTrailSelection(record, 0, "#f00", 0)
    expect(sel).toMatchObject({
      intervalIdx: 0,
      area: "3.00 ha",
      distance: "1.50 km",
      startTime: formatTime("2026-03-01T01:00:00Z"),
      endTime: formatTime("2026-03-01T02:00:00Z"),
    })
    expect(buildTrailSelection(record, 0, "#f00", 1)).toMatchObject({
      area: "10.00 ha",
      startTime: null,
    })
  })

  it("defaults the operator and interval count", () => {
    expect(
      buildTrailSelection({ start_time: "2026-03-01" }, 0, "#000"),
    ).toMatchObject({ operator: "Unknown", intervalCount: 1, vehicle: "Unknown" })
  })
})

describe("trailPopupHtml", () => {
  it("includes the time row only when there is a start time", () => {
    const base = {
      color: "#f00",
      date: "1 Mar 2026",
      operator: "Kim",
      vehicle: "Ute",
      area: "1.00 ha",
      distance: "2.00 km",
    }
    expect(trailPopupHtml(base)).not.toContain("⏰")
    const html = trailPopupHtml({ ...base, startTime: "9:00", endTime: "10:00" })
    expect(html).toContain("⏰ 9:00 – 10:00")
    expect(html).toContain("color: #f00;")
  })
})

describe("match labels", () => {
  it("names the activity", () => {
    expect(matchActivityName({ activity: { attributes: { name: "Spray" } } } as any)).toBe("Spray")
    expect(
      matchActivityName({ activity: { attributes: { operation_type_name: "Sow" } } } as any),
    ).toBe("Sow")
    expect(matchActivityName({ activity: null } as any)).toBe("Unnamed")
  })

  it("cycles match colours", () => {
    expect(matchColor(0)).toBe(MATCH_COLORS[0])
    expect(matchColor(MATCH_COLORS.length + 1)).toBe(MATCH_COLORS[1])
  })

  it("labels confidence and type", () => {
    expect(confidenceLabel("high")).toBe("Likely match")
    expect(confidenceLabel("medium")).toBe("Possible match")
    expect(confidenceLabel("low")).toBe("Weak match")
    expect(confidenceLabel("none")).toBe("No match")
    expect(activityTypeLabel("actual")).toBe("Actual")
    expect(activityTypeLabel("work_order")).toBe("Work Order")
  })

  it("averages swath widths", () => {
    expect(clusterSwathLabel({ swathWidths: [] })).toBe("")
    expect(clusterSwathLabel({ swathWidths: [10, 13] })).toBe("~12m swath")
  })

  it("formats cluster windows", () => {
    const d = (s: string) => new Date(s).getTime()
    const sameDay = formatClusterWindow({
      start: d("2026-03-03T01:00:00"),
      end: d("2026-03-03T05:00:00"),
    })
    expect(sameDay).toMatch(/2026/)
    const range = formatClusterWindow({
      start: d("2026-03-03T01:00:00"),
      end: d("2026-03-09T01:00:00"),
    })
    expect(range).toContain(" – ")
    expect(range).not.toMatch(/2026/)
    const crossYear = formatClusterWindow({
      start: d("2025-12-30T01:00:00"),
      end: d("2026-01-02T01:00:00"),
    })
    expect(crossYear).toMatch(/2026$/)
  })
})

describe("bdRows", () => {
  it("builds rows for the components present", () => {
    const rows = bdRows({
      timing: { score: 0.756, weight: 0.5, details: { gap: "1d" } },
      coverage: { score: 1, weight: 0.2 },
    })
    expect(rows).toEqual([
      { label: "timing", pct: 76, weight: 0.5, contrib: 0.378, details: { gap: "1d" } },
      { label: "coverage", pct: 100, weight: 0.2, contrib: 0.2, details: {} },
    ])
    expect(bdRows(null)).toEqual([])
  })
})
