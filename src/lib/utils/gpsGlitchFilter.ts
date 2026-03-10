/**
 * GPS Glitch Filter
 *
 * Detects and removes GPS coordinate glitches from trail point arrays.
 * Used by closeTrailsService to clean trails on close, and by the batch
 * cleanup script (scripts/clean-trail-glitches.js).
 *
 * Four detection passes:
 *  1. Speed gate     — reject points implying >250 km/h within short time gaps
 *  2. Snap-back      — if a long-gap accepted point causes the next N points to
 *                       all reject, the accepted point was the glitch — roll back
 *  3. Isolation       — single points with both neighbors >500m away where the
 *                       neighbors are closer to each other than to the suspect
 *  4. Teleport        — jump-away-and-jump-back: big jump (>2km), followed by a
 *                       return within <30 points. Also trims leading/trailing
 *                       glitch points against the trail body consensus.
 */

// ── Thresholds ──
const GPS_MAX_SPEED_KMH = 250
const GPS_SPEED_GATE_MAX_GAP_S = 60
const SNAP_BACK_LOOK_AHEAD = 3
const ISOLATION_DISTANCE_M = 500
const TELEPORT_JUMP_M = 2000
const MAX_TELEPORT_WINDOW = 30

export interface GpsPoint {
    longitude: number
    latitude: number
    timestamp: number // epoch ms
}

interface GlitchInfo {
    index: number
    coord: { lat: number; lng: number }
    reason: string
}

