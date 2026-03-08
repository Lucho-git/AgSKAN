/**
 * analyze-trail-glitches.js
 *
 * Queries trail coordinates from the `trails.detailed_path` (LINESTRING M with
 * timestamps) or `trails.path` (LINESTRING) columns, then runs the same hybrid
 * GPS filter we use in VehicleTracker to detect which coordinates would have
 * been rejected.
 *
 * Uses the `wkx` library to parse PostGIS WKB hex geometry, matching the
 * pattern in verify-trail-paths.js.
 *
 * Usage:
 *   node scripts/analyze-trail-glitches.js <master_map_id> [operation_name]
 *
 * Example:
 *   node scripts/analyze-trail-glitches.js 8d79a50c-62c7-4c73-a9ed-1ee7e532c0b3 "Ripping"
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import wkx from 'wkx'

dotenv.config()

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE
)

// ── Filter thresholds (mirrors VehicleTracker) ──
const GPS_MAX_ACCURACY_M = 200
const GPS_MAX_SPEED_KMH = 250
const GPS_SPEED_GATE_MAX_GAP_S = 60

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
 * Parse a PostGIS geography/geometry column (hex WKB) into an array of
 * { lat, lng, timestamp? } objects.
 */
function parsePathGeometry(rawPath) {
  if (!rawPath) return []

  try {
    let geometry
    if (typeof rawPath === 'string') {
      geometry = wkx.Geometry.parse(Buffer.from(rawPath, 'hex'))
    } else if (typeof rawPath === 'object' && rawPath.type) {
      // Already GeoJSON
      const coords = rawPath.coordinates || []
      return coords.map((c) => ({ lng: c[0], lat: c[1], timestamp: null }))
    } else {
      return []
    }

    // LINESTRING M has .points with .x, .y, .m (timestamp as ms epoch)
    if (geometry.points) {
      return geometry.points.map((p) => ({
        lng: p.x,
        lat: p.y,
        timestamp: p.m ? p.m : null,
      }))
    }

    // Fallback: convert to GeoJSON
    const geoJSON = geometry.toGeoJSON()
    if (geoJSON.coordinates) {
      return geoJSON.coordinates.map((c) => ({
        lng: c[0],
        lat: c[1],
        timestamp: c.length > 2 ? c[2] : null,
      }))
    }

    return []
  } catch (e) {
    console.error('  ⚠️ Error parsing geometry:', e.message)
    return []
  }
}

// ── Analyse a single trail's coordinates ──
function analyzeTrail(trailId, points) {
  if (points.length < 2) {
    return { trailId, total: points.length, glitches: [], stats: null }
  }

  const glitches = []
  let lastAccepted = points[0]
  let totalDistance = 0
  let maxJump = 0

  for (let i = 1; i < points.length; i++) {
    const prev = lastAccepted
    const curr = points[i]

    const dist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng)

    // If we have timestamps, use speed gate
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

    // Gate: Speed gate (only for short gaps with timestamps)
    if (impliedSpeedKmh != null && gapS > 0 && gapS < GPS_SPEED_GATE_MAX_GAP_S && impliedSpeedKmh > GPS_MAX_SPEED_KMH) {
      rejected = true
      reason = `Speed ${Math.round(impliedSpeedKmh)} km/h over ${gapS.toFixed(1)}s (${Math.round(dist)}m jump)`
    }

    // Gate: Distance-only fallback when no timestamps available
    // If consecutive points are > 5km apart with no time info, flag them
    if (!rejected && impliedSpeedKmh == null && dist > 5000) {
      rejected = true
      reason = `Distance jump ${Math.round(dist)}m (no timestamp data for speed calc)`
    }

    if (rejected) {
      glitches.push({
        index: i,
        coordinate: { lat: curr.lat, lng: curr.lng },
        from: { lat: prev.lat, lng: prev.lng },
        distance: Math.round(dist),
        impliedSpeedKmh: impliedSpeedKmh != null ? Math.round(impliedSpeedKmh) : null,
        gapSeconds: gapS != null ? parseFloat(gapS.toFixed(1)) : null,
        timestamp: curr.timestamp ? new Date(curr.timestamp).toISOString() : `point #${i}`,
        reason,
      })
      // Don't update lastAccepted — glitch is skipped
    } else {
      totalDistance += dist
      if (dist > maxJump) maxJump = dist
      lastAccepted = curr
    }
  }

  return {
    trailId,
    total: points.length,
    glitches,
    stats: {
      cleanPoints: points.length - glitches.length,
      totalDistanceKm: (totalDistance / 1000).toFixed(2),
      maxLegitJumpM: Math.round(maxJump),
    },
  }
}

