// @ts-nocheck -- plain-JS test; the module under test is untyped JS
// Offline write-ahead queues (IndexedDB via Dexie). These are what keep trail
// points, closures and marker edits alive across app kills and dead zones, so
// the round-trips and the clean-up semantics are what matter here.
import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearAllPersistedData,
  clearAllPersistedMarkerData,
  clearPersistedClosure,
  clearPersistedCoordinates,
  clearPersistedMarkerChange,
  clearPersistedMarkerDeletion,
  db,
  deletePersistedCoordinate,
  loadPersistedClosures,
  loadPersistedCoordinates,
  loadPersistedMarkerChanges,
  loadPersistedMarkerDeletions,
  persistPendingClosure,
  persistPendingCoordinate,
  persistPendingMarkerChange,
  persistPendingMarkerDeletion,
} from "./db.js"

const coord = (trail_id, timestamp, latitude = -31.95, longitude = 115.86) => ({
  trail_id,
  timestamp,
  coordinates: { latitude, longitude },
})

beforeEach(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  await clearAllPersistedData()
})

describe("pending coordinates", () => {
  it("round-trips coordinates in the PendingCoordinate shape", async () => {
    await persistPendingCoordinate(coord("t1", 1000, -31.1, 115.1))
    await persistPendingCoordinate(coord("t1", 2000, -31.2, 115.2))

    expect(await loadPersistedCoordinates()).toEqual([
      coord("t1", 1000, -31.1, 115.1),
      coord("t1", 2000, -31.2, 115.2),
    ])
  })

  it("returns a row id that acknowledges exactly that point", async () => {
    const a = await persistPendingCoordinate(coord("t1", 1000))
    const b = await persistPendingCoordinate(coord("t1", 2000))
    expect(typeof a).toBe("number")
    expect(b).not.toBe(a)

    await deletePersistedCoordinate(a)

    expect((await loadPersistedCoordinates()).map((c) => c.timestamp)).toEqual([
      2000,
    ])
  })

  it("clears one trail without touching another trail's backlog", async () => {
    await persistPendingCoordinate(coord("t1", 1))
    await persistPendingCoordinate(coord("t2", 2))
    await persistPendingCoordinate(coord("t1", 3))

    await clearPersistedCoordinates("t1")

    expect(await loadPersistedCoordinates()).toEqual([coord("t2", 2)])
  })

  it("returns null instead of throwing when the write fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const add = vi
      .spyOn(db.PendingCoordinates, "add")
      .mockRejectedValueOnce(new Error("quota"))

    expect(await persistPendingCoordinate(coord("t1", 1))).toBeNull()
    expect(warn).toHaveBeenCalled()
    add.mockRestore()
  })

  it("loads an empty list instead of throwing when the read fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const toArray = vi
      .spyOn(db.PendingCoordinates, "toArray")
      .mockRejectedValueOnce(new Error("x"))

    expect(await loadPersistedCoordinates()).toEqual([])
    toArray.mockRestore()
  })
})

describe("pending closures", () => {
  const closure = (trailId, extra = {}) => ({
    trailId,
    endTime: "2026-11-10T03:00:00.000Z",
    path: [{ latitude: -31, longitude: 115, timestamp: 1 }],
    ...extra,
  })

  it("round-trips the whole closure payload", async () => {
    const c = closure("t1", { pauses: [{ start: 1, end: 2 }] })
    await persistPendingClosure(c)

    expect(await loadPersistedClosures()).toEqual([c])
  })

  it("clears only the closure for the given trail", async () => {
    await persistPendingClosure(closure("t1"))
    await persistPendingClosure(closure("t2"))

    await clearPersistedClosure("t1")

    expect((await loadPersistedClosures()).map((c) => c.trailId)).toEqual([
      "t2",
    ])
  })
})

describe("pending marker changes and deletions", () => {
  it("keeps only the latest edit per marker id", async () => {
    await persistPendingMarkerChange({ id: "m1", notes: "first" })
    await persistPendingMarkerChange({ id: "m1", notes: "second" })
    await persistPendingMarkerChange({ id: "m2", notes: "other" })

    const changes = await loadPersistedMarkerChanges()
    expect(changes).toHaveLength(2)
    expect(changes.find((m) => m.id === "m1").notes).toBe("second")
  })

  it("clears a single synced marker change", async () => {
    await persistPendingMarkerChange({ id: "m1" })
    await persistPendingMarkerChange({ id: "m2" })

    await clearPersistedMarkerChange("m1")

    expect((await loadPersistedMarkerChanges()).map((m) => m.id)).toEqual([
      "m2",
    ])
  })

  it("dedupes deletions and clears them individually", async () => {
    await persistPendingMarkerDeletion("m1")
    await persistPendingMarkerDeletion("m1")
    await persistPendingMarkerDeletion("m2")
    expect((await loadPersistedMarkerDeletions()).sort()).toEqual(["m1", "m2"])

    await clearPersistedMarkerDeletion("m1")
    expect(await loadPersistedMarkerDeletions()).toEqual(["m2"])
  })

  it("clearAllPersistedMarkerData leaves trail queues alone", async () => {
    await persistPendingMarkerChange({ id: "m1" })
    await persistPendingMarkerDeletion("m2")
    await persistPendingCoordinate(coord("t1", 1))
    await persistPendingClosure({ trailId: "t1" })

    await clearAllPersistedMarkerData()

    expect(await loadPersistedMarkerChanges()).toEqual([])
    expect(await loadPersistedMarkerDeletions()).toEqual([])
    expect(await loadPersistedCoordinates()).toHaveLength(1)
    expect(await loadPersistedClosures()).toHaveLength(1)
  })
})

it("clearAllPersistedData empties every queue", async () => {
  await persistPendingCoordinate(coord("t1", 1))
  await persistPendingClosure({ trailId: "t1" })
  await persistPendingMarkerChange({ id: "m1" })
  await persistPendingMarkerDeletion("m2")

  await clearAllPersistedData()

  expect(await loadPersistedCoordinates()).toEqual([])
  expect(await loadPersistedClosures()).toEqual([])
  expect(await loadPersistedMarkerChanges()).toEqual([])
  expect(await loadPersistedMarkerDeletions()).toEqual([])
})
