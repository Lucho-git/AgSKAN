// src/routes/api/subscription/actions/update-seats/+server.ts
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
        const baseUrl = url.origin;

        const customerResponse = await fetch(`${baseUrl}/api/customer/id`, {
            method: "GET",
            headers: {
                "Authorization": authHeader
            }
        });

        if (!customerResponse.ok) {
            const errorData = await customerResponse.json();
            return json({
                success: false,
                error: errorData.error || "Failed to retrieve customer data"
            }, { status: customerResponse.status });
        }

        const customerData = await customerResponse.json();
        const customerId = customerData.customerId;

        console.log("API: Got customer ID for seat update:", customerId);

        if (!customerId) {
            return json({
                success: false,
                error: "Customer not found"
            }, { status: 404 });
        }

        // Parse request body
        const data = await request.json();
        const newQuantity = parseInt(data.quantity);
        const appliedDate = data.appliedDate;
        const promotionCode = data.promotionCode || null; // Make it optional

        console.log(`API: Updating to ${newQuantity} seats, applied ${appliedDate}`);
        if (promotionCode) {
            console.log(`API: Using promotion code: ${promotionCode}`);
        }

        // Fetch active subscription
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active'
        });

        console.log(`API: Found ${subscriptions.data.length} active subscriptions`);

        if (!subscriptions?.data?.length) {
            return json({
                success: false,
                error: "No active subscription found"
            }, { status: 404 });
        }

        const subscription = subscriptions.data[0];
        console.log(`API: Found subscription: ${subscription.id}`);

        // Update the subscription
        try {
            const isIncrease = appliedDate === "now";
            const updateParams = {
                items: [
                    {
                        id: subscription.items.data[0].id,
                        quantity: newQuantity,
                    },
                ],
                proration_behavior: isIncrease ? "always_invoice" : "none",
            };

            console.log(`API: Is seat increase: ${isIncrease}`);
            console.log(`API: Update params:`, JSON.stringify(updateParams));

            if (!isIncrease) {
                updateParams.billing_cycle_anchor = "unchanged";
            }

            // Only add the promotion code if it's provided
            if (promotionCode) {
                try {
                    const promotion = await stripe.promotionCodes.retrieve(promotionCode);
                    if (promotion.coupon) {
                        updateParams.coupon = promotion.coupon.id;
                        console.log(`API: Applied coupon: ${promotion.coupon.id}`);
                    }
                } catch (promoError) {
                    console.log(`API: Failed to apply promotion code: ${promoError.message}`);
                    // Continue without the promotion code
                }
            }

            const updatedSubscription = await stripe.subscriptions.update(
                subscription.id,
                updateParams
            );

            console.log(`API: Subscription updated successfully`);

            // Get the token from the request
            const token = authHeader.split(" ")[1];

            // Create a request to update the user_subscriptions table
            const updateResponse = await fetch(`${baseUrl}/api/customer/subscription/update-metadata`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": authHeader
                },
                body: JSON.stringify({
                    current_seats: newQuantity,
                    lingering_seats: isIncrease
                        ? null
                        : subscription.quantity - newQuantity,
                    next_billing_date: new Date(
                        updatedSubscription.current_period_end * 1000
                    ).toISOString(),
                })
            });

            if (!updateResponse.ok) {
                console.log(`API: Failed to update subscription metadata, but seat update was successful`);
            } else {
                console.log(`API: Updated subscription metadata`);
            }

            return json({
                success: true,
                subscription: updatedSubscription,
                message: "Subscription updated successfully",
                newQuantity: newQuantity,
                appliedDate: appliedDate,
                discountApplied: !!updateParams.coupon,
            });
        } catch (e) {
            if (e instanceof Stripe.errors.StripeError) {
                console.error("API: Stripe error:", e.message, e.code, e.type);
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
        console.error("Error updating subscription seats:", error);
        return json({
            success: false,
            error: error.message || "An unexpected error occurred"
        }, { status: 500 });
    }
}