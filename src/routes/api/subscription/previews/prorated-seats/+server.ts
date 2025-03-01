// src/routes/api/subscription/previews/prorated-seats/+server.ts
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
        const newQuantity = parseInt(data.quantity);
        const appliedDate = data.appliedDate;

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

        // Calculate proration preview
        const prorationPreview = await stripe.invoices.retrieveUpcoming({
            customer: customerId,
            subscription: subscription.id,
            subscription_items: [
                {
                    id: subscription.items.data[0].id,
                    quantity: newQuantity,
                },
            ],
            subscription_proration_behavior:
                appliedDate === "now" ? "create_prorations" : "create_prorations",
        });

        // Format the response
        const dataArray = [
            { success: true, prorationPreview: true },
            true,
            prorationPreview
        ];

        return json({
            type: "success",
            status: 200,
            data: JSON.stringify(dataArray)
        });
    } catch (error) {
        console.error("Error calculating seat proration:", error);
        return json({
            type: "error",
            status: 500,
            error: error.message || "An unexpected error occurred"
        }, { status: 500 });
    }
}