// ── Haversine distance (metres) ──
function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const R = 6371000
    const toRad = (d: number) => (d * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Filter GPS glitches from an array of trail points.
 * Returns the cleaned array (glitch points removed).
 */
export function filterGpsGlitches(points: GpsPoint[]): {
    clean: GpsPoint[]
    glitchCount: number
} {
    if (points.length < 2) return { clean: [...points], glitchCount: 0 }

    const glitches: GlitchInfo[] = []

    // ── Pass 1: Speed gate + snap-back ──
    const pass1Clean: GpsPoint[] = [points[0]]
    let lastAccepted = points[0]

    let i = 1
    while (i < points.length) {
        const prev = lastAccepted
        const curr = points[i]
        const dist = haversineDistance(
            prev.latitude,
            prev.longitude,
            curr.latitude,
            curr.longitude,
        )

        let gapS: number | null = null
        let impliedSpeedKmh: number | null = null

        if (prev.timestamp != null && curr.timestamp != null) {
            gapS = (curr.timestamp - prev.timestamp) / 1000
            if (gapS > 0) {
                impliedSpeedKmh = (dist / gapS) * 3.6
            }
        }

        let rejected = false

        // Speed gate (only for gaps under threshold)
        if (
            impliedSpeedKmh != null &&
            gapS != null &&
            gapS > 0 &&
            gapS < GPS_SPEED_GATE_MAX_GAP_S &&
            impliedSpeedKmh > GPS_MAX_SPEED_KMH
        ) {
            rejected = true
            glitches.push({
                index: i,
                coord: { lat: curr.latitude, lng: curr.longitude },
                reason: `Speed ${Math.round(impliedSpeedKmh)} km/h`,
            })
        }

        // Distance-only fallback when no timestamps
        if (!rejected && impliedSpeedKmh == null && dist > 5000) {
            rejected = true
            glitches.push({
                index: i,
                coord: { lat: curr.latitude, lng: curr.longitude },
                reason: `Distance jump ${Math.round(dist)}m (no timestamps)`,
            })
        }

        if (rejected) {
            i++
        } else {
            // Snap-back: accepted after long gap + far jump — peek ahead
            const wasLongGap = gapS != null && gapS >= GPS_SPEED_GATE_MAX_GAP_S
            const wasDistantJump = dist > ISOLATION_DISTANCE_M

            if (wasLongGap && wasDistantJump) {
                let consecutiveRejections = 0
                for (
                    let j = i + 1;
                    j < Math.min(i + 1 + SNAP_BACK_LOOK_AHEAD, points.length);
                    j++
                ) {
                    const peekDist = haversineDistance(
                        curr.latitude,
                        curr.longitude,
                        points[j].latitude,
                        points[j].longitude,
                    )
                    let peekGapS: number | null = null
                    let peekSpeed: number | null = null
                    if (curr.timestamp != null && points[j].timestamp != null) {
                        peekGapS = (points[j].timestamp - curr.timestamp) / 1000
                        if (peekGapS > 0) peekSpeed = (peekDist / peekGapS) * 3.6
                    }
                    if (peekSpeed != null && peekSpeed > GPS_MAX_SPEED_KMH) {
                        consecutiveRejections++
                    } else {
                        break
                    }
                }

                if (consecutiveRejections >= SNAP_BACK_LOOK_AHEAD) {
                    glitches.push({
                        index: i,
                        coord: { lat: curr.latitude, lng: curr.longitude },
                        reason: `Snap-back after ${gapS!.toFixed(0)}s gap`,
                    })
                    i++
                    continue
                }
            }

            pass1Clean.push(curr)
            lastAccepted = curr
            i++
        }
    }

    // ── Pass 2: Isolation detector ──
    const pass2Clean: GpsPoint[] = []
    for (let k = 0; k < pass1Clean.length; k++) {
        const p = pass1Clean[k]

        if (k > 0 && k < pass1Clean.length - 1) {
            const prevP = pass1Clean[k - 1]
            const nextP = pass1Clean[k + 1]
            const distPrev = haversineDistance(
                prevP.latitude,
                prevP.longitude,
                p.latitude,
                p.longitude,
            )
            const distNext = haversineDistance(
                p.latitude,
                p.longitude,
                nextP.latitude,
                nextP.longitude,
            )

            if (distPrev > ISOLATION_DISTANCE_M && distNext > ISOLATION_DISTANCE_M) {
                const neighborDist = haversineDistance(
                    prevP.latitude,
                    prevP.longitude,
                    nextP.latitude,
                    nextP.longitude,
                )
                if (neighborDist < distPrev && neighborDist < distNext) {
                    glitches.push({
                        index: -1,
                        coord: { lat: p.latitude, lng: p.longitude },
                        reason: `Isolated outlier`,
                    })
                    continue
                }
            }
        }

        pass2Clean.push(p)
    }

    // ── Pass 3: Teleport (jump-back) detection ──
    const pass3Clean: GpsPoint[] = []
    let idx = 0

    while (idx < pass2Clean.length) {
        if (pass3Clean.length > 0) {
            const anchor = pass3Clean[pass3Clean.length - 1]
            const dist = haversineDistance(
                anchor.latitude,
                anchor.longitude,
                pass2Clean[idx].latitude,
                pass2Clean[idx].longitude,
            )

            if (dist > TELEPORT_JUMP_M) {
                // Large jump — collect teleport candidate window
                const window: GpsPoint[] = []
                let j = idx
                let returnedToAnchor = false

                while (j < pass2Clean.length && window.length < MAX_TELEPORT_WINDOW) {
                    const returnDist = haversineDistance(
                        anchor.latitude,
                        anchor.longitude,
                        pass2Clean[j].latitude,
                        pass2Clean[j].longitude,
                    )
                    if (returnDist <= TELEPORT_JUMP_M) {
                        returnedToAnchor = true
                        break
                    }
                    window.push(pass2Clean[j])
                    j++
                }

                if (returnedToAnchor && window.length > 0) {
                    for (const wp of window) {
                        glitches.push({
                            index: -3,
                            coord: { lat: wp.latitude, lng: wp.longitude },
                            reason: `Teleport: ${window.length}-pt cluster ${(dist / 1000).toFixed(1)}km away`,
                        })
                    }
                    idx = j
                    continue
                } else {
                    // Window too large or end of trail — accept as real drive
                    pass3Clean.push(pass2Clean[idx])
                    idx++
                    continue
                }
            }
        }

        pass3Clean.push(pass2Clean[idx])
        idx++
    }

    // ── Leading glitch check ──
    let leadTrim = 0
    if (pass3Clean.length >= 5) {
        const sampleEnd = Math.min(21, pass3Clean.length)
        const sampleLats = pass3Clean
            .slice(1, sampleEnd)
            .map((p) => p.latitude)
            .sort((a, b) => a - b)
        const sampleLngs = pass3Clean
            .slice(1, sampleEnd)
            .map((p) => p.longitude)
            .sort((a, b) => a - b)
        const medLat = sampleLats[Math.floor(sampleLats.length / 2)]
        const medLng = sampleLngs[Math.floor(sampleLngs.length / 2)]

        for (let k = 0; k < Math.min(5, pass3Clean.length - 1); k++) {
            const d = haversineDistance(
                pass3Clean[k].latitude,
                pass3Clean[k].longitude,
                medLat,
                medLng,
            )
            if (d > TELEPORT_JUMP_M) {
                glitches.push({
                    index: -3,
                    coord: { lat: pass3Clean[k].latitude, lng: pass3Clean[k].longitude },
                    reason: `Leading glitch: ${(d / 1000).toFixed(1)}km from trail body`,
                })
                leadTrim++
            } else {
                break
            }
        }
    }

    // ── Trailing glitch check ──
    let trailTrim = 0
    if (pass3Clean.length - leadTrim >= 5) {
        const sampleStart = Math.max(leadTrim, pass3Clean.length - 21)
        const sampleLats = pass3Clean
            .slice(sampleStart, pass3Clean.length - 1)
            .map((p) => p.latitude)
            .sort((a, b) => a - b)
        const sampleLngs = pass3Clean
            .slice(sampleStart, pass3Clean.length - 1)
            .map((p) => p.longitude)
            .sort((a, b) => a - b)
        const medLat = sampleLats[Math.floor(sampleLats.length / 2)]
        const medLng = sampleLngs[Math.floor(sampleLngs.length / 2)]

        for (
            let k = pass3Clean.length - 1;
            k >= Math.max(leadTrim, pass3Clean.length - 5);
            k--
        ) {
            const d = haversineDistance(
                pass3Clean[k].latitude,
                pass3Clean[k].longitude,
                medLat,
                medLng,
            )
            if (d > TELEPORT_JUMP_M) {
                glitches.push({
                    index: -3,
                    coord: { lat: pass3Clean[k].latitude, lng: pass3Clean[k].longitude },
                    reason: `Trailing glitch: ${(d / 1000).toFixed(1)}km from trail body`,
                })
                trailTrim++
            } else {
                break
            }
        }
    }

    const finalClean = pass3Clean.slice(
        leadTrim,
        trailTrim > 0 ? pass3Clean.length - trailTrim : undefined,
    )

    return { clean: finalClean, glitchCount: glitches.length }
}
