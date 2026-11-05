#!/usr/bin/env node
/**
 * Backfill stripe_invoices from Stripe.
 *
 * cron-invoice-reminders can only chase invoices that exist in the stripe_invoices
 * table. The Stripe webhook now writes a row for every invoice it sees, but invoices
 * raised before that fix are missing, so the cron has nothing to chase for them.
 * Run this once to load the overdue/open invoices that already exist in Stripe.
 *
 * Usage:
 *   DRY RUN (default):  node scripts/backfill-stripe-invoices.js
 *   APPLY FOR REAL:      node scripts/backfill-stripe-invoices.js --execute
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

function toRow(invoice) {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  return {
    id: invoice.id,
    customer_id: customerId,
    subscription_id: subscriptionId,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    amount_due: invoice.amount_due ?? 0,
    status: invoice.status ?? null,
    due_date: invoice.due_date
      ? new Date(invoice.due_date * 1000).toISOString()
      : null,
    created: new Date((invoice.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  };
}

/** Resolve the app user for a Stripe customer, the same way the cron does. */
async function resolveUserId(customerId, subscriptionId, customerByStripeId) {
  if (customerByStripeId.has(customerId)) return customerByStripeId.get(customerId);

  if (subscriptionId) {
    const { data } = await supabase
      .from("user_subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscriptionId)
      .limit(1);
    if (data?.[0]?.user_id) return data[0].user_id;
  }

  return null;
}

async function main() {
  console.log(`\n${"=".repeat(64)}`);
  console.log("  Backfill Stripe Invoices → Supabase");
  console.log(`  Mode: ${DRY_RUN ? "🔍 DRY RUN (no changes)" : "🚀 LIVE EXECUTION"}`);
  console.log(`${"=".repeat(64)}\n`);

  // ── 1. Load stripe_customers mapping ──
  const { data: mappings, error: mapErr } = await supabase
    .from("stripe_customers")
    .select("user_id, stripe_customer_id");

  if (mapErr) {
    console.error("✗ Failed to load stripe_customers:", mapErr.message);
    process.exit(1);
  }

  const customerByStripeId = new Map(
    (mappings ?? []).map((m) => [m.stripe_customer_id, m.user_id])
  );
  console.log(`Loaded ${customerByStripeId.size} stripe_customers mappings\n`);

  // ── 2. Existing rows, so we can report what is new ──
  const { data: existing } = await supabase.from("stripe_invoices").select("id");
  const existingIds = new Set((existing ?? []).map((r) => r.id));
  console.log(`stripe_invoices already holds ${existingIds.size} rows\n`);

  // ── 3. Pull every open invoice from Stripe ──
  const invoices = [];
  for await (const invoice of stripe.invoices.list({ status: "open", limit: 100 })) {
    invoices.push(invoice);
  }

  console.log(`Stripe reports ${invoices.length} open invoice(s)\n`);

  const rows = [];
  let missingCustomers = 0;

  for (const invoice of invoices) {
    const row = toRow(invoice);
    if (!row.customer_id) {
      console.log(`  ⚠ ${invoice.id}: no customer — skipped`);
      missingCustomers++;
      continue;
    }

    const userId = await resolveUserId(row.customer_id, row.subscription_id, customerByStripeId);
    const due = row.due_date ? new Date(row.due_date).toISOString().slice(0, 10) : "no due date";
    const amount = ((row.amount_due ?? 0) / 100).toFixed(2);
    const isNew = existingIds.has(row.id) ? "update" : "new   ";
    const user = userId ? userId.slice(0, 8) : "NO USER";

    console.log(`  ${isNew} ${row.id}  $${amount}  due ${due}  user ${user}`);

    if (!userId) missingCustomers++;
    rows.push(row);
  }

  console.log(`\n${rows.length} invoice(s) ready to upsert`);
  if (missingCustomers > 0) {
    console.log(
      `⚠ ${missingCustomers} invoice(s) have no matching app user — the cron will skip those until stripe_customers is linked`
    );
  }

  if (DRY_RUN) {
    console.log("\nDry run — nothing written. Re-run with --execute to apply.\n");
    return;
  }

  if (rows.length === 0) {
    console.log("\nNothing to do.\n");
    return;
  }

  const { error: upsertErr } = await supabase
    .from("stripe_invoices")
    .upsert(rows, { onConflict: "id" });

  if (upsertErr) {
    console.error("\n✗ Upsert failed:", upsertErr.message);
    process.exit(1);
  }

  console.log(`\n✓ Upserted ${rows.length} invoice(s) into stripe_invoices\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
