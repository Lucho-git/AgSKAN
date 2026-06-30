// scripts/sync-jack-subscription.mjs
// Syncs Jack Sutherland's Stripe subscription data into user_subscriptions
// Run: node scripts/sync-jack-subscription.mjs

import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
dotenv.config()

const stripeApiKey = process.env.PRIVATE_STRIPE_API_KEY
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL
const supabaseServiceRole = process.env.PRIVATE_SUPABASE_SERVICE_ROLE

if (!stripeApiKey || !supabaseUrl || !supabaseServiceRole) {
  console.error("Missing environment variables")
  process.exit(1)
}

const stripe = new Stripe(stripeApiKey, { apiVersion: "2023-10-16" })
const supabase = createClient(supabaseUrl, supabaseServiceRole)

const STRIPE_CUSTOMER_ID = "cus_UTc59x7fsIwDhX"  // Dale Sutherland - has the active sub
const USER_ID = "2dc06b40-89ae-4c99-8684-78652f868ac1"

async function main() {
  // 1. Find active subscription for the correct customer
  const subscriptions = await stripe.subscriptions.list({
    customer: STRIPE_CUSTOMER_ID,
    limit: 5,
  })

  const sub = subscriptions.data.find(s => s.status === "active" || s.status === "trialing")
  if (!sub) {
    console.log("No active subscription found for", STRIPE_CUSTOMER_ID)
    return
  }

  console.log("Found subscription:", sub.id)
  console.log("  Status:", sub.status)
  console.log("  Items:", sub.items.data.map(i => `${i.quantity}x ${i.price.nickname || i.price.id}`).join(", "))
  console.log("  Period end:", new Date(sub.current_period_end * 1000).toISOString())
  console.log("  Interval:", sub.items.data[0]?.plan?.interval)

  // 2. Link the correct Stripe customer to Jack's profile
  await supabase
    .from("stripe_customers")
    .upsert({ user_id: USER_ID, stripe_customer_id: STRIPE_CUSTOMER_ID }, { onConflict: "user_id" })

  // 3. Update user_subscriptions with real Stripe data
  const { error } = await supabase
    .from("user_subscriptions")
    .upsert({
      user_id: USER_ID,
      subscription: "Pro",
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      current_seats: sub.items.data[0]?.quantity || 1,
      next_billing_date: new Date(sub.current_period_end * 1000).toISOString(),
      payment_interval: sub.items.data[0]?.plan?.interval || "year",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })

  if (error) {
    console.error("Failed to update user_subscriptions:", error)
    process.exit(1)
  }

  console.log("✅ Updated stripe_customers →", STRIPE_CUSTOMER_ID)
  console.log("✅ Updated user_subscriptions with Stripe data")

  // 4. Verify
  const { data: verify } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", USER_ID)
    .single()

  console.log("✅ Verified:", JSON.stringify(verify, null, 2))
}

main().catch(console.error)
