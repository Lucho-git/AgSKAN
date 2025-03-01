// src/routes/api/subscription/previews/prorated-seats/+server.ts
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
        // Step 1: Get the customer ID using the existing endpoint with full URL
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

        console.log("API: Got customer ID for seat proration:", customerId);

        if (!customerId) {
            return json({ error: "Customer not found" }, { status: 404 });
        }

        // Parse request body
        const data = await request.json();
        const newQuantity = parseInt(data.quantity);
        const appliedDate = data.appliedDate;

        console.log(`API: Calculating proration for ${newQuantity} seats, applied ${appliedDate}`);

        // Fetch active subscription
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            expand: ['data.items.data.price']
        });

        if (!subscriptions?.data?.length) {
            return json({
                type: "error",
                status: 404,
                error: "No active subscription found"
            }, { status: 404 });
        }

        const subscription = subscriptions.data[0];
        console.log(`API: Found subscription: ${subscription.id}`);

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

        console.log(`API: Successfully calculated proration preview`);

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