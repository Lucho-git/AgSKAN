// trailPauseSplit.ts
// Pause-break helpers for trails.
//
// A paused trail has a gap in its recorded points (recording stops on pause,
// resumes later). These utilities split an ordered point list into parts at
// pause boundaries so the geometry can be stored/rendered as a
// LINESTRING / MULTILINESTRING pair of parts WITHOUT the phantom connector
// line between the pause and resume points.

export interface TrailPauseWindow {
    /** Pause time, epoch ms (client `Date.now()` at pause). */
    pausedAt: number
    /** Resume time, epoch ms, or null/undefined while still paused. */
    resumedAt?: number | null
}

export interface LatLngTimePoint {
    longitude: number
    latitude: number
    timestamp: number
}

/**
 * Split an ordered point list into parts at pause boundaries.
 * A break is inserted between points p[i] and p[i+1] when a pause's
 * `pausedAt` falls strictly between their timestamps (recording stopped at
 * the pause, so the last pre-pause point is before it and the first
 * post-resume point after it).
 */
export function splitPointsAtPauses<T extends { timestamp: number }>(
    points: T[],
    pauses?: TrailPauseWindow[] | null,
): T[][] {
    if (!points || points.length === 0) return []
    const cuts = (pauses ?? [])
        .map((p) => p.pausedAt)
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => a - b)

    if (cuts.length === 0 || points.length < 2) return [points.slice()]

    const parts: T[][] = []
    let current: T[] = [points[0]]
    for (let i = 1; i < points.length; i++) {
        const prevTs = points[i - 1].timestamp
        const curTs = points[i].timestamp
        const broken = cuts.some((t) => t > prevTs && t < curTs)
        if (broken) {
            parts.push(current)
            current = [points[i]]
        } else {
            current.push(points[i])
        }
    }
    parts.push(current)
    return parts
}

/** Keep only parts that can form a line segment (>= 2 points). */
export function usableParts<T>(parts: T[][]): T[][] {
    return parts.filter((p) => p.length >= 2)
}

/**
 * Build an EWKT path string from point parts.
 *  * 1 usable part  -> `SRID=4326;LINESTRING(...)`      (legacy shape)
 *  * 2+ usable parts -> `SRID=4326;MULTILINESTRING((...),(...))`
 * withM=true writes M values (epoch ms) for the detailed path.
 * Returns null when no usable part exists.
 */
export function buildEwktPath(
    parts: LatLngTimePoint[][],
    opts: { withM?: boolean } = {},
): string | null {
    const useable = usableParts(parts)
    if (useable.length === 0) return null

    const fmt = (p: LatLngTimePoint) =>
        opts.withM
            ? `${p.longitude} ${p.latitude} ${p.timestamp}`
            : `${p.longitude} ${p.latitude}`

    if (useable.length === 1) {
        return `SRID=4326;LINESTRING${opts.withM ? " M" : ""}(${useable[0].map(fmt).join(",")})`
    }

    const partsText = useable
        .map((part) => `(${part.map(fmt).join(",")})`)
        .join(",")
    return `SRID=4326;MULTILINESTRING${opts.withM ? " M" : ""}(${partsText})`
}

/**
 * Build a GeoJSON geometry from point parts (for immediate local rendering
 * right after a close, before the map re-fetches from the DB).
 */
export function buildGeoJsonPath(
    parts: { longitude: number; latitude: number }[][],
): { type: "LineString" | "MultiLineString"; coordinates: number[][] | number[][][] } | null {
    const useable = usableParts(parts as any[][]) as { longitude: number; latitude: number }[][]
    if (useable.length === 0) return null

    const toLngLat = (p: { longitude: number; latitude: number }) => [p.longitude, p.latitude]

    if (useable.length === 1) {
        return { type: "LineString", coordinates: useable[0].map(toLngLat) }
    }
    return { type: "MultiLineString", coordinates: useable.map((part) => part.map(toLngLat)) }
}

/**
 * Union local (possibly unsynced) pause windows with the DB rows.
 * Keyed by `pausedAt`; a locally-known `resumedAt` wins over a missing
 * remote one.
 */
export function mergePauseWindows(
    local: TrailPauseWindow[],
    remote: TrailPauseWindow[],
): TrailPauseWindow[] {
    const byPausedAt = new Map<number, TrailPauseWindow>()
    for (const p of remote ?? []) byPausedAt.set(p.pausedAt, { ...p })
    for (const p of local ?? []) {
        const existing = byPausedAt.get(p.pausedAt)
        byPausedAt.set(p.pausedAt, {
            pausedAt: p.pausedAt,
            resumedAt: p.resumedAt ?? existing?.resumedAt ?? null,
        })
    }
    return [...byPausedAt.values()].sort((a, b) => a.pausedAt - b.pausedAt)
}
