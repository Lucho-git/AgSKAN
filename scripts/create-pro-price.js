#!/usr/bin/env node
/**
 * Create a new AgSKAN Pro price at A$100/seat/month, billed annually ($1200/yr per seat).
 * Attaches to the same Stripe product as the existing AgSKAN Pro price.
 *
 * Usage:
 *   DRY RUN (default):  node scripts/create-pro-price.js
 *   CREATE FOR REAL:     node scripts/create-pro-price.js --execute
 */

import Stripe from "stripe";
import dotenv from "dotenv";
dotenv.config();

const stripe = new Stripe(process.env.PRIVATE_STRIPE_API_KEY);

// Current price to look up the product
const CURRENT_PRICE_ID = "price_1TBWyrK3At0l0k1HoyC9bStL";

const DRY_RUN = !process.argv.includes("--execute");

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Create AgSKAN Pro Annual Price — A$100/seat/month`);
  console.log(`  Mode: ${DRY_RUN ? "🔍 DRY RUN (no changes)" : "🚀 LIVE EXECUTION"}`);
  console.log(`${"=".repeat(60)}\n`);

  // Look up the current price to find its product
  console.log(`Looking up current price: ${CURRENT_PRICE_ID}`);
  const currentPrice = await stripe.prices.retrieve(CURRENT_PRICE_ID);
  
  console.log(`  Product ID:     ${currentPrice.product}`);
  console.log(`  Current amount: ${currentPrice.currency.toUpperCase()} ${currentPrice.unit_amount / 100} per ${currentPrice.recurring?.interval}`);
  console.log(`  Nickname:       ${currentPrice.nickname || "(none)"}`);
  console.log(`  Active:         ${currentPrice.active}`);

  // Look up the product
  const product = await stripe.products.retrieve(currentPrice.product);
  console.log(`  Product name:   ${product.name}\n`);

  // New price: A$1200/yr per seat ($100/mo displayed)
  const newPriceParams = {
    product: currentPrice.product,
    unit_amount: 120000, // $1200.00 in cents
    currency: "aud",
    recurring: {
      interval: "year",
      usage_type: "licensed",
    },
    nickname: "AgSKAN Pro Annual — A$100/mo per operator",
    metadata: {
      display_price: "A$100/mo",
      billing: "annual",
    },
  };

  console.log(`New price to create:`);
  console.log(`  Product:    ${product.name} (${currentPrice.product})`);
  console.log(`  Amount:     AUD $${newPriceParams.unit_amount / 100}/year per seat`);
  console.log(`  Display:    A$100/mo per operator`);
  console.log(`  Interval:   yearly`);
  console.log(`  Nickname:   ${newPriceParams.nickname}\n`);

  if (DRY_RUN) {
    console.log("🔍 DRY RUN — no price created. Run with --execute to create.\n");
    return;
  }

  // Create the price
  const newPrice = await stripe.prices.create(newPriceParams);

  console.log(`✅ Price created successfully!`);
  console.log(`  Price ID:   ${newPrice.id}`);
  console.log(`  Amount:     AUD $${newPrice.unit_amount / 100}/year`);
  console.log(`  Interval:   ${newPrice.recurring?.interval}`);
  console.log(`  Active:     ${newPrice.active}`);
  console.log(`\n📋 Update this price ID in your code:`);
  console.log(`   Old: ${CURRENT_PRICE_ID}`);
  console.log(`   New: ${newPrice.id}\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
