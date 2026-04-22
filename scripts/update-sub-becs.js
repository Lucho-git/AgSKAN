#!/usr/bin/env node
/**
 * Update a subscription + its overdue invoice to accept BECS Direct Debit.
 *
 * What it does:
 *  1. Fetches the subscription and shows current state
 *  2. Updates the subscription payment_settings to allow card + au_becs_debit
 *  3. Finds any open/overdue invoices and patches them too
 *
 * Usage:
 *   DRY RUN (default):  node scripts/update-sub-becs.js
 *   APPLY FOR REAL:     node scripts/update-sub-becs.js --execute
 */

import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

const stripe = new Stripe(process.env.PRIVATE_STRIPE_API_KEY);

const SUBSCRIPTION_ID = "sub_1RBPHXK3At0l0k1HOw1HDHJ1";
const EXECUTE = process.argv.includes("--execute");

async function main() {
  console.log(EXECUTE ? "🔴 LIVE RUN\n" : "🟡 DRY RUN (pass --execute to apply)\n");

  // ── 1. Fetch subscription ──
  const sub = await stripe.subscriptions.retrieve(SUBSCRIPTION_ID);
  console.log("Subscription:", sub.id);
  console.log("  Status:", sub.status);
  console.log("  Currency:", sub.currency);
  console.log("  Collection method:", sub.collection_method);
  console.log("  Current payment_method_types:", sub.payment_settings?.payment_method_types || "automatic");
  console.log("  Customer:", sub.customer);

  if (sub.currency !== "aud") {
    console.error("\n❌ Currency is", sub.currency, "— BECS Direct Debit requires AUD. Aborting.");
    process.exit(1);
  }

  // ── 2. Check customer has name + email (BECS mandate requirement) ──
  const customer = await stripe.customers.retrieve(sub.customer);
  console.log("\nCustomer:", customer.id);
  console.log("  Name:", customer.name || "⚠️  MISSING");
  console.log("  Email:", customer.email || "⚠️  MISSING");

  if (!customer.name || !customer.email) {
    console.error("\n❌ BECS mandates require customer name and email. Fix in Stripe Dashboard first.");
    process.exit(1);
  }

  // ── 3. Update subscription ──
  console.log("\n--- Subscription Update ---");
  console.log("  payment_method_types: [card, au_becs_debit]");
  console.log("  save_default_payment_method: on_subscription");

  if (EXECUTE) {
    const updated = await stripe.subscriptions.update(SUBSCRIPTION_ID, {
      payment_settings: {
        payment_method_types: ["card", "au_becs_debit"],
        save_default_payment_method: "on_subscription",
      },
    });
    console.log("  ✅ Subscription updated. New payment_method_types:", updated.payment_settings.payment_method_types);
  } else {
    console.log("  (skipped — dry run)");
  }

  // ── 4. Find and update open/overdue invoices ──
  const invoices = await stripe.invoices.list({
    subscription: SUBSCRIPTION_ID,
    status: "open",
    limit: 10,
  });

  console.log(`\n--- Open Invoices: ${invoices.data.length} ---`);

  for (const inv of invoices.data) {
    console.log(`\n  Invoice: ${inv.id}`);
    console.log(`    Amount due: ${(inv.amount_due / 100).toFixed(2)} ${inv.currency.toUpperCase()}`);
    console.log(`    Due date: ${inv.due_date ? new Date(inv.due_date * 1000).toISOString().slice(0, 10) : "n/a"}`);
    console.log(`    Current payment_method_types:`, inv.payment_settings?.payment_method_types || "automatic");
    console.log(`    Hosted invoice URL: ${inv.hosted_invoice_url}`);

    if (EXECUTE) {
      const updatedInv = await stripe.invoices.update(inv.id, {
        payment_settings: {
          payment_method_types: ["card", "au_becs_debit"],
        },
      });
      console.log(`    ✅ Invoice updated. New payment_method_types:`, updatedInv.payment_settings.payment_method_types);
    } else {
      console.log(`    (skipped — dry run)`);
    }
  }

  if (invoices.data.length === 0) {
    console.log("  No open invoices found. You may need to check for 'past_due' invoices in the Dashboard.");
  }

  console.log("\n✅ Done.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
