/**
 * clean-trail-glitches.js
 *
 * Comprehensive trail glitch detection and cleanup script.
 * Parses detailed_path (LINESTRING M with timestamps), detects GPS glitches
 * using the same hybrid filter as VehicleTracker, and optionally rewrites
 * both detailed_path (glitch-free) and path (re-simplified) to the database.
 *
 * DRY RUN (default):
 *   node scripts/clean-trail-glitches.js <master_map_id>
 *
 * WRITE MODE:
 *   node scripts/clean-trail-glitches.js <master_map_id> --write
 *
 * Single operation filter:
 *   node scripts/clean-trail-glitches.js <master_map_id> --operation "Ripping"
 *   node scripts/clean-trail-glitches.js <master_map_id> --operation "Ripping" --write
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import wkx from 'wkx'
import { simplifyPath } from '../src/lib/utils/pathSimplification.js'

dotenv.config()

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE
)

// ── Filter thresholds (mirrors VehicleTracker) ──
const GPS_MAX_SPEED_KMH = 250
const GPS_SPEED_GATE_MAX_GAP_S = 60

// ── CLI args ──
const args = process.argv.slice(2)
const masterMapId = args.find((a) => !a.startsWith('--'))
const writeMode = args.includes('--write')
const opFlagIdx = args.indexOf('--operation')
const operationFilter = opFlagIdx !== -1 ? args[opFlagIdx + 1] : null

if (!masterMapId) {
  console.error(`Usage:
  node scripts/clean-trail-glitches.js <master_map_id>                         (dry run)
  node scripts/clean-trail-glitches.js <master_map_id> --write                 (writes cleaned data)
  node scripts/clean-trail-glitches.js <master_map_id> --operation "Name"      (filter to one operation)`)
  process.exit(1)
}

// ── Haversine distance (metres) ──
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Parse a PostGIS hex WKB into an array of { lng, lat, timestamp } objects.
 */
function parseDetailedPath(rawPath) {
  if (!rawPath) return []
  try {
    const geometry = wkx.Geometry.parse(Buffer.from(rawPath, 'hex'))
    if (geometry.points) {
      return geometry.points.map((p) => ({
        lng: p.x,
        lat: p.y,
        timestamp: p.m || null,
      }))
    }
    return []
  } catch (e) {
    console.error('  ⚠️ Error parsing detailed_path:', e.message)
    return []
  }
}

function parsePath(rawPath) {
  if (!rawPath) return []
  try {
    const geometry = wkx.Geometry.parse(Buffer.from(rawPath, 'hex'))
    if (geometry.points) {
      return geometry.points.map((p) => ({ lng: p.x, lat: p.y }))
    }
    const geoJSON = geometry.toGeoJSON()
    if (geoJSON.coordinates) {
      return geoJSON.coordinates.map((c) => ({ lng: c[0], lat: c[1] }))
    }
    return []
  } catch (e) {
    return []
  }
}

/**
 * Run the GPS glitch filter on an array of points.
 * Returns { clean: Point[], glitches: GlitchInfo[] }
 *
 * Three detection methods:
 *  1. Speed gate — reject points implying >250 km/h within short time gaps
 *  2. Snap-back  — if a long-gap point is accepted but the next N points all
 *                  reject at high speed, the accepted point was the glitch
 *  3. Isolation  — if a point's previous AND next neighbors are both >ISOLATION_M
 *                  away, it's an orphan outlier (catches already-cleaned data
 *                  where bursts were removed but the anchor glitch remained)
 *  4. Teleport   — detects jump-away-and-jump-back patterns. If a large jump
 *                  (>2km) is followed by a return to the departure area within
 *                  a short window (<30 pts), the window is a glitch cluster.
 *                  Also checks leading/trailing points against the trail body.
 *                  A real drive (paddock change, home) has 100s of points and
 *                  never triggers. Directly mirrorable in real-time as a buffer.
 */
const SNAP_BACK_LOOK_AHEAD = 3
const ISOLATION_DISTANCE_M = 500 // Both neighbors must be this far to flag isolation
const TELEPORT_JUMP_M = 2000    // Min distance to trigger teleport detection
const MAX_TELEPORT_WINDOW = 30  // If > 30 consecutive far-away points, it's a real drive

