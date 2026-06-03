// scripts/backfill-join-codes.js
// Generates unique 6-digit join codes for all existing master_maps that don't have one.
// Run: node scripts/backfill-join-codes.js

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE
)

function generateCode() {
  // 6-digit numeric code (100000-999999)
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function main() {
  console.log('=== Backfilling join codes for master_maps ===\n')

  // Fetch all maps without a join_code
  const { data: maps, error } = await supabase
    .from('master_maps')
    .select('id, map_name')
    .is('join_code', null)

  if (error) {
    console.error('Error fetching maps:', error)
    process.exit(1)
  }

  if (!maps || maps.length === 0) {
    console.log('All maps already have join codes. Nothing to do.')
    return
  }

  console.log(`Found ${maps.length} maps without join codes\n`)

  // Fetch all existing join codes to avoid collisions
  const { data: existingCodes } = await supabase
    .from('master_maps')
    .select('join_code')
    .not('join_code', 'is', null)

  const usedCodes = new Set(existingCodes?.map((m) => m.join_code) || [])

  let success = 0
  let failures = 0

  for (const map of maps) {
    let code
    let attempts = 0

    // Generate a unique code (retry up to 100 times to avoid collisions)
    do {
      code = generateCode()
      attempts++
      if (attempts > 100) {
        console.error(`  ❌ Could not generate unique code for map ${map.map_name} (${map.id}) after 100 attempts`)
        failures++
        code = null
        break
      }
    } while (usedCodes.has(code))

    if (!code) continue

    usedCodes.add(code)

    const { error: updateError } = await supabase
      .from('master_maps')
      .update({ join_code: code })
      .eq('id', map.id)

    if (updateError) {
      console.error(`  ❌ Failed to update ${map.map_name}: ${updateError.message}`)
      failures++
    } else {
      console.log(`  ✅ ${map.map_name} → ${code}`)
      success++
    }
  }

  console.log(`\nDone. ${success} updated, ${failures} failed.`)
}

main().catch(console.error)
