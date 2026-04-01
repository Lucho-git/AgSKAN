#!/usr/bin/env node
/**
 * Sync ALL active Stripe subscriptions → Supabase user_subscriptions.
 *
 * This handles the gap where customers subscribe via Payment Links
 * (or any path that bypasses create-checkout), so no stripe_customers
 * row exists and webhooks fail.
 *
 * What it does:
 *   1. Lists every active/trialing subscription in Stripe
 *   2. For each, tries to resolve the Supabase user_id via:
 *      a) stripe_customers table (existing mapping)
 *      b) Stripe customer metadata.user_id
 *      c) Email match in profiles table
 *   3. Creates missing stripe_customers entries (so future webhooks work)
 *   4. Updates user_subscriptions with correct plan, seats, status
 *
 * Usage:
 *   DRY RUN (default):  node scripts/sync-stripe-subscriptions.js
 *   APPLY FOR REAL:      node scripts/sync-stripe-subscriptions.js --execute
 */

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE
);
const stripe = new Stripe(process.env.PRIVATE_STRIPE_API_KEY, {
  apiVersion: "2023-08-16",
});

const DRY_RUN = !process.argv.includes("--execute");

// Plan limits
const PRO_MARKER_LIMIT = 999999;
const PRO_TRAIL_LIMIT = 999999;
const FREE_MARKER_LIMIT = 100;
const FREE_TRAIL_LIMIT = 100000;