function filterGlitches(points) {
  if (points.length < 2) return { clean: [...points], glitches: [] }

  // ── Pass 1: Speed gate + snap-back ──
  const pass1Clean = [points[0]]
  const glitches = []
  let lastAccepted = points[0]

  let i = 1
  while (i < points.length) {
    const prev = lastAccepted
    const curr = points[i]
    const dist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng)

    let gapS = null
    let impliedSpeedKmh = null

    if (prev.timestamp != null && curr.timestamp != null) {
      gapS = (curr.timestamp - prev.timestamp) / 1000
      if (gapS > 0) {
        impliedSpeedKmh = (dist / gapS) * 3.6
      }
    }

    let rejected = false
    let reason = ''

    // Speed gate (only for gaps under threshold)
    if (
      impliedSpeedKmh != null &&
      gapS > 0 &&
      gapS < GPS_SPEED_GATE_MAX_GAP_S &&
      impliedSpeedKmh > GPS_MAX_SPEED_KMH
    ) {
      rejected = true
      reason = `Speed ${Math.round(impliedSpeedKmh)} km/h over ${gapS.toFixed(1)}s (${Math.round(dist)}m)`
    }

    // Distance-only fallback when no timestamps
    if (!rejected && impliedSpeedKmh == null && dist > 5000) {
      rejected = true
      reason = `Distance jump ${Math.round(dist)}m (no timestamps)`
    }

    if (rejected) {
      glitches.push({
        index: i,
        coord: { lat: curr.lat, lng: curr.lng },
        from: { lat: prev.lat, lng: prev.lng },
        distance: Math.round(dist),
        speedKmh: impliedSpeedKmh != null ? Math.round(impliedSpeedKmh) : null,
        gapS: gapS != null ? parseFloat(gapS.toFixed(1)) : null,
        timestamp: curr.timestamp ? new Date(curr.timestamp).toISOString() : `point #${i}`,
        reason,
      })
      i++
    } else {
      // Snap-back: accepted after long gap + far jump — peek ahead
      const wasLongGap = gapS != null && gapS >= GPS_SPEED_GATE_MAX_GAP_S
      const wasDistantJump = dist > ISOLATION_DISTANCE_M

      if (wasLongGap && wasDistantJump) {
        let consecutiveRejections = 0
        for (let j = i + 1; j < Math.min(i + 1 + SNAP_BACK_LOOK_AHEAD, points.length); j++) {
          const peekDist = haversineDistance(curr.lat, curr.lng, points[j].lat, points[j].lng)
          let peekGapS = null, peekSpeed = null
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
            coord: { lat: curr.lat, lng: curr.lng },
            from: { lat: prev.lat, lng: prev.lng },
            distance: Math.round(dist),
            speedKmh: impliedSpeedKmh != null ? Math.round(impliedSpeedKmh) : null,
            gapS: gapS != null ? parseFloat(gapS.toFixed(1)) : null,
            timestamp: curr.timestamp ? new Date(curr.timestamp).toISOString() : `point #${i}`,
            reason: `Snap-back: ${Math.round(dist)}m jump after ${gapS.toFixed(0)}s gap, next ${consecutiveRejections} pts reject at high speed`,
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
  // Catches orphan glitch points where both neighbors are far away.
  // This handles data that was previously "cleaned" but left the anchor glitch.
  const pass2Clean = []
  for (let k = 0; k < pass1Clean.length; k++) {
    const p = pass1Clean[k]

    if (k > 0 && k < pass1Clean.length - 1) {
      const prevP = pass1Clean[k - 1]
      const nextP = pass1Clean[k + 1]
      const distPrev = haversineDistance(prevP.lat, prevP.lng, p.lat, p.lng)
      const distNext = haversineDistance(p.lat, p.lng, nextP.lat, nextP.lng)

      // Both neighbors are far AND the neighbors are close to each other
      if (distPrev > ISOLATION_DISTANCE_M && distNext > ISOLATION_DISTANCE_M) {
        const neighborDist = haversineDistance(prevP.lat, prevP.lng, nextP.lat, nextP.lng)
        // The neighbors should be closer to each other than either is to this point
        if (neighborDist < distPrev && neighborDist < distNext) {
          glitches.push({
            index: -1, // pass2, original index unknown
            coord: { lat: p.lat, lng: p.lng },
            from: { lat: prevP.lat, lng: prevP.lng },
            distance: Math.round(distPrev),
            speedKmh: null,
            gapS: null,
            timestamp: p.timestamp ? new Date(p.timestamp).toISOString() : '?',
            reason: `Isolated outlier: ${Math.round(distPrev)}m from prev, ${Math.round(distNext)}m from next, neighbors only ${Math.round(neighborDist)}m apart`,
          })
          continue // Skip this point
        }
      }
    }

    pass2Clean.push(p)
  }

  // ── Pass 3: Teleport (jump-back) detection ──
  // A GPS glitch is a ROUND TRIP — it teleports away and comes back.
  // A real drive is ONE-WAY — you leave and stay (or take 100s of points
  // to return). So: on each big jump, buffer a window. If the trail returns
  // within MAX_TELEPORT_WINDOW points, those buffered points are glitches.
  // If the window grows past the limit, accept as a real drive.
  //
  // This mirrors real-time: buffer suspect points after a big jump,
  // flush as glitches on return, flush as accepted if buffer grows large.
  const pass3Clean = []
  let idx = 0

  while (idx < pass2Clean.length) {
    if (pass3Clean.length > 0) {
      const anchor = pass3Clean[pass3Clean.length - 1]
      const dist = haversineDistance(anchor.lat, anchor.lng, pass2Clean[idx].lat, pass2Clean[idx].lng)

      if (dist > TELEPORT_JUMP_M) {
        // Large jump — collect teleport candidate window
        const window = []
        let j = idx
        let returnedToAnchor = false

        while (j < pass2Clean.length && window.length < MAX_TELEPORT_WINDOW) {
          const returnDist = haversineDistance(anchor.lat, anchor.lng, pass2Clean[j].lat, pass2Clean[j].lng)
          if (returnDist <= TELEPORT_JUMP_M) {
            // Jumped back to anchor area
            returnedToAnchor = true
            break
          }
          window.push(pass2Clean[j])
          j++
        }

        if (returnedToAnchor && window.length > 0) {
          // Flag the window as teleport glitches
          for (const wp of window) {
            glitches.push({
              index: -3, // pass3 teleport
              coord: { lat: wp.lat, lng: wp.lng },
              from: { lat: anchor.lat, lng: anchor.lng },
              distance: Math.round(haversineDistance(anchor.lat, anchor.lng, wp.lat, wp.lng)),
              speedKmh: null,
              gapS: null,
              timestamp: wp.timestamp ? new Date(wp.timestamp).toISOString() : '?',
              reason: `Teleport: ${window.length}-point cluster ${(dist / 1000).toFixed(1)}km from trail, returned within ${window.length} pts`,
            })
          }
          idx = j // Continue from the return point
          continue
        } else {
          // Window too large or end of trail without return — accept as real drive
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
  // If first few points are far from the consensus of subsequent points,
  // they're teleport artifacts (phone cached a stale GPS fix on wake).
  let leadTrim = 0
  if (pass3Clean.length >= 5) {
    const sampleEnd = Math.min(21, pass3Clean.length)
    const sampleLats = pass3Clean.slice(1, sampleEnd).map((p) => p.lat).sort((a, b) => a - b)
    const sampleLngs = pass3Clean.slice(1, sampleEnd).map((p) => p.lng).sort((a, b) => a - b)
    const medLat = sampleLats[Math.floor(sampleLats.length / 2)]
    const medLng = sampleLngs[Math.floor(sampleLngs.length / 2)]

    for (let k = 0; k < Math.min(5, pass3Clean.length - 1); k++) {
      const d = haversineDistance(pass3Clean[k].lat, pass3Clean[k].lng, medLat, medLng)
      if (d > TELEPORT_JUMP_M) {
        glitches.push({
          index: -3,
          coord: { lat: pass3Clean[k].lat, lng: pass3Clean[k].lng },
          from: { lat: medLat, lng: medLng },
          distance: Math.round(d),
          speedKmh: null,
          gapS: null,
          timestamp: pass3Clean[k].timestamp ? new Date(pass3Clean[k].timestamp).toISOString() : '?',
          reason: `Leading glitch: ${(d / 1000).toFixed(1)}km from trail body consensus`,
        })
        leadTrim++
      } else {
        break // Once a point is close to the median, stop trimming
      }
    }
  }

  // ── Trailing glitch check ──
  // Same logic from the end of the trail.
  let trailTrim = 0
  if (pass3Clean.length - leadTrim >= 5) {
    const effectiveEnd = pass3Clean.length - leadTrim
    const sampleStart = Math.max(leadTrim, pass3Clean.length - 21)
    const sampleLats = pass3Clean.slice(sampleStart, pass3Clean.length - 1).map((p) => p.lat).sort((a, b) => a - b)
    const sampleLngs = pass3Clean.slice(sampleStart, pass3Clean.length - 1).map((p) => p.lng).sort((a, b) => a - b)
    const medLat = sampleLats[Math.floor(sampleLats.length / 2)]
    const medLng = sampleLngs[Math.floor(sampleLngs.length / 2)]

    for (let k = pass3Clean.length - 1; k >= Math.max(leadTrim, pass3Clean.length - 5); k--) {
      const d = haversineDistance(pass3Clean[k].lat, pass3Clean[k].lng, medLat, medLng)
      if (d > TELEPORT_JUMP_M) {
        glitches.push({
          index: -3,
          coord: { lat: pass3Clean[k].lat, lng: pass3Clean[k].lng },
          from: { lat: medLat, lng: medLng },
          distance: Math.round(d),
          speedKmh: null,
          gapS: null,
          timestamp: pass3Clean[k].timestamp ? new Date(pass3Clean[k].timestamp).toISOString() : '?',
          reason: `Trailing glitch: ${(d / 1000).toFixed(1)}km from trail body consensus`,
        })
        trailTrim++
      } else {
        break
      }
    }
  }

  const finalClean = pass3Clean.slice(leadTrim, trailTrim > 0 ? pass3Clean.length - trailTrim : undefined)

  return { clean: finalClean, glitches }
}

/**
 * Take clean points and run Douglas-Peucker simplification using the
 * canonical tolerance (0.000005), matching closeTrailsService.ts exactly.
 */
function simplifyCleanPath(cleanPoints) {
  const pathForSimplification = cleanPoints.map((p) => ({
    coordinates: `(${p.lng},${p.lat})`,
  }))
  return simplifyPath(pathForSimplification, 0.000005)
}

/**
 * Format points back to SRID=4326;LINESTRING M(...) for detailed_path
 */
function formatDetailedPath(points) {
  const lineString = points.map((p) => `${p.lng} ${p.lat} ${p.timestamp}`).join(',')
  return `SRID=4326;LINESTRING M(${lineString})`
}

/**
 * Format simplified points back to SRID=4326;LINESTRING(...) for path
 */
function formatSimplifiedPath(simplifiedPoints) {
  const lineString = simplifiedPoints
    .map((p) => {
      const coords = p.coordinates.match(/\((.*?),(.*?)\)/)
      return `${coords[1]} ${coords[2]}`
    })
    .join(',')
  return `SRID=4326;LINESTRING(${lineString})`
}

// ════════════════════════════════════════════
//  Main
// ════════════════════════════════════════════
async function main() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Trail Glitch Cleaner — ${writeMode ? '🔴 WRITE MODE' : '🔍 DRY RUN'}`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`  Master map: ${masterMapId}`)
  if (operationFilter) console.log(`  Operation filter: "${operationFilter}"`)
  console.log()

  // 1. Fetch operations
  const { data: operations, error: opError } = await supabase
    .from('operations')
    .select('id, name, year')
    .eq('master_map_id', masterMapId)
    .order('year', { ascending: true })

  if (opError) { console.error('Error fetching operations:', opError.message); process.exit(1) }
  if (!operations?.length) { console.error('No operations found'); process.exit(1) }

  let targetOps = operations
  if (operationFilter) {
    targetOps = operations.filter((op) =>
      op.name.toLowerCase().includes(operationFilter.toLowerCase())
    )
    if (!targetOps.length) { console.error(`No operation matching "${operationFilter}"`); process.exit(1) }
  }

  console.log(`  Found ${operations.length} operations, processing ${targetOps.length}:\n`)

  // Grand totals
  let grandTrails = 0
  let grandPoints = 0
  let grandGlitches = 0
  let grandAffectedTrails = 0
  let grandCurrentPathPts = 0
  let grandNewPathPts = 0
  let grandWritten = 0

  for (const op of targetOps) {
    console.log(`${'━'.repeat(60)}`)
    console.log(`  ${op.name} (${op.year}) — ${op.id}`)
    console.log(`${'━'.repeat(60)}`)

    const { data: trails, error: trailError } = await supabase
      .from('trails')
      .select('id, vehicle_id, start_time, end_time, trail_color, trail_width, path, detailed_path')
      .eq('operation_id', op.id)
      .order('start_time', { ascending: true })

    if (trailError) { console.error(`  Error: ${trailError.message}`); continue }
    if (!trails?.length) { console.log('  No trails\n'); continue }

    console.log(`  ${trails.length} trails\n`)

    // Per-operation counters
    let opTrails = 0
    let opPoints = 0
    let opGlitches = 0
    let opAffectedTrails = 0
    let opCurrentPathPts = 0
    let opNewPathPts = 0
    let opWritten = 0

    for (const trail of trails) {
      grandTrails++
      opTrails++
      const startStr = trail.start_time ? new Date(trail.start_time).toLocaleString() : '?'
      const status = trail.end_time ? 'closed' : '⚠️ OPEN'
      const label = `${trail.id.slice(0, 8)}… | ${trail.trail_color || '?'} ${trail.trail_width || '?'}m | ${startStr} | ${status}`

      // Parse detailed_path (source of truth)
      const detailedPoints = parseDetailedPath(trail.detailed_path)
      if (detailedPoints.length === 0) {
        console.log(`  ⬚ ${label} — no detailed_path, skipping`)
        continue
      }

      // Parse existing simplified path for comparison
      const currentPathPoints = parsePath(trail.path)
      grandCurrentPathPts += currentPathPoints.length
      opCurrentPathPts += currentPathPoints.length

      // Run glitch filter
      const { clean, glitches } = filterGlitches(detailedPoints)
      grandPoints += detailedPoints.length
      grandGlitches += glitches.length
      opPoints += detailedPoints.length
      opGlitches += glitches.length

      // Re-simplify the clean data
      const simplified = simplifyCleanPath(clean)
      grandNewPathPts += simplified.length
      opNewPathPts += simplified.length

      const icon = glitches.length > 0 ? '🔴' : '✅'
      const glitchPct = detailedPoints.length > 0
        ? ((glitches.length / detailedPoints.length) * 100).toFixed(2)
        : '0'

      console.log(`  ${icon} ${label}`)
      console.log(
        `     detailed_path: ${detailedPoints.length.toLocaleString()} pts → ${glitches.length} glitches removed → ${clean.length.toLocaleString()} clean (${glitchPct}% removed)`
      )
      console.log(
        `     path: current ${currentPathPoints.length.toLocaleString()} pts → new simplified ${simplified.length.toLocaleString()} pts`
      )

      if (glitches.length > 0) {
        grandAffectedTrails++
        opAffectedTrails++

        // Summarise glitch bursts instead of every single point
        const bursts = []
        let burstStart = null
        let burstCount = 0
        let burstMaxSpeed = 0
        let burstTotalDist = 0

        for (let g = 0; g < glitches.length; g++) {
          const curr = glitches[g]
          const prev = g > 0 ? glitches[g - 1] : null

          // Is this a new burst? (first glitch, or gap in index > 5 from previous)
          if (!prev || curr.index - prev.index > 5) {
            // Close previous burst
            if (burstStart !== null) {
              bursts.push({
                from: burstStart.timestamp,
                count: burstCount,
                maxSpeed: burstMaxSpeed,
                anchorLat: burstStart.from.lat,
                anchorLng: burstStart.from.lng,
                jumpDist: burstStart.distance,
              })
            }
            burstStart = curr
            burstCount = 1
            burstMaxSpeed = curr.speedKmh || 0
            burstTotalDist = curr.distance
          } else {
            burstCount++
            if ((curr.speedKmh || 0) > burstMaxSpeed) burstMaxSpeed = curr.speedKmh
          }
        }
        // Close last burst
        if (burstStart !== null) {
          bursts.push({
            from: burstStart.timestamp,
            count: burstCount,
            maxSpeed: burstMaxSpeed,
            anchorLat: burstStart.from.lat,
            anchorLng: burstStart.from.lng,
            jumpDist: burstStart.distance,
          })
        }

        console.log(`     ┌── ${bursts.length} glitch burst(s):`)
        for (const b of bursts) {
          console.log(
            `     │  ${b.count} pts @ ${b.from} — peak ${b.maxSpeed} km/h, ${b.jumpDist}m from (${b.anchorLat.toFixed(4)}, ${b.anchorLng.toFixed(4)})`
          )
        }
        console.log(`     └──`)
      }

      // ── Write mode ──
      if (writeMode && glitches.length > 0) {
        const newDetailedPath = formatDetailedPath(clean)
        const newPath = formatSimplifiedPath(simplified)

        const { error: updateError } = await supabase
          .from('trails')
          .update({
            detailed_path: newDetailedPath,
            path: newPath,
          })
          .eq('id', trail.id)

        if (updateError) {
          console.error(`     ❌ Write failed: ${updateError.message}`)
        } else {
          grandWritten++
          opWritten++
          console.log(`     ✍️  Written: detailed_path (${clean.length.toLocaleString()} pts) + path (${simplified.length.toLocaleString()} pts)`)
        }
      }

      console.log()
    }

    // ── Operation summary ──
    const opGlitchPct = opPoints > 0 ? ((opGlitches / opPoints) * 100).toFixed(3) : '0'
    console.log(`  ┌${'─'.repeat(50)}`)
    console.log(`  │ ${op.name} (${op.year}): ${opTrails} trails, ${opPoints.toLocaleString()} pts`)
    if (opGlitches > 0) {
      console.log(`  │ Glitches: ${opGlitches.toLocaleString()} removed (${opGlitchPct}%) across ${opAffectedTrails} trail(s)`)
      console.log(`  │ Path: ${opCurrentPathPts.toLocaleString()} → ${opNewPathPts.toLocaleString()} simplified pts`)
      if (writeMode) console.log(`  │ Written: ${opWritten} trail(s)`)
    } else {
      console.log(`  │ ✅ Clean — no glitches detected`)
    }
    console.log(`  └${'─'.repeat(50)}\n`)
  }

  // ── Grand summary ──
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  SUMMARY — ${writeMode ? '🔴 WRITE MODE' : '🔍 DRY RUN'}`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`  Trails scanned:        ${grandTrails.toLocaleString()}`)
  console.log(`  Total detailed points: ${grandPoints.toLocaleString()}`)
  console.log(`  Total glitches found:  ${grandGlitches.toLocaleString()} (${grandPoints > 0 ? ((grandGlitches / grandPoints) * 100).toFixed(3) : 0}%)`)
  console.log(`  Trails with glitches:  ${grandAffectedTrails}`)
  console.log()
  console.log(`  Current path points:   ${grandCurrentPathPts.toLocaleString()} (existing simplified)`)
  console.log(`  New path points:       ${grandNewPathPts.toLocaleString()} (re-simplified from clean data)`)
  const pathDiff = grandNewPathPts - grandCurrentPathPts
  const pathDiffPct = grandCurrentPathPts > 0 ? ((pathDiff / grandCurrentPathPts) * 100).toFixed(1) : 0
  console.log(`  Path point difference: ${pathDiff > 0 ? '+' : ''}${pathDiff.toLocaleString()} (${pathDiffPct}%)`)

  if (writeMode) {
    console.log(`\n  Trails written:        ${grandWritten}`)
  } else if (grandAffectedTrails > 0) {
    console.log(`\n  Run with --write to apply changes.`)
  }

  console.log()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