async function main() {
  const masterMapId = process.argv[2]
  const operationFilter = process.argv[3] // optional operation name filter

  if (!masterMapId) {
    console.error('Usage: node scripts/analyze-trail-glitches.js <master_map_id> [operation_name]')
    process.exit(1)
  }

  console.log(`\n🔍 Analyzing trails for master_map: ${masterMapId}`)
  if (operationFilter) console.log(`   Operation filter: "${operationFilter}"`)

  // 1. Find operations for this map
  const { data: operations, error: opError } = await supabase
    .from('operations')
    .select('id, name, year')
    .eq('master_map_id', masterMapId)

  if (opError) {
    console.error('Error fetching operations:', opError.message)
    process.exit(1)
  }

  if (!operations || operations.length === 0) {
    console.error('No operations found for this map')
    process.exit(1)
  }

  console.log(`   Found ${operations.length} operations:`)
  operations.forEach((op) => console.log(`     • ${op.name} (${op.year}) — ${op.id}`))

  // Filter to matching operation if specified
  let targetOps = operations
  if (operationFilter) {
    targetOps = operations.filter((op) =>
      op.name.toLowerCase().includes(operationFilter.toLowerCase())
    )
    if (targetOps.length === 0) {
      console.error(`No operation matching "${operationFilter}"`)
      process.exit(1)
    }
  }

  // 2. For each operation, get trails
  for (const op of targetOps) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`  Operation: ${op.name} (${op.year})`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    const { data: trails, error: trailError } = await supabase
      .from('trails')
      .select('id, vehicle_id, start_time, end_time, trail_color, trail_width, path, detailed_path')
      .eq('operation_id', op.id)
      .order('start_time', { ascending: true })

    if (trailError) {
      console.error(`  Error fetching trails: ${trailError.message}`)
      continue
    }

    if (!trails || trails.length === 0) {
      console.log('  No trails found')
      continue
    }

    console.log(`  Found ${trails.length} trails\n`)

    let grandTotalPoints = 0
    let grandTotalGlitches = 0

    for (const trail of trails) {
      const startStr = new Date(trail.start_time).toLocaleString()
      const status = trail.end_time ? 'closed' : '⚠️ OPEN'

      // Prefer detailed_path (has timestamps), fall back to path, then trail_stream
      let points = parsePathGeometry(trail.detailed_path)
      let source = 'detailed_path'

      if (points.length === 0) {
        points = parsePathGeometry(trail.path)
        source = 'path'
      }

      // Last resort: trail_stream table
      if (points.length === 0) {
        const { data: streamPoints, error: streamError } = await supabase
          .from('trail_stream')
          .select('coordinate, timestamp')
          .eq('trail_id', trail.id)
          .order('timestamp', { ascending: true })

        if (!streamError && streamPoints && streamPoints.length > 0) {
          points = streamPoints.map((p) => ({
            lat: p.coordinate.coordinates[1],
            lng: p.coordinate.coordinates[0],
            timestamp: new Date(p.timestamp).getTime(),
          }))
          source = 'trail_stream'
        }
      }

      if (points.length === 0) {
        console.log(`  ⬚ Trail ${trail.id.slice(0, 8)}… | ${startStr} | 0 points | ${status}`)
        continue
      }

      const result = analyzeTrail(trail.id, points)
      grandTotalPoints += result.total
      grandTotalGlitches += result.glitches.length

      const glitchPct =
        result.total > 0 ? ((result.glitches.length / result.total) * 100).toFixed(1) : '0'
      const icon = result.glitches.length > 0 ? '🔴' : '✅'

      console.log(
        `  ${icon} Trail ${trail.id.slice(0, 8)}… | ${trail.trail_color || '?'} ${trail.trail_width || '?'}m | ${startStr} | ${result.total} pts (${source}) | ${result.glitches.length} glitches (${glitchPct}%) | ${status}`
      )

      if (result.stats) {
        console.log(
          `     Clean: ${result.stats.cleanPoints} pts, Distance: ${result.stats.totalDistanceKm} km, Max leg: ${result.stats.maxLegitJumpM}m`
        )
      }

      // Print each glitch
      if (result.glitches.length > 0) {
        console.log(`     ┌─── Glitch details:`)
        for (const g of result.glitches) {
          console.log(
            `     │ [${g.index}] ${g.reason} @ ${g.timestamp}`
          )
          console.log(
            `     │      from (${g.from.lat.toFixed(6)}, ${g.from.lng.toFixed(6)}) → (${g.coordinate.lat.toFixed(6)}, ${g.coordinate.lng.toFixed(6)})`
          )
        }
        console.log(`     └───`)
      }
    }

    console.log(`\n  ── Summary ──`)
    console.log(`  Total points: ${grandTotalPoints}`)
    console.log(`  Total glitches: ${grandTotalGlitches}`)
    console.log(
      `  Would-have-been-filtered: ${grandTotalGlitches} (${grandTotalPoints > 0 ? ((grandTotalGlitches / grandTotalPoints) * 100).toFixed(2) : 0}%)`
    )
  }

  console.log('\n✅ Analysis complete\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
