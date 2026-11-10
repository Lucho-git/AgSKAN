// src/lib/services/backgroundTrailMerge.ts
// While the app is backgrounded the native layer POSTs trail points straight
// to trail_stream, so the in-memory trail misses them. On return to the
// foreground we fetch them and merge the ones we don't already have.

/* eslint-disable @typescript-eslint/no-explicit-any -- supabase client is untyped here */

export interface TrailPathPoint {
  coordinates: { latitude: number; longitude: number }
  timestamp: number
}

interface TrailStreamRow {
  coordinate: { coordinates: [number, number] }
  timestamp: string | number
}

const toMs = (t: string | number) =>
  typeof t === "string" ? new Date(t).getTime() : t

/** trail_stream rows whose timestamps aren't already in `existing`. */
export function newPointsFromStream(
  rows: TrailStreamRow[],
  existing: Array<{ timestamp: number }>,
): TrailPathPoint[] {
  const seen = new Set(existing.map((p) => p.timestamp))
  return rows
    .filter((row) => !seen.has(toMs(row.timestamp)))
    .map((row) => ({
      coordinates: {
        latitude: row.coordinate.coordinates[1],
        longitude: row.coordinate.coordinates[0],
      },
      timestamp: toMs(row.timestamp),
    }))
}

/** Existing path + new points, sorted by time. */
export function mergeTrailPath<T extends { timestamp: number }>(
  path: T[] | null | undefined,
  newPoints: T[],
): T[] {
  return [...(path || []), ...newPoints].sort(
    (a, b) => a.timestamp - b.timestamp,
  )
}

/**
 * Fetch trail_stream points for the trail and return the ones missing from
 * its path. `total` is how many rows the server had (0 on error / none).
 */
export async function fetchMissingTrailPoints(
  client: any,
  trail: { id: string; path?: Array<{ timestamp: number }> | null },
): Promise<{ total: number; newPoints: TrailPathPoint[] }> {
  const { data, error } = await client
    .from("trail_stream")
    .select("coordinate, timestamp")
    .eq("trail_id", trail.id)
    .order("timestamp", { ascending: true })

  if (error || !data || data.length === 0) return { total: 0, newPoints: [] }
  return {
    total: data.length,
    newPoints: newPointsFromStream(data, trail.path || []),
  }
}
