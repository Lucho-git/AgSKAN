// src/lib/api/subscriptionApi.ts
import { supabase } from '$lib/supabaseClient';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

// Default plan ID
export const defaultPlanId = "free";

// Pricing plans
export const pricingPlans = [
    {
        id: "free",
        name: "🚜SKAN Member",
        description:
            "Join an existing map as an operator, or test out our features free",
        price: {
            monthly: { original: "Free", discounted: "Free" },
            yearly: { original: "Free", discounted: "Free" },
        },
        priceIntervalName: {
            monthly: "no credit card required",
            yearly: "no credit card required",
        },
        stripe_price_id: { monthly: null, yearly: null },
        features: [
            "Join other maps with unlimited resources",
            "1 Map Creation",
            "100 active pin drops",
            "100 000 Trail tokens",
            "Real time location updates",
        ],
        style: "bg-gray-100 border-gray-200",
    },
    {
        id: "pro",
        name: "⭐ SKAN Founder",
        description:
            "Invite other users to your map, completely adjustable # of seats",
        price: {
            monthly: { original: "$45", discounted: "$45" },
            yearly: { original: "$45", discounted: "$30.4" },
        },
        priceIntervalName: { monthly: "per month", yearly: "per year" },
        stripe_price_id: {
            monthly: "price_1PkkO8K3At0l0k1HqvxEEBw2",
            yearly: "price_1PdxlVK3At0l0k1HoEgkFynm",
        },
        stripe_product_id: "prod_QUxgzq6c3meKyZ",
        features: [
            "Invite others to share your map",
            "Customizable # of seats",
            "Unlimited map creation",
            "Unlimited pin drops",
            "Unlimited Trail credits",
            "All vehicles unlocked",
        ],
        style: "bg-blue-100 border-blue-300",
    },
];

export const subscriptionApi = {
    /**
     * Gets subscription data for the current user
     */
    async getSubscriptionData() {
        try {
            // Check authentication
            const { data: session } = await supabase.auth.getSession();

            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;

            // Get customer data using RLS
            const { data: customers, error } = await supabase
                .from("stripe_customers")
                .select("stripe_customer_id")
                .eq("user_id", userId);

            if (error) {
                throw new Error(`Error retrieving customer data: ${error.message}`);
            }

            // If no customer found, return default values
            if (!customers || customers.length === 0) {
                return {
                    success: true,
                    isActiveCustomer: false,
                    hasEverHadSubscription: false,
                    currentPlanId: defaultPlanId,
                    subscriptionData: null
                };
            }

            // Call the subscription Edge Function with the customer ID
            const customerId = customers[0].stripe_customer_id;
            return await this.callSubscriptionFunction(session.session.access_token, customerId);
        } catch (error) {
            console.error("Error in getSubscriptionData:", error);
            return {
                success: false,
                message: error.message,
                isActiveCustomer: false,
                hasEverHadSubscription: false,
                currentPlanId: defaultPlanId,
                subscriptionData: null
            };
        }
    },

    /**
     * Helper to call the subscription Edge Function
     */
    async callSubscriptionFunction(accessToken, customerId) {
        try {
            const functionUrl = `${PUBLIC_SUPABASE_URL}/functions/v1/subscription`;

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ customerId })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Subscription function error: ${errorText}`);
            }

            const data = await response.json();

            return {
                success: true,
                isActiveCustomer: !!data.primarySubscription,
                hasEverHadSubscription: data.hasEverHadSubscription,
                currentPlanId: data.currentPlanId,
                subscriptionData: data.primarySubscription
            };
        } catch (error) {
            console.error("Error in callSubscriptionFunction:", error);
            return {
                success: false,
                message: error.message,
                isActiveCustomer: false,
                hasEverHadSubscription: false,
                currentPlanId: defaultPlanId,
                subscriptionData: null
            };
        }
    },

    /**
     * Creates a Stripe Customer Portal session for managing subscription
     */
    async createPortalSession(returnUrl = "/account/billing") {
        try {
            // Check authentication
            const { data: session } = await supabase.auth.getSession();

            if (!session?.session?.user) {
                throw new Error("Not authenticated");
            }

            const userId = session.session.user.id;

            // Get customer data
            const { data: customers, error } = await supabase
                .from("stripe_customers")
                .select("stripe_customer_id")
                .eq("user_id", userId);

            if (error) {
                throw new Error(`Error retrieving customer data: ${error.message}`);
            }

            // If no customer found, return error
            if (!customers || customers.length === 0) {
                throw new Error("No subscription found to manage");
            }

            // Call the portal Edge Function with the customer ID
            const customerId = customers[0].stripe_customer_id;
            const functionUrl = `${PUBLIC_SUPABASE_URL}/functions/v1/create-portal`;

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    "Authorization": `Bearer ${session.session.access_token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    customerId,
                    returnUrl: window.location.origin + returnUrl
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to create portal session: ${errorText}`);
            }

            const data = await response.json();

            return {
                success: true,
                url: data.url
            };
        } catch (error) {
            console.error("Error creating portal session:", error);
            return {
                success: false,
                message: error.message,
                url: null
            };
        }
    },

    /**
     * Gets available pricing plans
     */
    getAvailablePlans() {
        return {
            success: true,
            plans: pricingPlans
        };
    },

    /**
     * Gets details for a specific plan
     */
    getPlanDetails(planId) {
        const plan = pricingPlans.find(p => p.id === planId);
        return {
            success: !!plan,
            plan: plan || null,
            message: plan ? null : `Plan ${planId} not found`
        };
    }
};