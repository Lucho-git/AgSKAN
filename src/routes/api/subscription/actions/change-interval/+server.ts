// src/routes/api/subscription/actions/change-interval/+server.ts
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
        const trialEndTimestamp = data.trialEnd;
        const promotionCode = data.promotionCode || "promo_1PmvAuK3At0l0k1H32XUkuL5";

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

        // Get all prices for this product
        const prices = await stripe.prices.list({
            product: productId,
            active: true
        });

        const newPriceObj = prices.data.find(price =>
            price.recurring && price.recurring.interval === newInterval
        );

        if (!newPriceObj) {
            return json({ error: "Price not found for requested interval" }, { status: 404 });
        }

        const newPriceId = newPriceObj.id;

        // Update the subscription
        try {
            const updateParams = {
                items: [
                    {
                        id: subscription.items.data[0].id,
                        price: newPriceId,
                    },
                ],
                trial_end: trialEndTimestamp,
                proration_behavior: "none",
            };

            if (promotionCode) {
                const promotion = await stripe.promotionCodes.retrieve(promotionCode);
                if (promotion.coupon) {
                    updateParams.coupon = promotion.coupon.id;
                }
            }

            const updatedSubscription = await stripe.subscriptions.update(
                subscription.id,
                updateParams
            );

            // Update user_subscriptions table
            await supabase
                .from("user_subscriptions")
                .update({
                    payment_interval: newInterval,
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", user.id);

            return json({
                success: true,
                subscription: updatedSubscription,
                message: "Subscription updated successfully",
                newInterval: newInterval,
                discountApplied: !!updateParams.coupon,
            });
        } catch (e) {
            if (e instanceof Stripe.errors.StripeError) {
                return json({
                    success: false,
                    error: e.message,
                    code: e.code,
                    type: e.type,
                }, { status: 400 });
            }
            throw e;
        }
    } catch (error) {
        console.error("Error updating subscription interval:", error);
        return json({
            success: false,
            error: error.message || "An unexpected error occurred"
        }, { status: 500 });
    }
}