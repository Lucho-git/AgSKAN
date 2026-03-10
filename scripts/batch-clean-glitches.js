/**
 * batch-clean-glitches.js
 *
 * Batch runner for the trail glitch cleaner. Processes multiple master maps
 * in configurable batches, tracking progress in a local JSON ledger so you
 * can stop and resume without re-processing completed maps.
 *
 * COMMANDS:
 *
 *   List all master maps with cleanup status:
 *     node scripts/batch-clean-glitches.js --list
 *
 *   Dry run next batch (default 30 maps):
 *     node scripts/batch-clean-glitches.js
 *
 *   Dry run with custom batch size:
 *     node scripts/batch-clean-glitches.js --batch 10
 *
 *   Write mode (actually clean the data):
 *     node scripts/batch-clean-glitches.js --write
 *     node scripts/batch-clean-glitches.js --write --batch 10
 *
 *   Re-run a specific map (even if already completed):
 *     node scripts/batch-clean-glitches.js --map <master_map_id>
 *     node scripts/batch-clean-glitches.js --map <master_map_id> --write
 *
 *   Reset ledger (mark all as pending):
 *     node scripts/batch-clean-glitches.js --reset
 *
 * LEDGER:
 *   Progress is tracked in scripts/glitch-cleanup-ledger.json
 *   Each master map entry records: status, timestamp, stats (trails, points,
 *   glitches found, trails written).
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import wkx from 'wkx'
import { simplifyPath } from '../src/lib/utils/pathSimplification.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LEDGER_PATH = path.join(__dirname, 'glitch-cleanup-ledger.json')
const DEFAULT_BATCH_SIZE = 30

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE
)

// ── CLI args ──
const args = process.argv.slice(2)
const listMode = args.includes('--list')
const writeMode = args.includes('--write')
const resetMode = args.includes('--reset')
const batchIdx = args.indexOf('--batch')
const batchSize = batchIdx !== -1 ? parseInt(args[batchIdx + 1], 10) : DEFAULT_BATCH_SIZE
const mapIdx = args.indexOf('--map')
const specificMap = mapIdx !== -1 ? args[mapIdx + 1] : null

// ── Filter thresholds ──
const GPS_MAX_SPEED_KMH = 250
const GPS_SPEED_GATE_MAX_GAP_S = 60
const SNAP_BACK_LOOK_AHEAD = 3
const ISOLATION_DISTANCE_M = 500
const TELEPORT_JUMP_M = 2000
const MAX_TELEPORT_WINDOW = 30

// ════════════════════════════════════════════
//  Ledger management
// ════════════════════════════════════════════
function loadLedger() {
  if (fs.existsSync(LEDGER_PATH)) {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'))
  }
  return {}
}

function saveLedger(ledger) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2))
}

// ════════════════════════════════════════════
//  Geometry helpers (same as clean-trail-glitches.js)
// ════════════════════════════════════════════
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
      return geometry.points.map((p) => ({ lng: p.x, lat: p.y, timestamp: p.m || null }))
    }
    return []
  } catch (e) { return [] }
}

function parsePath(rawPath) {
  if (!rawPath) return []
  try {
    const geometry = wkx.Geometry.parse(Buffer.from(rawPath, 'hex'))
    if (geometry.points) return geometry.points.map((p) => ({ lng: p.x, lat: p.y }))
    const geoJSON = geometry.toGeoJSON()
    if (geoJSON.coordinates) return geoJSON.coordinates.map((c) => ({ lng: c[0], lat: c[1] }))
    return []
  } catch (e) { return [] }
}

function filterGlitches(points) {
  if (points.length < 2) return { clean: [...points], glitches: [] }

  const glitches = []

  // Pass 1: Speed gate + snap-back
  const pass1Clean = [points[0]]
  let lastAccepted = points[0]
  let i = 1
  while (i < points.length) {
    const prev = lastAccepted
    const curr = points[i]
    const dist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng)
    let gapS = null, impliedSpeedKmh = null
    if (prev.timestamp != null && curr.timestamp != null) {
      gapS = (curr.timestamp - prev.timestamp) / 1000
      if (gapS > 0) impliedSpeedKmh = (dist / gapS) * 3.6
    }
    let rejected = false
    if (impliedSpeedKmh != null && gapS > 0 && gapS < GPS_SPEED_GATE_MAX_GAP_S && impliedSpeedKmh > GPS_MAX_SPEED_KMH) {
      rejected = true
      glitches.push({ index: i, coord: { lat: curr.lat, lng: curr.lng }, reason: 'speed' })
    }
    if (!rejected && impliedSpeedKmh == null && dist > 5000) {
      rejected = true
      glitches.push({ index: i, coord: { lat: curr.lat, lng: curr.lng }, reason: 'distance' })
    }
    if (rejected) { i++; continue }

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
        if (peekSpeed != null && peekSpeed > GPS_MAX_SPEED_KMH) consecutiveRejections++
        else break
      }
      if (consecutiveRejections >= SNAP_BACK_LOOK_AHEAD) {
        glitches.push({ index: i, coord: { lat: curr.lat, lng: curr.lng }, reason: 'snap-back' })
        i++; continue
      }
    }
    pass1Clean.push(curr)
    lastAccepted = curr
    i++
  }

  // Pass 2: Isolation detector
  const pass2Clean = []
  for (let k = 0; k < pass1Clean.length; k++) {
    const p = pass1Clean[k]
    if (k > 0 && k < pass1Clean.length - 1) {
      const prevP = pass1Clean[k - 1], nextP = pass1Clean[k + 1]
      const distPrev = haversineDistance(prevP.lat, prevP.lng, p.lat, p.lng)
      const distNext = haversineDistance(p.lat, p.lng, nextP.lat, nextP.lng)
      if (distPrev > ISOLATION_DISTANCE_M && distNext > ISOLATION_DISTANCE_M) {
        const neighborDist = haversineDistance(prevP.lat, prevP.lng, nextP.lat, nextP.lng)
        if (neighborDist < distPrev && neighborDist < distNext) {
          glitches.push({ index: -1, coord: { lat: p.lat, lng: p.lng }, reason: 'isolated' })
          continue
        }
      }
    }
    pass2Clean.push(p)
  }

  // Pass 3: Teleport (jump-back) detection
  const pass3Clean = []
  let idx = 0
  while (idx < pass2Clean.length) {
    if (pass3Clean.length > 0) {
      const anchor = pass3Clean[pass3Clean.length - 1]
      const dist = haversineDistance(anchor.lat, anchor.lng, pass2Clean[idx].lat, pass2Clean[idx].lng)
      if (dist > TELEPORT_JUMP_M) {
        const window = []
        let j = idx
        let returnedToAnchor = false
        while (j < pass2Clean.length && window.length < MAX_TELEPORT_WINDOW) {
          const returnDist = haversineDistance(anchor.lat, anchor.lng, pass2Clean[j].lat, pass2Clean[j].lng)
          if (returnDist <= TELEPORT_JUMP_M) { returnedToAnchor = true; break }
          window.push(pass2Clean[j])
          j++
        }
        if (returnedToAnchor && window.length > 0) {
          for (const wp of window) {
            glitches.push({ index: -3, coord: { lat: wp.lat, lng: wp.lng }, reason: 'teleport' })
          }
          idx = j; continue
        } else {
          pass3Clean.push(pass2Clean[idx]); idx++; continue
        }
      }
    }
    pass3Clean.push(pass2Clean[idx]); idx++
  }

  // Leading glitch check
  let leadTrim = 0
  if (pass3Clean.length >= 5) {
    const sampleEnd = Math.min(21, pass3Clean.length)
    const sampleLats = pass3Clean.slice(1, sampleEnd).map((p) => p.lat).sort((a, b) => a - b)
    const sampleLngs = pass3Clean.slice(1, sampleEnd).map((p) => p.lng).sort((a, b) => a - b)
    const medLat = sampleLats[Math.floor(sampleLats.length / 2)]
    const medLng = sampleLngs[Math.floor(sampleLngs.length / 2)]
    for (let k = 0; k < Math.min(5, pass3Clean.length - 1); k++) {
      const d = haversineDistance(pass3Clean[k].lat, pass3Clean[k].lng, medLat, medLng)
      if (d > TELEPORT_JUMP_M) { glitches.push({ index: -3, coord: { lat: pass3Clean[k].lat, lng: pass3Clean[k].lng }, reason: 'leading' }); leadTrim++ }
      else break
    }
  }

  // Trailing glitch check
  let trailTrim = 0
  if (pass3Clean.length - leadTrim >= 5) {
    const sampleStart = Math.max(leadTrim, pass3Clean.length - 21)
    const sampleLats = pass3Clean.slice(sampleStart, pass3Clean.length - 1).map((p) => p.lat).sort((a, b) => a - b)
    const sampleLngs = pass3Clean.slice(sampleStart, pass3Clean.length - 1).map((p) => p.lng).sort((a, b) => a - b)
    const medLat = sampleLats[Math.floor(sampleLats.length / 2)]
    const medLng = sampleLngs[Math.floor(sampleLngs.length / 2)]
    for (let k = pass3Clean.length - 1; k >= Math.max(leadTrim, pass3Clean.length - 5); k--) {
      const d = haversineDistance(pass3Clean[k].lat, pass3Clean[k].lng, medLat, medLng)
      if (d > TELEPORT_JUMP_M) { glitches.push({ index: -3, coord: { lat: pass3Clean[k].lat, lng: pass3Clean[k].lng }, reason: 'trailing' }); trailTrim++ }
      else break
    }
  }

  const finalClean = pass3Clean.slice(leadTrim, trailTrim > 0 ? pass3Clean.length - trailTrim : undefined)
  return { clean: finalClean, glitches }
}

function simplifyCleanPath(cleanPoints) {
  const pathForSimplification = cleanPoints.map((p) => ({ coordinates: `(${p.lng},${p.lat})` }))
  return simplifyPath(pathForSimplification, 0.000005)
}

function formatDetailedPath(points) {
  const lineString = points.map((p) => `${p.lng} ${p.lat} ${p.timestamp}`).join(',')
  return `SRID=4326;LINESTRING M(${lineString})`
}

function formatSimplifiedPath(simplifiedPoints) {
  const lineString = simplifiedPoints.map((p) => {
    const coords = p.coordinates.match(/\((.*?),(.*?)\)/)
    return `${coords[1]} ${coords[2]}`
  }).join(',')
  return `SRID=4326;LINESTRING(${lineString})`
}

// ════════════════════════════════════════════
//  Process a single master map
// ════════════════════════════════════════════
async function processMap(masterMapId, mapName, writeEnabled) {
  const { data: operations, error: opError } = await supabase
    .from('operations')
    .select('id, name, year')
    .eq('master_map_id', masterMapId)
    .order('year', { ascending: true })

  if (opError) return { error: opError.message }
  if (!operations?.length) return { trails: 0, points: 0, glitches: 0, affected: 0, written: 0, operations: 0 }

  let totalTrails = 0, totalPoints = 0, totalGlitches = 0, totalAffected = 0, totalWritten = 0
  const opSummaries = []

  for (const op of operations) {
    const { data: trails, error: trailError } = await supabase
      .from('trails')
      .select('id, start_time, end_time, trail_color, trail_width, path, detailed_path')
      .eq('operation_id', op.id)
      .order('start_time', { ascending: true })

    if (trailError || !trails?.length) {
      opSummaries.push({ name: op.name, year: op.year, trails: 0, points: 0, glitches: 0, affected: 0, written: 0 })
      continue
    }

    let opTrails = 0, opPoints = 0, opGlitches = 0, opAffected = 0, opWritten = 0

    for (const trail of trails) {
      opTrails++
      const detailedPoints = parseDetailedPath(trail.detailed_path)
      if (detailedPoints.length === 0) continue

      opPoints += detailedPoints.length
      const { clean, glitches } = filterGlitches(detailedPoints)
      opGlitches += glitches.length

      if (glitches.length > 0) {
        opAffected++

        if (writeEnabled) {
          const simplified = simplifyCleanPath(clean)
          const newDetailedPath = formatDetailedPath(clean)
          const newPath = formatSimplifiedPath(simplified)

          const { error: updateError } = await supabase
            .from('trails')
            .update({ detailed_path: newDetailedPath, path: newPath })
            .eq('id', trail.id)

          if (!updateError) opWritten++
        }
      }
    }

    totalTrails += opTrails
    totalPoints += opPoints
    totalGlitches += opGlitches
    totalAffected += opAffected
    totalWritten += opWritten

    opSummaries.push({ name: op.name, year: op.year, trails: opTrails, points: opPoints, glitches: opGlitches, affected: opAffected, written: opWritten })
  }

  return {
    operations: operations.length,
    opSummaries,
    trails: totalTrails,
    points: totalPoints,
    glitches: totalGlitches,
    affected: totalAffected,
    written: totalWritten,
  }
}

// ════════════════════════════════════════════
//  Commands
// ════════════════════════════════════════════

async function fetchAllMasterMaps() {
  const { data, error } = await supabase
    .from('master_maps')
    .select('id, map_name, created_at, profiles:master_user_id ( full_name )')
    .order('created_at', { ascending: true })

  if (error) { console.error('Error fetching master maps:', error.message); process.exit(1) }
  return (data || []).map((m) => ({
    id: m.id,
    name: m.map_name || 'Unnamed',
    owner: m.profiles?.full_name || 'Unknown',
    created_at: m.created_at,
  }))
}

async function cmdList() {
  const maps = await fetchAllMasterMaps()
  const ledger = loadLedger()

  console.log(`\n${'═'.repeat(80)}`)
  console.log(`  Master Map Cleanup Status — ${maps.length} maps`)
  console.log(`${'═'.repeat(80)}\n`)

  // Count operations and trails for each map
  let completed = 0, pending = 0

  const statusIcon = (status) => {
    if (status === 'completed') return '✅'
    if (status === 'dry-run') return '🔍'
    return '⬜'
  }

  // Table header
  console.log(`  ${'Status'.padEnd(10)} ${'Owner'.padEnd(20)} ${'Map Name'.padEnd(30)} ${'ID'.padEnd(12)} ${'Glitches'.padEnd(10)} ${'Cleaned'.padEnd(10)}`)
  console.log(`  ${'─'.repeat(10)} ${'─'.repeat(20)} ${'─'.repeat(30)} ${'─'.repeat(12)} ${'─'.repeat(10)} ${'─'.repeat(10)}`)

  for (const m of maps) {
    const entry = ledger[m.id]
    const status = entry?.status || 'pending'
    const icon = statusIcon(status)
    const owner = m.owner.slice(0, 18).padEnd(20)
    const name = m.name.slice(0, 28).padEnd(30)
    const shortId = m.id.slice(0, 10).padEnd(12)
    const glitchStr = entry?.stats ? String(entry.stats.glitches).padEnd(10) : '—'.padEnd(10)
    const cleanedStr = entry?.stats ? String(entry.stats.written).padEnd(10) : '—'.padEnd(10)

    console.log(`  ${icon}  ${status.padEnd(7)} ${owner} ${name} ${shortId} ${glitchStr} ${cleanedStr}`)

    if (status === 'completed') completed++
    else pending++
  }

  console.log(`\n  ${'─'.repeat(75)}`)
  console.log(`  Completed: ${completed} | Pending: ${pending} | Total: ${maps.length}`)

  if (pending > 0) {
    console.log(`\n  Run without --list to process next ${Math.min(pending, batchSize)} maps (dry run).`)
    console.log(`  Run with --write to apply changes.`)
  } else {
    console.log(`\n  ✅ All maps have been processed!`)
  }
  console.log()
}

async function cmdReset() {
  if (fs.existsSync(LEDGER_PATH)) {
    const ledger = loadLedger()
    const count = Object.keys(ledger).length
    fs.unlinkSync(LEDGER_PATH)
    console.log(`\nReset ledger — ${count} entries cleared.\n`)
  } else {
    console.log('\nNo ledger file found.\n')
  }
}

async function cmdBatch() {
  const maps = await fetchAllMasterMaps()
  const ledger = loadLedger()

  // If a specific map is requested, process just that one
  let toProcess
  if (specificMap) {
    const map = maps.find((m) => m.id === specificMap)
    if (!map) { console.error(`Master map ${specificMap} not found`); process.exit(1) }
    toProcess = [map]
    console.log(`\n  Processing specific map: ${map.name || 'Unnamed'}`)
  } else {
    // Filter to pending maps only
    toProcess = maps.filter((m) => ledger[m.id]?.status !== 'completed')
    if (toProcess.length === 0) {
      console.log('\n  ✅ All maps have been processed! Use --reset to start over or --map <id> to re-run one.\n')
      return
    }
    toProcess = toProcess.slice(0, batchSize)
  }

  console.log(`\n${'═'.repeat(80)}`)
  console.log(`  Batch Glitch Cleanup — ${writeMode ? '🔴 WRITE MODE' : '🔍 DRY RUN'} — ${toProcess.length} map(s)`)
  console.log(`${'═'.repeat(80)}\n`)

  let batchMaps = 0, batchTrails = 0, batchPoints = 0, batchGlitches = 0, batchWritten = 0

  for (let m = 0; m < toProcess.length; m++) {
    const map = toProcess[m]
    const progress = `[${m + 1}/${toProcess.length}]`
    const mapName = map.name

    console.log(`${'━'.repeat(80)}`)
    console.log(`  ${progress} ${mapName}`)
    console.log(`  ${map.id}`)
    console.log(`${'━'.repeat(80)}`)

    const result = await processMap(map.id, mapName, writeMode)

    if (result.error) {
      console.log(`  ❌ Error: ${result.error}\n`)
      ledger[map.id] = {
        status: 'error',
        name: mapName,
        timestamp: new Date().toISOString(),
        error: result.error,
      }
      saveLedger(ledger)
      continue
    }

    // Print per-operation breakdown
    if (result.opSummaries) {
      for (const op of result.opSummaries) {
        if (op.trails === 0) continue
        const glitchStr = op.glitches > 0
          ? `${op.glitches} glitches across ${op.affected} trail(s)${op.written > 0 ? ` — ${op.written} written` : ''}`
          : '✅ clean'
        console.log(`  ${op.name} (${op.year}): ${op.trails} trails, ${op.points.toLocaleString()} pts — ${glitchStr}`)
      }
    }

    // Map summary
    const glitchPct = result.points > 0 ? ((result.glitches / result.points) * 100).toFixed(3) : '0'
    console.log()
    console.log(`  ┌${'─'.repeat(60)}`)
    console.log(`  │ ${mapName}: ${result.operations} ops, ${result.trails} trails, ${result.points.toLocaleString()} pts`)
    if (result.glitches > 0) {
      console.log(`  │ Glitches: ${result.glitches.toLocaleString()} (${glitchPct}%) across ${result.affected} trail(s)`)
      if (writeMode) console.log(`  │ Written: ${result.written} trail(s)`)
    } else {
      console.log(`  │ ✅ Clean — no glitches detected`)
    }
    console.log(`  └${'─'.repeat(60)}\n`)

    // Update ledger
    batchMaps++
    batchTrails += result.trails
    batchPoints += result.points
    batchGlitches += result.glitches
    batchWritten += result.written

    ledger[map.id] = {
      status: writeMode ? 'completed' : 'dry-run',
      name: mapName,
      timestamp: new Date().toISOString(),
      stats: {
        operations: result.operations,
        trails: result.trails,
        points: result.points,
        glitches: result.glitches,
        affected: result.affected,
        written: result.written,
      },
    }
    saveLedger(ledger) // Save after each map so progress isn't lost on crash
  }

  // Batch summary
  const totalMaps = maps.length
  const completedMaps = Object.values(ledger).filter((e) => e.status === 'completed').length
  const remaining = totalMaps - completedMaps

  console.log(`${'═'.repeat(80)}`)
  console.log(`  BATCH SUMMARY — ${writeMode ? '🔴 WRITE MODE' : '🔍 DRY RUN'}`)
  console.log(`${'═'.repeat(80)}`)
  console.log(`  Maps processed:    ${batchMaps}`)
  console.log(`  Trails scanned:    ${batchTrails.toLocaleString()}`)
  console.log(`  Total points:      ${batchPoints.toLocaleString()}`)
  console.log(`  Glitches found:    ${batchGlitches.toLocaleString()}`)
  if (writeMode) {
    console.log(`  Trails written:    ${batchWritten}`)
  }
  console.log()
  console.log(`  Overall progress:  ${completedMaps}/${totalMaps} maps completed — ${remaining} remaining`)

  if (!writeMode && batchGlitches > 0) {
    console.log(`\n  Run with --write to apply changes.`)
  }
  if (remaining > 0 && !specificMap) {
    console.log(`  Run again to process next batch.`)
  }
  console.log()
}

// ════════════════════════════════════════════
//  Entry point
// ════════════════════════════════════════════
async function main() {
  if (resetMode) return cmdReset()
  if (listMode) return cmdList()
  return cmdBatch()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
