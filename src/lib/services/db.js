// src/lib/services/db.js
import Dexie from "dexie"

export const db = new Dexie("VehicleTrackerDB")

// v1: legacy TrailData table (unused)
// v2: durable offline queues for crash-safe sync
db.version(1).stores({
  TrailData: "++id, vehicleId, timestamp, coordinates, synced",
})

db.version(2).stores({
  TrailData: "++id, vehicleId, timestamp, coordinates, synced",
  PendingCoordinates: "++id, trailId, timestamp",
  PendingClosures: "++id, trailId",
  PendingMarkerChanges: "id",
  PendingMarkerDeletions: "id",
})

// ── Trail coordinate queue helpers ──────────────────────────────

/**
 * Write a coordinate to IndexedDB (write-ahead log).
 * Returns the auto-incremented row ID so it can be deleted on successful send.
 * @param {{ coordinates: { latitude: number, longitude: number }, timestamp: number, trail_id: string }} coord
 * @returns {Promise<number|null>} row ID, or null on failure
 */
export async function persistPendingCoordinate(coord) {
  try {
    const id = await db.PendingCoordinates.add({
      trailId: coord.trail_id,
      timestamp: coord.timestamp,
      latitude: coord.coordinates.latitude,
      longitude: coord.coordinates.longitude,
    })
    return id
  } catch (e) {
    console.warn("⚠️ Failed to persist pending coordinate to IndexedDB:", e)
    return null
  }
}

/**
 * Delete a single persisted coordinate by its IndexedDB row ID.
 * Used to clean up after a successful network send (write-ahead acknowledgement).
 * @param {number} rowId
 */
export async function deletePersistedCoordinate(rowId) {
  try {
    await db.PendingCoordinates.delete(rowId)
  } catch (e) {
    console.warn("⚠️ Failed to delete persisted coordinate:", e)
  }
}

/**
 * Remove successfully-synced coordinates for a trail from IndexedDB.
 * @param {string} trailId
 */
export async function clearPersistedCoordinates(trailId) {
  try {
    await db.PendingCoordinates.where("trailId").equals(trailId).delete()
  } catch (e) {
    console.warn("⚠️ Failed to clear persisted coordinates:", e)
  }
}

/**
 * Load all pending coordinates from IndexedDB → PendingCoordinate format.
 * @returns {Promise<Array<{ coordinates: { latitude: number, longitude: number }, timestamp: number, trail_id: string }>>}
 */
export async function loadPersistedCoordinates() {
  try {
    const rows = await db.PendingCoordinates.toArray()
    return rows.map((r) => ({
      coordinates: { latitude: r.latitude, longitude: r.longitude },
      timestamp: r.timestamp,
      trail_id: r.trailId,
    }))
  } catch (e) {
    console.warn("⚠️ Failed to load persisted coordinates:", e)
    return []
  }
}

// ── Trail closure queue helpers ─────────────────────────────────

/**
 * Persist a failed trail closure to IndexedDB.
 * @param {object} closure  PendingClosure shape from currentTrailStore
 */
export async function persistPendingClosure(closure) {
  try {
    await db.PendingClosures.add({
      trailId: closure.trailId,
      payload: JSON.stringify(closure),
    })
  } catch (e) {
    console.warn("⚠️ Failed to persist pending closure to IndexedDB:", e)
  }
}

/**
 * Remove a successfully-synced closure from IndexedDB.
 * @param {string} trailId
 */
export async function clearPersistedClosure(trailId) {
  try {
    await db.PendingClosures.where("trailId").equals(trailId).delete()
  } catch (e) {
    console.warn("⚠️ Failed to clear persisted closure:", e)
  }
}

/**
 * Load all pending closures from IndexedDB.
 * @returns {Promise<Array>}
 */
export async function loadPersistedClosures() {
  try {
    const rows = await db.PendingClosures.toArray()
    return rows.map((r) => JSON.parse(r.payload))
  } catch (e) {
    console.warn("⚠️ Failed to load persisted closures:", e)
    return []
  }
}

// ── Marker change queue helpers ─────────────────────────────────

/**
 * Persist a marker change (add/update) to IndexedDB.
 * @param {object} marker  Full marker object { id, coordinates, iconClass, notes, created_at, … }
 */
export async function persistPendingMarkerChange(marker) {
  try {
    await db.PendingMarkerChanges.put({
      id: marker.id,
      payload: JSON.stringify(marker),
    })
  } catch (e) {
    console.warn("⚠️ Failed to persist pending marker change:", e)
  }
}

/**
 * Remove a successfully-synced marker change from IndexedDB.
 * @param {string} markerId
 */
export async function clearPersistedMarkerChange(markerId) {
  try {
    await db.PendingMarkerChanges.delete(markerId)
  } catch (e) {
    console.warn("⚠️ Failed to clear persisted marker change:", e)
  }
}

/**
 * Load all pending marker changes from IndexedDB.
 * @returns {Promise<Array>}
 */
export async function loadPersistedMarkerChanges() {
  try {
    const rows = await db.PendingMarkerChanges.toArray()
    return rows.map((r) => JSON.parse(r.payload))
  } catch (e) {
    console.warn("⚠️ Failed to load persisted marker changes:", e)
    return []
  }
}

/**
 * Persist a marker deletion to IndexedDB.
 * @param {string} markerId
 */
export async function persistPendingMarkerDeletion(markerId) {
  try {
    await db.PendingMarkerDeletions.put({ id: markerId })
  } catch (e) {
    console.warn("⚠️ Failed to persist pending marker deletion:", e)
  }
}

/**
 * Remove a successfully-synced marker deletion from IndexedDB.
 * @param {string} markerId
 */
export async function clearPersistedMarkerDeletion(markerId) {
  try {
    await db.PendingMarkerDeletions.delete(markerId)
  } catch (e) {
    console.warn("⚠️ Failed to clear persisted marker deletion:", e)
  }
}

/**
 * Load all pending marker deletion IDs from IndexedDB.
 * @returns {Promise<string[]>}
 */
export async function loadPersistedMarkerDeletions() {
  try {
    const rows = await db.PendingMarkerDeletions.toArray()
    return rows.map((r) => r.id)
  } catch (e) {
    console.warn("⚠️ Failed to load persisted marker deletions:", e)
    return []
  }
}

/**
 * Clear ALL persisted marker queues (called after a full successful sync).
 */
export async function clearAllPersistedMarkerData() {
  try {
    await Promise.all([
      db.PendingMarkerChanges.clear(),
      db.PendingMarkerDeletions.clear(),
    ])
  } catch (e) {
    console.warn("⚠️ Failed to clear persisted marker data:", e)
  }
}

/**
 * Nuclear reset: clear ALL IndexedDB tables (trail coordinates, closures, markers).
 * Used to reset to a clean testing state.
 */
export async function clearAllPersistedData() {
  try {
    await Promise.all([
      db.PendingCoordinates.clear(),
      db.PendingClosures.clear(),
      db.PendingMarkerChanges.clear(),
      db.PendingMarkerDeletions.clear(),
      db.TrailData.clear(),
    ])
    console.log("🗑️ All IndexedDB tables cleared")
  } catch (e) {
    console.warn("⚠️ Failed to clear all persisted data:", e)
  }
}
