import { describe, expect, it } from "vitest"
import {
  availableOperations,
  clampSliderEnd,
  clampSliderStart,
  filterRecords,
  getTrailColor,
  initialRangeMode,
  matchedRecordMap,
  sliderBounds,
  sortByStart,
  sortedRecordTimes,
  timeToPct,
  SLIDER_MIN_GAP,
  TRAIL_COLORS,
} from "./fieldTrailTimeline"

const DAY = 86400000
const NOW = Date.UTC(2026, 5, 1)
const iso = (ms: number) => new Date(ms).toISOString()

describe("getTrailColor", () => {
  it("is stable per record id regardless of position", () => {
    const c = getTrailColor({ id: "abc" }, 0)
    expect(getTrailColor({ id: "abc" }, 7)).toBe(c)
    expect(TRAIL_COLORS).toContain(c)
  })

  it("falls back to position without an id", () => {
    expect(getTrailColor({}, 1)).toBe(TRAIL_COLORS[1])
    expect(getTrailColor({}, TRAIL_COLORS.length)).toBe(TRAIL_COLORS[0])
  })

  it("is always red in locked mode", () => {
    expect(getTrailColor({ id: "abc" }, 3, true)).toBe("#ef4444")
  })
})

describe("initialRangeMode", () => {
  it("picks the shortest range with a record in it", () => {
    expect(initialRangeMode([NOW - 2 * DAY], NOW)).toBe("7d")
    expect(initialRangeMode([NOW - 20 * DAY], NOW)).toBe("30d")
    expect(initialRangeMode([NOW - 60 * DAY], NOW)).toBe("3m")
    expect(initialRangeMode([NOW - 200 * DAY], NOW)).toBe("1y")
    expect(initialRangeMode([NOW - 900 * DAY], NOW)).toBe("all")
  })
})

describe("sliderBounds", () => {
  const timeMin = NOW - 100 * DAY
  const timeMax = NOW - 10 * DAY

  it("spans the records for 'all' and locked mode", () => {
    const all = { min: timeMin, max: timeMax }
    expect(sliderBounds({ rangeMode: "all", lockedMode: false, timeMin, timeMax, now: NOW })).toEqual(all)
    expect(sliderBounds({ rangeMode: "7d", lockedMode: true, timeMin, timeMax, now: NOW })).toEqual(all)
  })

  it("ends a period at now, clamped to a day around the records", () => {
    expect(
      sliderBounds({ rangeMode: "30d", lockedMode: false, timeMin, timeMax, now: NOW }),
    ).toEqual({ min: NOW - 30 * DAY, max: timeMax + DAY })
    expect(
      sliderBounds({ rangeMode: "1y", lockedMode: false, timeMin, timeMax, now: NOW }),
    ).toEqual({ min: timeMin - DAY, max: timeMax + DAY })
  })

  it("treats unknown modes as 7 days", () => {
    expect(
      sliderBounds({ rangeMode: "?", lockedMode: false, timeMin: 0, timeMax: NOW, now: NOW }),
    ).toEqual({ min: NOW - 7 * DAY, max: NOW })
  })
})

describe("slider helpers", () => {
  it("maps times to clamped percentages", () => {
    expect(timeToPct(50, 0, 100)).toBe(50)
    expect(timeToPct(-5, 0, 100)).toBe(0)
    expect(timeToPct(500, 0, 100)).toBe(100)
    expect(timeToPct(5, 10, 10)).toBe(0)
  })

  it("keeps the handles an hour apart", () => {
    expect(clampSliderStart(10 * SLIDER_MIN_GAP, 10 * SLIDER_MIN_GAP)).toBe(9 * SLIDER_MIN_GAP)
    expect(clampSliderStart(SLIDER_MIN_GAP, 10 * SLIDER_MIN_GAP)).toBe(SLIDER_MIN_GAP)
    expect(clampSliderEnd(SLIDER_MIN_GAP, SLIDER_MIN_GAP)).toBe(2 * SLIDER_MIN_GAP)
  })
})

describe("record filtering", () => {
  const records = [
    { id: "c", start_time: iso(NOW - 1 * DAY), operation_id: "op2" },
    { id: "a", start_time: iso(NOW - 5 * DAY), operation_id: "op1", operation_name: "Spray" },
    { id: "b", start_time: iso(NOW - 3 * DAY), operation_id: "op1" },
  ]

  it("filters by time window and operation", () => {
    expect(filterRecords(records, NOW - 4 * DAY, NOW).map((r) => r.id)).toEqual(["c", "b"])
    expect(filterRecords(records, 0, NOW, "op1").map((r) => r.id)).toEqual(["a", "b"])
  })

  it("sorts by start without mutating", () => {
    expect(sortByStart(records).map((r) => r.id)).toEqual(["a", "b", "c"])
    expect(records[0].id).toBe("c")
    expect(sortedRecordTimes(records)).toEqual([NOW - 5 * DAY, NOW - 3 * DAY, NOW - DAY])
  })

  it("lists operations by recency with counts", () => {
    expect(availableOperations(records)).toEqual([
      { id: "op2", name: "Unknown", count: 1, latest: NOW - DAY },
      { id: "op1", name: "Spray", count: 2, latest: NOW - 3 * DAY },
    ])
  })
})

describe("matchedRecordMap", () => {
  it("maps each clustered record to its matched activity", () => {
    const m = matchedRecordMap([
      {
        confidence: "high",
        type: "plan",
        activity: { attributes: { name: "Pre-em" } },
        cluster: { records: [{ id: "r1" }, { trail_id: "t2" }] },
      },
      {
        confidence: "none",
        type: "actual",
        activity: { attributes: { name: "Ignored" } },
        cluster: { records: [{ id: "r3" }] },
      },
    ] as any)
    expect(m.get("r1")).toEqual({ name: "Pre-em", type: "Plan" })
    expect(m.get("t2")).toEqual({ name: "Pre-em", type: "Plan" })
    expect(m.has("r3")).toBe(false)
  })
})
