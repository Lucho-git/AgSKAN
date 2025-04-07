// src/routes/api/subscription/previews/interval-change/+server.ts
import { json } from "@sveltejs/kit";
import { PRIVATE_STRIPE_API_KEY } from "$env/static/private";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";

const stripe = new Stripe(PRIVATE_STRIPE_API_KEY, { apiVersion: "2023-08-16" });

export async function POST({ request }) {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return json({ error: "Unauthorized - no valid token" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    try {
        // Create a Supabase client with the provided token
        const supabase = createClient(
            PUBLIC_SUPABASE_URL,
            PUBLIC_SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        // Verify the token by getting user info
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return json({ error: "Invalid or expired token" }, { status: 401 });
        }

        // Parse request body
        const data = await request.json();
        const newInterval = data.interval;

        // Get the customer ID
        const { data: customerData, error: customerError } = await supabase
            .from("stripe_customers")
            .select("stripe_customer_id")
            .eq("user_id", user.id)
            .single();

        if (customerError || !customerData?.stripe_customer_id) {
            return json({ error: "Customer not found" }, { status: 404 });
        }

        const customerId = customerData.stripe_customer_id;

        // Fetch active subscription
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            expand: ['data.items.data.price']
        });

        if (!subscriptions?.data?.length) {
            return json({ error: "No active subscription found" }, { status: 404 });
        }

        const subscription = subscriptions.data[0];
        const productId = subscription.items.data[0].price.product;
        const currentAnchorDate = new Date(subscription.current_period_end * 1000);

        // Get all prices for this product
        const prices = await stripe.prices.list({
            product: productId,
            active: true,
            expand: ["data.tiers"],
        });

        const currentPrice = prices.data.find(
            (price) => price.recurring.interval === subscription.items.data[0].price.recurring.interval
        );

        const newPrice = prices.data.find(
            (price) => price.recurring.interval === newInterval
        );

        if (!currentPrice || !newPrice) {
            return json({
                error: "Unable to find valid prices for the current or new billing cycle"
            }, { status: 400 });
        }

        // Get preview for new interval
        const prorationPreview = await stripe.invoices.retrieveUpcoming({
            customer: customerId,
            subscription: subscription.id,
            subscription_items: [
                {
                    id: subscription.items.data[0].id,
                    price: newPrice.id,
                },
            ],
            subscription_proration_behavior: "none",
            subscription_trial_end: Math.floor(currentAnchorDate.getTime() / 1000),
        });

        const quantity = subscription.quantity;

        const getCurrentPriceAmount = (price) => {
            return price.unit_amount || (price.tiers && price.tiers[0].unit_amount) || 0;
        };

        const currentPriceAmount = getCurrentPriceAmount(currentPrice);
        const newPriceAmount = getCurrentPriceAmount(newPrice);

        const currentMonthlyPrice =
            currentPrice.recurring.interval === "year"
                ? currentPriceAmount / 12
                : currentPriceAmount;

        const newMonthlyPrice =
            newPrice.recurring.interval === "year"
                ? newPriceAmount / 12
                : newPriceAmount;

        const previewData = {
            currentBillingCycle: currentPrice.recurring.interval,
            newBillingCycle: newPrice.recurring.interval,
            currentAnchorDate: currentAnchorDate.toISOString(),
            nextBillingDate: new Date(
                prorationPreview.lines.data[0].period.start * 1000
            ).toISOString(),
            currentPricePerMonth: (currentMonthlyPrice * quantity) / 100,
            newPricePerMonth: (newMonthlyPrice * quantity) / 100,
            currentPriceWithoutDiscount: (currentPriceAmount * quantity) / 100,
            newPriceWithoutDiscount: (newPriceAmount * quantity) / 100,
            currency: currentPrice.currency,
            quantity,
        };

        return json({
            type: "success",
            status: 200,
            data: JSON.stringify(previewData),
        });
    } catch (error) {
        console.error("Error calculating interval change preview:", error);
        return json({
            type: "error",
            status: 500,
            error: error.message || "An unexpected error occurred"
        }, { status: 500 });
    }
}