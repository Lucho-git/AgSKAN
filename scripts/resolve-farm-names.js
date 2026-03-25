/**
 * resolve-farm-names.js
 * 
 * Admin script to identify fields that were uploaded from different shapefiles
 * but assigned to the same farm. Groups fields by
 * (map_id, originalFileName, created_at bucket) so you can assign the correct
 * farm per upload batch.
 *
 * Now works with the normalised `farms` table: each farm has a UUID id, and
 * fields reference farms via `farm_id` FK.
 *
 * Usage:
 *   node --experimental-modules scripts/resolve-farm-names.js            # scan mode (read-only)
 *   node --experimental-modules scripts/resolve-farm-names.js --resolve  # interactive resolve mode
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import readline from 'readline'

dotenv.config()

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE
)

const RESOLVE_MODE = process.argv.includes('--resolve')

// ─── Helpers ──────────────────────────────────────────────

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/** Group an array by a key function */
function groupBy(arr, keyFn) {
  const map = new Map()
  for (const item of arr) {
    const key = keyFn(item)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return map
}

/** Round a date to the nearest 5-minute bucket for grouping uploads */
function timeBucket(dateStr) {
  if (!dateStr) return 'unknown'
  const d = new Date(dateStr)
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0)
  return d.toISOString()
}

/**
 * Find or create a farm row in the `farms` table.
 * Returns the farm id.
 */
