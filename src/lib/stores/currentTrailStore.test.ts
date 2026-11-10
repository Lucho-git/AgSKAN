import { beforeEach, describe, expect, it } from "vitest"
import { get } from "svelte/store"
import {
  currentTrailStore,
  pendingClosuresStore,
  pendingCoordinatesStore,
  unsavedCoordinatesStore,
  unsavedTrailsStore,
  type PendingClosure,
  type PendingCoordinate,
  type Trail,
} from "./currentTrailStore"

const pending = (timestamp: number, trail_id = "t1"): PendingCoordinate =>
  ({
    trail_id,
    timestamp,
    coordinates: { latitude: -31, longitude: 115 },
  }) as PendingCoordinate

beforeEach(() => {
  currentTrailStore.reset()
  pendingCoordinatesStore.clear()
  pendingClosuresStore.clear()
  unsavedCoordinatesStore.clear()
  unsavedTrailsStore.clear()
})

describe("currentTrailStore", () => {
  it("appends coordinates without mutating the previous trail object", () => {
    const trail = { id: "t1", path: [] } as unknown as Trail
    currentTrailStore.set(trail)

    currentTrailStore.addCoordinate({
      latitude: 1,
      longitude: 2,
      timestamp: 3,
    } as any)

    expect(get(currentTrailStore)!.path).toHaveLength(1)
    expect(trail.path).toHaveLength(0)
  })

  it("ignores coordinates and end times when no trail is active", () => {
    currentTrailStore.addCoordinate({
      latitude: 1,
      longitude: 2,
      timestamp: 3,
    } as any)
    currentTrailStore.setEndTime("2026-11-10T00:00:00Z")
    expect(get(currentTrailStore)).toBeNull()
  })
})

describe("pendingCoordinatesStore", () => {
  it("removes acknowledged points by timestamp and keeps the rest in order", () => {
    ;[1, 2, 3, 4].forEach((t) => pendingCoordinatesStore.add(pending(t)))

    pendingCoordinatesStore.remove([pending(2), pending(4)])

    expect(get(pendingCoordinatesStore).map((c) => c.timestamp)).toEqual([1, 3])
  })
})

describe("pendingClosuresStore", () => {
  it("removes a closure by trail id only", () => {
    pendingClosuresStore.add({ trailId: "a" } as PendingClosure)
    pendingClosuresStore.add({ trailId: "b" } as PendingClosure)

    pendingClosuresStore.remove("a")

    expect(get(pendingClosuresStore).map((c) => c.trailId)).toEqual(["b"])
  })
})

describe("unsavedTrailsStore", () => {
  it("removes trails by trail_id", () => {
    unsavedTrailsStore.add({ trail_id: "a" } as any)
    unsavedTrailsStore.add({ trail_id: "b" } as any)

    unsavedTrailsStore.remove({ trail_id: "a" } as any)

    expect(get(unsavedTrailsStore).map((t) => t.trail_id)).toEqual(["b"])
  })
})
