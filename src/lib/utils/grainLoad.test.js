import { describe, it, expect } from "vitest"
import {
  CHASER_BIN_DEFAULT_CAPACITY,
  binFreeTonnes,
  binStoredTonnes,
  chaserCapacity,
  chaserLoad,
  formatTonnes,
  isChaserBinType,
  planTransfer,
} from "./grainLoad"

describe("isChaserBinType", () => {
  it("recognises both chaser bin machines", () => {
    expect(isChaserBinType("FrontWheelChaserBin")).toBe(true)
    expect(isChaserBinType("FourWheelDriveChaserBin")).toBe(true)
  })

  it("rejects every other machine (and missing values)", () => {
    expect(isChaserBinType("CombineHarvester")).toBe(false)
    expect(isChaserBinType("")).toBe(false)
    expect(isChaserBinType(null)).toBe(false)
    expect(isChaserBinType(undefined)).toBe(false)
  })
})

describe("chaserCapacity / chaserLoad", () => {
  it("falls back to the default tank size", () => {
    expect(chaserCapacity(null)).toBe(CHASER_BIN_DEFAULT_CAPACITY)
    expect(chaserCapacity({})).toBe(CHASER_BIN_DEFAULT_CAPACITY)
    expect(chaserCapacity({ grainCapacity: 0 })).toBe(CHASER_BIN_DEFAULT_CAPACITY)
  })

  it("uses a stored tank size", () => {
    expect(chaserCapacity({ grainCapacity: 55 })).toBe(55)
  })

  it("reads a load and clamps it to the tank", () => {
    expect(chaserLoad({ grainLoad: 12.5 })).toBe(12.5)
    expect(chaserLoad({ grainLoad: 999, grainCapacity: 40 })).toBe(40)
    expect(chaserLoad({ grainLoad: -3 })).toBe(0)
    expect(chaserLoad({})).toBe(0)
    expect(chaserLoad(null)).toBe(0)
  })
})

describe("bin tonnes", () => {
  it("converts fill% to stored tonnes", () => {
    expect(binStoredTonnes(100, 50)).toBe(50)
    expect(binStoredTonnes(300, 33.333)).toBe(100)
    expect(binStoredTonnes(0, 80)).toBe(0)
  })

  it("reports free space", () => {
    expect(binFreeTonnes(100, 25)).toBe(75)
    expect(binFreeTonnes(100, 100)).toBe(0)
    expect(binFreeTonnes(0, 0)).toBe(0)
  })
})

describe("planTransfer", () => {
  it("empties the whole chaser when the bin has room", () => {
    const plan = planTransfer({ loadTonnes: 30, binFill: 20, binCapacity: 100 })
    expect(plan.moved).toBe(30)
    expect(plan.loadAfter).toBe(0)
    expect(plan.binStoredAfter).toBe(50)
    expect(plan.binFillAfter).toBe(50)
    expect(plan.overflows).toBe(false)
  })

  it("moves only what fits and leaves the rest in the chaser", () => {
    const plan = planTransfer({ loadTonnes: 40, binFill: 90, binCapacity: 100 })
    expect(plan.binRoom).toBe(10)
    expect(plan.moved).toBe(10)
    expect(plan.loadAfter).toBe(30)
    expect(plan.binFillAfter).toBe(100)
    expect(plan.overflows).toBe(true)
  })

  it("moves nothing into a full bin or from an empty chaser", () => {
    expect(planTransfer({ loadTonnes: 20, binFill: 100, binCapacity: 100 }).moved).toBe(0)
    expect(planTransfer({ loadTonnes: 0, binFill: 10, binCapacity: 100 }).moved).toBe(0)
  })

  it("keeps the fill a precise float instead of snapping to whole %", () => {
    // 1 t into a 300 t bin is 0.33% — must not be rounded away.
    const plan = planTransfer({ loadTonnes: 1, binFill: 0, binCapacity: 300 })
    expect(plan.moved).toBe(1)
    expect(plan.binFillAfter).toBeCloseTo(0.3333, 3)
  })
})

describe("formatTonnes", () => {
  it("uses one decimal below 10 t and whole tonnes above", () => {
    expect(formatTonnes(4.25)).toBe("4.3 t")
    expect(formatTonnes(38.5)).toBe("39 t")
    expect(formatTonnes(0)).toBe("0.0 t")
  })
})
