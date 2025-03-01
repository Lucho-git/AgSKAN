// src/routes/api/subscription/actions/reverse-cancel/+server.ts
import { json } from "@sveltejs/kit";
import { PRIVATE_STRIPE_API_KEY } from "$env/static/private";
import Stripe from "stripe";

const stripe = new Stripe(PRIVATE_STRIPE_API_KEY, { apiVersion: "2023-08-16" });

export async function POST({ request, fetch, url }) {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return json({ error: "Unauthorized - no valid token" }, { status: 401 });
    }

    try {
        // Step 1: Get the customer ID using the existing endpoint
        // We need to use the absolute URL since we're in a server context
        const baseUrl = url.origin;

        const customerResponse = await fetch(`${baseUrl}/api/customer/id`, {
            method: "GET",
            headers: {
                "Authorization": authHeader
            }
        });

        if (!customerResponse.ok) {
            const errorData = await customerResponse.json();
            return json({ error: errorData.error || "Failed to retrieve customer data" }, { status: customerResponse.status });
        }

        const customerData = await customerResponse.json();
        const customerId = customerData.customerId;

        console.log("API: Got customer ID for reverse cancellation:", customerId);

        if (!customerId) {
            return json({ error: "Customer not found" }, { status: 404 });
        }

        // Fetch subscription (include all to find those scheduled for cancellation)
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'all'
        });

        console.log(`API: Found ${subscriptions.data.length} subscriptions`);

        if (!subscriptions?.data?.length) {
            return json({
                success: false,
                error: "No subscription found",
                message: "No subscription found for this customer"
            }, { status: 404 });
        }

        // Find subscription scheduled for cancellation
        const subscription = subscriptions.data.find(sub => sub.cancel_at_period_end);

        if (!subscription) {
            return json({
                success: false,
                error: "No subscription scheduled for cancellation found",
                message: "Could not find any subscription scheduled for cancellation"
            }, { status: 404 });
        }

        console.log(`API: Found subscription scheduled for cancellation: ${subscription.id}`);

        // Reverse cancellation
        const updatedSubscription = await stripe.subscriptions.update(
            subscription.id,
            {
                cancel_at_period_end: false,
            }
        );

        console.log(`API: Successfully reversed cancellation for subscription: ${subscription.id}`);

        return json({
            success: true,
            message: "Subscription cancellation reversed. Your subscription will continue.",
            cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
            subscription: updatedSubscription
        });
    } catch (error) {
        console.error("Error reversing subscription cancellation:", error);
        return json({
            success: false,
            error: error.message || "An unexpected error occurred",
            message: "Failed to reverse subscription cancellation. Please try again or contact support."
        }, { status: 500 });
    }
}