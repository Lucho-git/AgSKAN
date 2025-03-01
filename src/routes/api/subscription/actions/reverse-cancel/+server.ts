// src/routes/api/subscription/actions/reverse-cancel/+server.ts
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

        // Fetch subscription
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'all'
        });

        if (!subscriptions?.data?.length) {
            return json({ error: "No subscription found" }, { status: 404 });
        }

        // Find subscription scheduled for cancellation
        const subscription = subscriptions.data.find(sub => sub.cancel_at_period_end);

        if (!subscription) {
            return json({ error: "No subscription scheduled for cancellation found" }, { status: 404 });
        }

        // Reverse cancellation
        const updatedSubscription = await stripe.subscriptions.update(
            subscription.id,
            {
                cancel_at_period_end: false,
            }
        );

        return json({
            success: true,
            message: "Subscription cancellation reversed. Your subscription will continue.",
            cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
        });
    } catch (error) {
        console.error("Error reversing subscription cancellation:", error);
        return json({
            success: false,
            message: "Failed to reverse subscription cancellation. Please try again or contact support."
        }, { status: 500 });
    }
}