async function getOrCreateFarm(mapId, farmName) {
  // Try to find existing
  const { data: existing } = await supabase
    .from('farms')
    .select('id')
    .eq('map_id', mapId)
    .eq('name', farmName)
    .maybeSingle()

  if (existing) return existing.id

  // Create new
  const { data: created, error } = await supabase
    .from('farms')
    .insert({ map_id: mapId, name: farmName })
    .select('id')
    .single()

  if (error) {
    // Handle race-condition duplicate
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('farms')
        .select('id')
        .eq('map_id', mapId)
        .eq('name', farmName)
        .single()
      return retry?.id
    }
    throw new Error(`Failed to create farm "${farmName}": ${error.message}`)
  }
  return created.id
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log('🔍 Scanning all fields for multi-source uploads...\n')

  // 1. Fetch all fields with their properties
  const { data: allFields, error: fieldsErr } = await supabase
    .from('fields')
    .select('field_id, map_id, name, area, farm_id, properties, created_at')
    .order('map_id', { ascending: true })
    .order('created_at', { ascending: true })

  if (fieldsErr) {
    console.error('❌ Error fetching fields:', fieldsErr.message)
    process.exit(1)
  }

  console.log(`📊 Total fields: ${allFields.length}`)

  // 2. Fetch all farms for lookup
  const { data: allFarms } = await supabase
    .from('farms')
    .select('id, map_id, name')

  const farmNameById = Object.fromEntries((allFarms || []).map(f => [f.id, f.name]))

  // 3. Get map names for display
  const mapIds = [...new Set(allFields.map(f => f.map_id))]
  const { data: maps } = await supabase
    .from('master_maps')
    .select('id, map_name')
    .in('id', mapIds)

  const mapNameLookup = Object.fromEntries((maps || []).map(m => [m.id, m.map_name]))

  // 4. Get profile info (user email) for each map
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, master_map_id')
    .in('master_map_id', mapIds)

  const mapUserLookup = Object.fromEntries(
    (profiles || []).map(p => [p.master_map_id, p.email || p.id])
  )

  // 5. Group fields by map_id
  const fieldsByMap = groupBy(allFields, f => f.map_id)

  let mapsNeedingResolution = 0
  let totalBatches = 0
  const results = []

  for (const [mapId, fields] of fieldsByMap) {
    // Group by source file + upload time bucket
    const batches = groupBy(fields, f => {
      const fileName = f.properties?.originalFileName || 'unknown'
      const bucket = timeBucket(f.created_at)
      return `${fileName}|||${bucket}`
    })

    // Only flag maps with multiple distinct source batches
    if (batches.size <= 1) continue

    // Check if all batches share the same farm (i.e. unresolved backfill)
    const uniqueFarmIds = new Set(fields.map(f => f.farm_id).filter(Boolean))
    const uniqueFarmNames = [...uniqueFarmIds].map(id => farmNameById[id] || id)
    const allSameFarm = uniqueFarmIds.size <= 1

    mapsNeedingResolution++

    const mapInfo = {
      mapId,
      mapName: mapNameLookup[mapId] || 'Unknown',
      user: mapUserLookup[mapId] || 'Unknown',
      totalFields: fields.length,
      batchCount: batches.size,
      allSameFarm,
      currentFarmNames: uniqueFarmNames,
      batches: [],
    }

    for (const [batchKey, batchFields] of batches) {
      const [fileName, timeBucketStr] = batchKey.split('|||')

      // Extract any farm-related metadata from the shapefile properties
      const sampleProps = batchFields[0]?.properties || {}
      const detectedFarm = sampleProps.farm || sampleProps.FARM || sampleProps.FARM_NAME ||
        sampleProps.farm_name || sampleProps.FarmName || sampleProps.CLIENTNAME ||
        sampleProps.client_name || sampleProps.client || sampleProps.OWNER ||
        sampleProps.owner || sampleProps.property_n || null

      const currentFarmId = batchFields[0]?.farm_id
      const currentFarmName = currentFarmId ? (farmNameById[currentFarmId] || 'unknown') : 'none'

      mapInfo.batches.push({
        fileName,
        uploadTime: timeBucketStr,
        fieldCount: batchFields.length,
        currentFarmName,
        currentFarmId,
        detectedFarmFromMetadata: detectedFarm,
        sampleFieldNames: batchFields.slice(0, 5).map(f => f.name),
        fieldIds: batchFields.map(f => f.field_id),
        sourceType: sampleProps.sourceType || 'unknown',
      })
      totalBatches++
    }

    results.push(mapInfo)
  }

  // ─── Report ───────────────────────────────────────────────

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`📋 FARM RESOLUTION REPORT`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`Maps with multiple upload sources: ${mapsNeedingResolution}`)
  console.log(`Total upload batches to review:    ${totalBatches}`)
  console.log(`${'═'.repeat(70)}\n`)

  for (const mapInfo of results) {
    const status = mapInfo.allSameFarm ? '⚠️  NEEDS RESOLUTION' : '✅ Already differentiated'
    console.log(`${'─'.repeat(70)}`)
    console.log(`🗺️  Map: ${mapInfo.mapName}  (${mapInfo.mapId})`)
    console.log(`👤 User: ${mapInfo.user}`)
    console.log(`📊 ${mapInfo.totalFields} fields across ${mapInfo.batchCount} upload batches`)
    console.log(`🏷️  Current farms: ${mapInfo.currentFarmNames.join(', ') || 'none'}`)
    console.log(`   Status: ${status}`)
    console.log()

    for (let i = 0; i < mapInfo.batches.length; i++) {
      const batch = mapInfo.batches[i]
      console.log(`   📁 Batch ${i + 1}: "${batch.fileName}"`)
      console.log(`      Source type: ${batch.sourceType}`)
      console.log(`      Upload time: ${batch.uploadTime}`)
      console.log(`      Fields: ${batch.fieldCount}`)
      console.log(`      Current farm: ${batch.currentFarmName}`)
      if (batch.detectedFarmFromMetadata) {
        console.log(`      🔍 Detected farm from metadata: "${batch.detectedFarmFromMetadata}"`)
      }
      console.log(`      Sample fields: ${batch.sampleFieldNames.join(', ')}`)
      console.log()
    }
  }

  // ─── Interactive Resolve Mode ─────────────────────────────

  if (!RESOLVE_MODE) {
    console.log(`\n💡 Run with --resolve to interactively assign farms:`)
    console.log(`   node --experimental-modules scripts/resolve-farm-names.js --resolve\n`)
    return
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`🔧 INTERACTIVE RESOLUTION MODE`)
  console.log(`${'═'.repeat(70)}\n`)
  console.log('For each upload batch, enter the farm name to assign.')
  console.log('A farm row will be created in the farms table if it does not exist.')
  console.log('Press Enter to skip, or type "skip" to skip a whole map.\n')

  let updatedBatches = 0
  let updatedFields = 0

  for (const mapInfo of results) {
    console.log(`\n${'─'.repeat(70)}`)
    console.log(`🗺️  Map: ${mapInfo.mapName}  |  👤 ${mapInfo.user}`)
    console.log(`   ${mapInfo.totalFields} fields, ${mapInfo.batchCount} batches\n`)

    const skipMap = await prompt('   Process this map? (Y/n/skip): ')
    if (skipMap.toLowerCase() === 'n' || skipMap.toLowerCase() === 'skip') {
      console.log('   ⏭️  Skipping map\n')
      continue
    }

    for (let i = 0; i < mapInfo.batches.length; i++) {
      const batch = mapInfo.batches[i]
      console.log(`\n   📁 Batch ${i + 1}/${mapInfo.batches.length}: "${batch.fileName}"`)
      console.log(`      ${batch.fieldCount} fields | Current farm: "${batch.currentFarmName}"`)
      if (batch.detectedFarmFromMetadata) {
        console.log(`      🔍 Detected: "${batch.detectedFarmFromMetadata}"`)
      }
      console.log(`      Sample: ${batch.sampleFieldNames.join(', ')}`)

      const suggestion = batch.detectedFarmFromMetadata || batch.fileName.replace(/\.(shp|kml|zip|geojson)$/i, '')
      const newName = await prompt(`      New farm name [${suggestion}] (or "skip"): `)

      if (newName.toLowerCase() === 'skip' || newName.toLowerCase() === 's') {
        console.log('      ⏭️  Skipped')
        continue
      }

      const farmName = newName || suggestion
      if (!farmName) {
        console.log('      ⏭️  Skipped (no name)')
        continue
      }

      // Find or create the farm, then update fields
      console.log(`      ✏️  Resolving farm "${farmName}" for ${batch.fieldIds.length} fields...`)

      try {
        const farmId = await getOrCreateFarm(mapInfo.mapId, farmName)

        const { error: updateErr } = await supabase
          .from('fields')
          .update({ farm_id: farmId })
          .in('field_id', batch.fieldIds)

        if (updateErr) {
          console.error(`      ❌ Error: ${updateErr.message}`)
        } else {
          console.log(`      ✅ Updated ${batch.fieldIds.length} fields → farm "${farmName}" (${farmId})`)
          updatedBatches++
          updatedFields += batch.fieldIds.length
        }
      } catch (err) {
        console.error(`      ❌ ${err.message}`)
      }
    }
  }

  console.log(`\n${'═'.repeat(70)}`)
  console.log(`✅ RESOLUTION COMPLETE`)
  console.log(`   Batches updated: ${updatedBatches}`)
  console.log(`   Fields updated:  ${updatedFields}`)
  console.log(`${'═'.repeat(70)}\n`)
}

main().catch(console.error)