function mapSubscriptionToUpdate(subscription) {
  const item = subscription.items.data[0];
  const interval = item?.price.recurring?.interval || "year";
  const seats = item?.quantity || 1;
  const status = subscription.status;
  const isActive = ["trialing", "active"].includes(status);
  const planName = isActive
    ? item?.price.nickname || "AgSKAN Pro Annual (Standard)"
    : "FREE";

  return {
    subscription: planName,
    subscription_status: status,
    stripe_subscription_id: subscription.id,
    current_seats: isActive ? seats : 0,
    marker_limit: isActive ? PRO_MARKER_LIMIT : FREE_MARKER_LIMIT,
    trail_limit: isActive ? PRO_TRAIL_LIMIT : FREE_TRAIL_LIMIT,
    payment_interval: interval,
    next_billing_date: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  console.log(`\n${"=".repeat(64)}`);
  console.log("  Sync Stripe Subscriptions → Supabase");
  console.log(
    `  Mode: ${DRY_RUN ? "🔍 DRY RUN (no changes)" : "🚀 LIVE EXECUTION"}`
  );
  console.log(`${"=".repeat(64)}\n`);

  // ── 1. Load existing stripe_customers mappings ──
  const { data: existingMappings, error: mapErr } = await supabase
    .from("stripe_customers")
    .select("user_id, stripe_customer_id");

  if (mapErr) {
    console.error("Failed to load stripe_customers:", mapErr);
    return;
  }

  const customerToUser = new Map();
  for (const row of existingMappings) {
    customerToUser.set(row.stripe_customer_id, row.user_id);
  }
  console.log(
    `Loaded ${existingMappings.length} existing stripe_customers mappings\n`
  );

  // ── 2. Load all profiles (for email-based fallback) ──
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, email, full_name");

  if (profileErr) {
    console.error("Failed to load profiles:", profileErr);
    return;
  }

  const emailToProfile = new Map();
  for (const p of profiles) {
    if (p.email) emailToProfile.set(p.email.toLowerCase(), p);
  }
  console.log(`Loaded ${profiles.length} profiles for email matching\n`);

  // ── 3. List active/trialing Stripe subscriptions ──
  console.log("Fetching active/trialing subscriptions from Stripe...\n");

  const subscriptions = [];
  for await (const sub of stripe.subscriptions.list({
    status: "active",
    limit: 100,
    expand: ["data.customer"],
  })) {
    subscriptions.push(sub);
  }
  for await (const sub of stripe.subscriptions.list({
    status: "trialing",
    limit: 100,
    expand: ["data.customer"],
  })) {
    subscriptions.push(sub);
  }

  console.log(
    `Found ${subscriptions.length} active/trialing subscriptions\n`
  );

  // ── 4. Process each subscription ──
  let synced = 0;
  let backfilled = 0;
  let skipped = 0;
  let errors = 0;

  for (const sub of subscriptions) {
    const customer =
      typeof sub.customer === "string"
        ? await stripe.customers.retrieve(sub.customer)
        : sub.customer;

    if (customer.deleted) {
      console.log(`  ⚠ Skipping deleted customer: ${customer.id}`);
      skipped++;
      continue;
    }

    const customerId = customer.id;
    const customerEmail = customer.email?.toLowerCase();
    const item = sub.items.data[0];
    const seats = item?.quantity || 1;

    // ── Resolve user_id ──
    let userId = customerToUser.get(customerId);
    let needsBackfill = false;
    let resolvedVia = "stripe_customers";

    if (!userId && customer.metadata?.user_id) {
      userId = customer.metadata.user_id;
      needsBackfill = true;
      resolvedVia = "Stripe metadata";
    }

    if (!userId && customerEmail) {
      const profile = emailToProfile.get(customerEmail);
      if (profile) {
        userId = profile.id;
        needsBackfill = true;
        resolvedVia = `email (${customerEmail})`;
      }
    }

    if (!userId) {
      console.log(
        `  ✗ UNRESOLVED: ${customer.name || "?"} <${customer.email || "?"}> ` +
          `(customer: ${customerId}, sub: ${sub.id})`
      );
      errors++;
      continue;
    }

    const updateData = mapSubscriptionToUpdate(sub);

    console.log(
      `  ${needsBackfill ? "⚡" : "✓"} ${customer.name || customer.email || customerId}`
    );
    console.log(
      `    Resolved via: ${resolvedVia} → user: ${userId.slice(0, 8)}...`
    );
    console.log(
      `    Plan: ${updateData.subscription} | Status: ${sub.status} | Seats: ${seats}`
    );

    if (needsBackfill) {
      console.log(
        `    🔗 Backfill stripe_customers: ${customerId} → ${userId.slice(0, 8)}...`
      );
    }

    if (!DRY_RUN) {
      try {
        // Backfill stripe_customers if needed
        if (needsBackfill) {
          const { error: upsertErr } = await supabase
            .from("stripe_customers")
            .upsert({
              user_id: userId,
              stripe_customer_id: customerId,
            });

          if (upsertErr) {
            console.error(
              `    ✗ Failed to backfill stripe_customers:`,
              upsertErr.message
            );
            errors++;
            continue;
          }
          backfilled++;
        }

        // Update user_subscriptions
        const { error: updateErr } = await supabase
          .from("user_subscriptions")
          .update(updateData)
          .eq("user_id", userId);

        if (updateErr) {
          console.error(
            `    ✗ Failed to update user_subscriptions:`,
            updateErr.message
          );
          errors++;
        } else {
          synced++;
        }
      } catch (err) {
        console.error(`    ✗ Error:`, err.message);
        errors++;
      }
    } else {
      synced++;
      if (needsBackfill) backfilled++;
    }
  }

  // ── Summary ──
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  Summary${DRY_RUN ? " (DRY RUN — nothing changed)" : ""}:`);
  console.log(`    Subscriptions synced:      ${synced}`);
  console.log(`    stripe_customers backfilled: ${backfilled}`);
  console.log(`    Skipped (deleted):         ${skipped}`);
  console.log(`    Errors / unresolved:       ${errors}`);
  console.log(`${"─".repeat(64)}\n`);

  if (DRY_RUN && (backfilled > 0 || errors > 0)) {
    console.log(
      "  Run with --execute to apply these changes:\n" +
        "    node scripts/sync-stripe-subscriptions.js --execute\n"
    );
  }
}

main().catch(console.error);
