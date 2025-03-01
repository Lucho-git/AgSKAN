// src/routes/api/subscription/actions/cancel/+server.ts
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
            status: 'active'
        });

        if (!subscriptions?.data?.length) {
            return json({ error: "No active subscription found" }, { status: 404 });
        }

        const subscription = subscriptions.data[0];

        // Cancel the subscription
        const updatedSubscription = await stripe.subscriptions.update(
            subscription.id,
            {
                cancel_at_period_end: true,
            }
        );

        return json({
            success: true,
            message: "Subscription scheduled for cancellation at the end of the billing period.",
            cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
        });
    } catch (error) {
        console.error("Error cancelling subscription:", error);
        return json({
            success: false,
            message: "Failed to cancel subscription. Please try again or contact support."
        }, { status: 500 });
    }
}