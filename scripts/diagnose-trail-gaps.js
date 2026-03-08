/**
 * diagnose-trail-gaps.js
 *
 * Dumps every consecutive point pair in a trail where the distance exceeds
 * a threshold. This is purely diagnostic — shows what's actually in the data
 * regardless of speed/time gates.
 *
 * Usage:
 *   node scripts/diagnose-trail-gaps.js <master_map_id> --operation "Crunching"
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import wkx from 'wkx'

dotenv.config()

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE
)

const DISTANCE_THRESHOLD_M = 500 // Flag any gap > 500m

const args = process.argv.slice(2)
const masterMapId = args.find((a) => !a.startsWith('--'))
const opFlagIdx = args.indexOf('--operation')
const operationFilter = opFlagIdx !== -1 ? args[opFlagIdx + 1] : null

if (!masterMapId) {
  console.error('Usage: node scripts/diagnose-trail-gaps.js <master_map_id> [--operation "Name"]')
  process.exit(1)
}

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
    return []
  }
}

async function main() {
  console.log(`\nDiagnosing large gaps (>${DISTANCE_THRESHOLD_M}m) in trail data\n`)

  // Fetch operations
  let query = supabase
    .from('operations')
    .select('id, name, year')
    .eq('master_map_id', masterMapId)
    .order('year', { ascending: true })

  const { data: operations, error: opError } = await query
  if (opError) { console.error(opError.message); process.exit(1) }

  let targetOps = operations
  if (operationFilter) {
    targetOps = operations.filter((op) =>
      op.name.toLowerCase().includes(operationFilter.toLowerCase())
    )
  }

  for (const op of targetOps) {
    console.log(`━━━ ${op.name} (${op.year}) ━━━`)

    const { data: trails, error: trailError } = await supabase
      .from('trails')
      .select('id, start_time, end_time, trail_color, trail_width, detailed_path')
      .eq('operation_id', op.id)
      .order('start_time', { ascending: true })

    if (trailError) { console.error(trailError.message); continue }
    if (!trails?.length) { console.log('  No trails\n'); continue }

    for (const trail of trails) {
      const points = parseDetailedPath(trail.detailed_path)
      if (points.length < 2) continue

      const startStr = trail.start_time ? new Date(trail.start_time).toLocaleString() : '?'
      const label = `${trail.id.slice(0, 8)}… | ${trail.trail_color} ${trail.trail_width}m | ${startStr}`

      // Find bounding box of trail
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
      for (const p of points) {
        if (p.lat < minLat) minLat = p.lat
        if (p.lat > maxLat) maxLat = p.lat
        if (p.lng < minLng) minLng = p.lng
        if (p.lng > maxLng) maxLng = p.lng
      }

      // Find the "centroid" (median-ish) of the trail
      const midLat = (minLat + maxLat) / 2
      const midLng = (minLng + maxLng) / 2

      // Compute distances between consecutive points
      const largeGaps = []
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const dist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng)
        if (dist > DISTANCE_THRESHOLD_M) {
          let gapS = null
          let speedKmh = null
          if (prev.timestamp && curr.timestamp) {
            gapS = (curr.timestamp - prev.timestamp) / 1000
            if (gapS > 0) speedKmh = (dist / gapS) * 3.6
          }
          largeGaps.push({ index: i, prev, curr, dist, gapS, speedKmh })
        }
      }

      // Also find points far from centroid (potential outliers)
      const trailSpan = haversineDistance(minLat, minLng, maxLat, maxLng)
      const outlierThreshold = Math.max(trailSpan * 0.5, 2000) // 50% of trail span or 2km
      const outliers = []
      for (let i = 0; i < points.length; i++) {
        const p = points[i]
        const distFromCenter = haversineDistance(p.lat, p.lng, midLat, midLng)
        if (distFromCenter > outlierThreshold) {
          // Check distance to neighbors
          let distPrev = i > 0 ? haversineDistance(points[i-1].lat, points[i-1].lng, p.lat, p.lng) : 0
          let distNext = i < points.length - 1 ? haversineDistance(p.lat, p.lng, points[i+1].lat, points[i+1].lng) : 0
          outliers.push({ index: i, point: p, distFromCenter, distPrev, distNext })
        }
      }

      if (largeGaps.length === 0 && outliers.length === 0) continue

      console.log(`\n  ${label} — ${points.length.toLocaleString()} pts`)
      console.log(`  Bounding box: (${minLat.toFixed(6)}, ${minLng.toFixed(6)}) to (${maxLat.toFixed(6)}, ${maxLng.toFixed(6)})`)
      console.log(`  Trail span: ${(trailSpan/1000).toFixed(1)}km, centroid: (${midLat.toFixed(6)}, ${midLng.toFixed(6)})`)

      if (largeGaps.length > 0) {
        console.log(`\n  📏 ${largeGaps.length} gaps > ${DISTANCE_THRESHOLD_M}m:`)
        for (const g of largeGaps) {
          const speedStr = g.speedKmh != null ? `${Math.round(g.speedKmh)} km/h` : 'N/A'
          const gapStr = g.gapS != null ? `${g.gapS.toFixed(1)}s` : 'N/A'
          console.log(
            `    [${g.index}] ${(g.dist/1000).toFixed(1)}km | gap: ${gapStr} | speed: ${speedStr}`
          )
          console.log(
            `         from: (${g.prev.lat.toFixed(6)}, ${g.prev.lng.toFixed(6)}) → to: (${g.curr.lat.toFixed(6)}, ${g.curr.lng.toFixed(6)})`
          )
        }
      }

      if (outliers.length > 0) {
        console.log(`\n  🎯 ${outliers.length} point(s) far from centroid (>${(outlierThreshold/1000).toFixed(1)}km):`)
        for (const o of outliers) {
          console.log(
            `    [${o.index}] (${o.point.lat.toFixed(6)}, ${o.point.lng.toFixed(6)}) — ${(o.distFromCenter/1000).toFixed(1)}km from centroid`
          )
          console.log(
            `         prev neighbor: ${(o.distPrev/1000).toFixed(1)}km, next neighbor: ${(o.distNext/1000).toFixed(1)}km`
          )
          if (o.point.timestamp) {
            console.log(`         time: ${new Date(o.point.timestamp).toISOString()}`)
          }
        }
      }
    }
    console.log()
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
