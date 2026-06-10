// scripts/backfill-stripe-customers.mjs
// Creates Stripe customers for all existing map owners who don't have one yet.
// Run: node scripts/backfill-stripe-customers.mjs

import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import "dotenv/config"

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL
const supabaseServiceRole = process.env.PRIVATE_SUPABASE_SERVICE_ROLE
const stripeApiKey = process.env.PRIVATE_STRIPE_API_KEY

if (!supabaseUrl || !supabaseServiceRole || !stripeApiKey) {
  console.error("Missing env vars")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRole)
const stripe = new Stripe(stripeApiKey, { apiVersion: "2023-10-16" })

async function main() {
  // Get existing Stripe customer IDs
  const { data: existing } = await supabase.from("stripe_customers").select("user_id")
  const existingIds = new Set((existing || []).map((r) => r.user_id))

  // Get unique map owner IDs
  const { data: owners } = await supabase.from("master_maps").select("master_user_id")
  const ownerIds = [...new Set((owners || []).map((o) => o.master_user_id))]
  const needingBackfill = ownerIds.filter((id) => !existingIds.has(id))

  if (needingBackfill.length === 0) {
    console.log("All managers already have Stripe customers.")
    return
  }

  // Get profiles for those owners
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, company_name")
    .in("id", needingBackfill)

  if (!profiles?.length) {
    console.log("No profiles found.")
    return
  }

  console.log(`${profiles.length} managers to backfill...`)

  let created = 0, failed = 0
  for (const p of profiles) {
    try {
      const customer = await stripe.customers.create({
        email: p.email || undefined,
        name: p.full_name || undefined,
        metadata: { user_id: p.id, ...(p.company_name ? { company: p.company_name } : {}) },
      })
      await supabase.from("stripe_customers").insert({ user_id: p.id, stripe_customer_id: customer.id })
      created++
      console.log(`  ✅ ${p.email || p.id}`)
    } catch (err) {
      failed++
      console.error(`  ❌ ${p.email || p.id}:`, err.message)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  console.log(`\nDone: ${created} created, ${failed} failed`)
}

main().catch(console.error)
