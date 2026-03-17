#!/usr/bin/env node
/**
 * Migrate existing annual subscriptions to the new AgSKAN Pro price.
 *
 * What it does:
 *  - Finds all active/trialing subscriptions on OLD annual prices
 *  - Swaps them to the new standard price (price_1TBWyrK3At0l0k1HoyC9bStL)
 *  - Uses proration_behavior=none so NO charges/credits happen now
 *  - Keeps same renewal date, seat count, and billing cycle
 *
 * Skips:
 *  - Monthly subscriptions
 *  - Subscriptions already on the new price(s)
 *
 * Usage:
 *   DRY RUN (default):  node scripts/migrateToNewPrice.js
 *   LIVE RUN:           node scripts/migrateToNewPrice.js --execute
 */

import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

const stripe = new Stripe(process.env.PRIVATE_STRIPE_API_KEY);

// New target price
const NEW_PRICE_ID = "price_1TBWyrK3At0l0k1HoyC9bStL"; // AgSKAN Pro Annual (Standard) $365/yr

// New dev discount price (skip — already on new product)
const NEW_DEV_PRICE_ID = "price_1TBWz2K3At0l0k1H7fXrH3nf";

// Old prices to migrate FROM
const OLD_ANNUAL_PRICES = [
    "price_1PdxlVK3At0l0k1HoEgkFynm", // old "Discount" (yearly)
    "price_1Qrxo8K3At0l0k1Hz7ybpTts", // old "Test Annual" (yearly)
];

// Monthly price (skip)
const MONTHLY_PRICE = "price_1PkkO8K3At0l0k1HqvxEEBw2";

const DRY_RUN = !process.argv.includes("--execute");
const limitArg = process.argv.find(a => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

async function main() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  AgSKAN Price Migration`);
    console.log(`  Mode: ${DRY_RUN ? "🔍 DRY RUN (no changes)" : "🚀 LIVE EXECUTION"}`);
    console.log(`  Target price: ${NEW_PRICE_ID}`);
    if (LIMIT < Infinity) console.log(`  Limit: first ${LIMIT} eligible subscriptions`);
    console.log(`${"=".repeat(60)}\n`);

    // Fetch all active + trialing subscriptions
    const subscriptions = [];
    for (const status of ["active", "trialing"]) {
        let hasMore = true;
        let startingAfter = undefined;
        while (hasMore) {
            const params = { status, limit: 100, expand: ["data.items.data.price"] };
            if (startingAfter) params.starting_after = startingAfter;
            const batch = await stripe.subscriptions.list(params);
            subscriptions.push(...batch.data);
            hasMore = batch.has_more;
            if (batch.data.length > 0) {
                startingAfter = batch.data[batch.data.length - 1].id;
            }
        }
    }

    console.log(`Found ${subscriptions.length} active/trialing subscriptions\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const sub of subscriptions) {
        const item = sub.items.data[0];
        const priceId = item.price.id;
        const nickname = item.price.nickname || "(no name)";
        const interval = item.price.recurring?.interval || "?";
        const qty = item.quantity;
        const renewalDate = new Date(sub.current_period_end * 1000).toISOString().split("T")[0];

        // Skip if already on new prices
        if (priceId === NEW_PRICE_ID || priceId === NEW_DEV_PRICE_ID) {
            console.log(`  ⏩ ${sub.id} — already on new price (${nickname}), skip`);
            skipped++;
            continue;
        }

        // Skip monthly
        if (priceId === MONTHLY_PRICE || interval === "month") {
            console.log(`  ⏩ ${sub.id} — monthly subscription (${nickname}), skip`);
            skipped++;
            continue;
        }

        // Should be an old annual price
        if (!OLD_ANNUAL_PRICES.includes(priceId)) {
            console.log(`  ⚠️  ${sub.id} — unknown price ${priceId} (${nickname}), skip`);
            skipped++;
            continue;
        }

        // This subscription needs migrating
        if (migrated >= LIMIT) {
            console.log(`  ⏸️  ${sub.id} | ${qty} seats | "${nickname}" — limit reached, stopping`);
            break;
        }

        console.log(`  🔄 ${sub.id} | ${sub.status} | ${qty} seats | "${nickname}" → AgSKAN Pro | renews ${renewalDate}`);

        if (!DRY_RUN) {
            try {
                await stripe.subscriptions.update(sub.id, {
                    items: [
                        {
                            id: item.id,
                            price: NEW_PRICE_ID,
                            quantity: qty, // keep same seat count
                        },
                    ],
                    proration_behavior: "none", // no charges or credits
                });
                console.log(`     ✅ Migrated successfully`);
                migrated++;
            } catch (err) {
                console.error(`     ❌ Error: ${err.message}`);
                errors++;
            }
        } else {
            migrated++; // count as "would migrate"
        }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${DRY_RUN ? "Would migrate" : "Migrated"}: ${migrated}`);
    console.log(`  Skipped: ${skipped}`);
    if (errors > 0) console.log(`  Errors: ${errors}`);
    console.log(`${"=".repeat(60)}`);

    if (DRY_RUN && migrated > 0) {
        console.log(`\n  To execute for real, run:`);
        console.log(`  node scripts/migrateToNewPrice.js --execute\n`);
    }
}

main().catch(console.error);
