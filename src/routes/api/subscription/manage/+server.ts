// src/routes/api/subscription/manage/+server.ts
import { json } from "@sveltejs/kit";
import { PRIVATE_STRIPE_API_KEY } from "$env/static/private";
import Stripe from "stripe";

const stripe = new Stripe(PRIVATE_STRIPE_API_KEY, { apiVersion: "2023-08-16" });

export async function GET({ request, fetch }) {
    console.log("Manage API endpoint called");
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("API: Auth header missing or invalid");
        return json({ error: "Unauthorized - no valid token" }, { status: 401 });
    }

    try {
        // Step 1: Get the customer ID using the existing endpoint
        console.log("API: Fetching customer ID using existing endpoint");
        const customerResponse = await fetch("/api/customer/id", {
            method: "GET",
            headers: {
                "Authorization": authHeader
            }
        });

        if (!customerResponse.ok) {
            console.error("API: Failed to get customer ID", await customerResponse.text());
            return json({ error: "Failed to retrieve customer data" }, { status: customerResponse.status });
        }

        const { customerId } = await customerResponse.json();

        if (!customerId) {
            console.error("API: No customer ID returned");
            return json({ error: "Customer not found" }, { status: 404 });
        }

        console.log("API: Successfully retrieved customer ID:", customerId.substring(0, 10) + "...");

        // Step 2: Fetch subscriptions from Stripe
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            expand: ['data.default_payment_method']
        });

        console.log("API: Active subscriptions:", subscriptions?.data?.length || 0);

        if (!subscriptions?.data?.length) {
            return json({ error: "No active subscription found" }, { status: 404 });
        }

        // Step 3: Get the primary subscription
        const stripeSubscription = subscriptions.data[0];

        // Fetch subscription details with tiers
        const subscription = await stripe.subscriptions.retrieve(
            stripeSubscription.id,
            {
                expand: ["items.data.price"],
            }
        );

        const priceId = subscription.items.data[0].price.id;
        const priceWithTiers = await stripe.prices.retrieve(priceId, {
            expand: ["tiers"],
        });

        const currentQuantity = subscription.items.data[0].quantity;
        const currency = subscription.currency;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

        // Step 4: Get product details to match with app subscription
        const productId = subscription.items.data[0].price.product;
        const product = await stripe.products.retrieve(productId);

        // Construct app subscription object
        const appSubscription = {
            id: product.id,
            name: product.name,
            description: product.description,
            stripe_product_id: productId,
            stripe_price_id: {
                monthly: subscription.items.data[0].price.recurring.interval === 'month' ? priceId : null,
                yearly: subscription.items.data[0].price.recurring.interval === 'year' ? priceId : null
            }
        };

        console.log("API: Preparing response with subscription data for product:", product.name);

        // Construct the response
        return json({
            subscriptionData: {
                primarySubscription: {
                    stripeSubscription: subscription,
                    appSubscription
                }
            },
            seatManagementInfo: {
                currentQuantity,
                currency,
                currentPeriodEnd,
                priceWithTiers,
            }
        });
    } catch (error) {
        console.error("API error:", error);
        return json({
            error: error.message || "An unexpected error occurred"
        }, { status: 500 });
    }
}