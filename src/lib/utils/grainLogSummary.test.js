import { describe, it, expect } from "vitest"
import {
  formatFill,
  formatLogTonnes,
  grainLogSummary,
  transferMovedTonnes,
} from "./grainLogSummary"

const binLevel = (overrides = {}) => ({
  action: "bin.level",
  bin_name: "Field Bin 3",
  vehicle_name: null,
  tonnes_before: 30,
  tonnes_after: 42,
  bin_fill_before: 30,
  bin_fill_after: 42,
  ...overrides,
})

describe("formatFill / formatLogTonnes", () => {
  it("rounds fill to whole percent and tonnes to one decimal", () => {
    expect(formatFill(41.66)).toBe("42%")
    expect(formatLogTonnes(38.54)).toBe("38.5 t")
    expect(formatLogTonnes(undefined)).toBe("—")
    expect(formatFill(null)).toBe("—")
  })
})

describe("grainLogSummary", () => {
  it("describes a bin level change with its delta", () => {
    expect(grainLogSummary(binLevel())).toEqual({
      title: "Field Bin 3",
      detail: "42% · 42.0 t (+12 t)",
    })
  })

  it("describes taking grain out of a bin", () => {
    const summary = grainLogSummary(
      binLevel({ tonnes_before: 42, tonnes_after: 30, bin_fill_after: 30 }),
    )
    expect(summary.detail).toBe("30% · 30.0 t (−12 t)")
  })

  it("describes a chaser level change", () => {
    const summary = grainLogSummary({
      action: "chaser.level",
      vehicle_name: "FWD Chaser",
      tonnes_before: 0,
      tonnes_after: 22.5,
    })
    expect(summary).toEqual({
      title: "FWD Chaser",
      detail: "Load 22.5 t (+22.5 t)",
    })
  })

  it("describes a transfer, including what was left behind", () => {
    const summary = grainLogSummary({
      action: "chaser.empty",
      bin_name: "Field Bin 3",
      vehicle_name: "FWD Chaser",
      tonnes_before: 40,
      tonnes_after: 5,
      bin_fill_before: 10,
      bin_fill_after: 55,
    })
    expect(summary.title).toBe("FWD Chaser → Field Bin 3")
    expect(summary.detail).toBe("Moved 35.0 t · bin now 55% · 5.0 t left in chaser")
  })

  it("omits the leftover note when the chaser is emptied completely", () => {
    const summary = grainLogSummary({
      action: "chaser.empty",
      bin_name: "Field Bin 3",
      vehicle_name: "FWD Chaser",
      tonnes_before: 40,
      tonnes_after: 0,
      bin_fill_after: 50,
    })
    expect(summary.detail).toBe("Moved 40.0 t · bin now 50%")
  })

  it("falls back to generic names for unnamed rows", () => {
    const summary = grainLogSummary({ action: "chaser.empty" })
    expect(summary.title).toBe("Chaser bin → Bin")
    expect(summary.detail).toContain("Emptied")
  })
})

describe("transferMovedTonnes", () => {
  it("is the drop in the chaser's load, never negative", () => {
    expect(transferMovedTonnes({ tonnes_before: 40, tonnes_after: 12.5 })).toBe(27.5)
    expect(transferMovedTonnes({ tonnes_before: 10, tonnes_after: 20 })).toBe(0)
    expect(Number.isNaN(transferMovedTonnes({}))).toBe(true)
  })
})
