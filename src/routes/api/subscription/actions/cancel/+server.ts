// src/routes/api/subscription/actions/cancel/+server.ts
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

        console.log("API: Got customer ID:", customerId);

        if (!customerId) {
            return json({ error: "Customer not found" }, { status: 404 });
        }

        // Try to parse request body, but provide defaults if parsing fails
        let cancelAtPeriodEnd = true;
        try {
            if (request.headers.get('content-length') !== '0') {
                const data = await request.json();
                cancelAtPeriodEnd = data.cancelAtPeriodEnd !== false;
            }
        } catch (e) {
            console.log("No request body or invalid JSON, using default cancelAtPeriodEnd=true");
        }

        // Fetch active subscription
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active'
        });

        console.log(`API: Active subscriptions: ${subscriptions.data.length}`);

        if (!subscriptions?.data?.length) {
            return json({ error: "No active subscription found" }, { status: 404 });
        }

        const subscription = subscriptions.data[0];
        console.log(`API: Found subscription: ${subscription.id}`);

        // Cancel the subscription
        let updatedSubscription;

        if (cancelAtPeriodEnd) {
            // Cancel at period end
            console.log(`API: Cancelling subscription at period end: ${subscription.id}`);
            updatedSubscription = await stripe.subscriptions.update(
                subscription.id,
                { cancel_at_period_end: true }
            );
        } else {
            // Cancel immediately
            console.log(`API: Cancelling subscription immediately: ${subscription.id}`);
            updatedSubscription = await stripe.subscriptions.cancel(subscription.id);
        }

        console.log(`API: Subscription updated successfully`);

        return json({
            success: true,
            message: cancelAtPeriodEnd
                ? "Your subscription has been cancelled and will end at the current billing period."
                : "Your subscription has been cancelled immediately.",
            subscription: updatedSubscription
        });
    } catch (error) {
        console.error("Error canceling subscription:", error);
        return json({
            success: false,
            error: error.message || "An unexpected error occurred",
            message: "Failed to cancel subscription. Please try again or contact support."
        }, { status: 500 });
    }
}