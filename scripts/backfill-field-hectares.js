/**
 * backfill-field-hectares.js
 *
 * Reads the `properties` JSONB column on each field for a given map,
 * extracts the "area" value (e.g. "110 ha"), parses the number, and
 * writes it into the `area` column so the app shows the correct
 * custom hectares.
 *
 * Usage:
 *   node scripts/backfill-field-hectares.js                   # dry-run (read-only)
 *   node scripts/backfill-field-hectares.js --apply            # actually update the DB
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE
)

const MAP_ID = 'f9265c5c-2333-4601-93e0-e30b54c3c919'
const DRY_RUN = !process.argv.includes('--apply')

// ─── Helpers ──────────────────────────────────────────────

/**
 * Parse an area string like "110 ha", "23.5ha", "1,200 hectares" → number | null
 */
function parseArea(raw) {
  if (raw == null) return null
  const str = String(raw).replace(/,/g, '').trim()           // strip commas
  const match = str.match(/^([\d.]+)\s*(ha|hectares?|ac|acres?)?$/i)
  if (!match) return null
  const num = parseFloat(match[1])
  return isNaN(num) ? null : num
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log(`\n🌾  Backfill field hectares from properties.area`)
  console.log(`    Map ID : ${MAP_ID}`)
  console.log(`    Mode   : ${DRY_RUN ? '🔍 DRY-RUN (pass --apply to write)' : '⚡ APPLY'}\n`)

  // Fetch all fields for this map
  const { data: fields, error } = await supabase
    .from('fields')
    .select('field_id, name, area, properties')
    .eq('map_id', MAP_ID)

  if (error) {
    console.error('❌ Failed to fetch fields:', error.message)
    process.exit(1)
  }

  console.log(`📋 Found ${fields.length} field(s) for this map\n`)

  let updated = 0
  let skipped = 0
  let noArea = 0
  let alreadySet = 0

  for (const field of fields) {
    const props = field.properties || {}
    const rawArea = props.area
    const parsed = parseArea(rawArea)

    if (parsed === null) {
      noArea++
      console.log(`   ⏭  "${field.name}" — no parseable area in properties (raw: ${JSON.stringify(rawArea)})`)
      continue
    }

    // Skip if the area column already matches
    if (field.area !== null && Number(field.area) === parsed) {
      alreadySet++
      console.log(`   ✅ "${field.name}" — already ${parsed} ha`)
      continue
    }

    if (DRY_RUN) {
      console.log(`   🔍 "${field.name}" — would set area ${field.area ?? 'NULL'} → ${parsed} ha`)
      updated++
      continue
    }

    // Actually update
    const { error: updateError } = await supabase
      .from('fields')
      .update({ area: parsed })
      .eq('field_id', field.field_id)

    if (updateError) {
      console.error(`   ❌ "${field.name}" — update failed: ${updateError.message}`)
      skipped++
    } else {
      console.log(`   ✏️  "${field.name}" — set area → ${parsed} ha`)
      updated++
    }
  }

  console.log(`\n── Summary ──────────────────────────`)
  console.log(`   Total fields : ${fields.length}`)
  console.log(`   Updated      : ${updated}`)
  console.log(`   Already set  : ${alreadySet}`)
  console.log(`   No area prop : ${noArea}`)
  console.log(`   Errors       : ${skipped}`)
  if (DRY_RUN) console.log(`\n   ⚠️  Dry-run — no changes written. Run with --apply to commit.`)
  console.log()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
