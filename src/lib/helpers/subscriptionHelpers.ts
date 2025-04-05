// src/lib/helpers/subscriptionHelpers.ts
import type { Session } from "@supabase/supabase-js"
import { pricingPlans } from "../../routes/(marketing)/pricing/pricing_plans
import { subscriptionApi } from "$lib/api/subscriptionApi"

/**
 * Gets or creates a customer ID
 * (Now uses the subscriptionApi which will handle the customer data via RLS)
 */
export const getOrCreateCustomerId = async ({
    session
}: {
    session: Session
}) => {
    try {
        if (!session?.access_token) {
            return { error: "No valid session", customerId: null }
        }

        // This is now handled directly by the subscriptionApi when needed
        // The api automatically loads the customer data via RLS
        const result = await subscriptionApi.getSubscriptionData();

        if (!result.success) {
            throw new Error(result.message || "Failed to get subscription data");
        }

        // If we need to return a customerId specifically, we'd need to add
        // a method to subscriptionApi to expose this
        return { error: null, customerId: "handled_by_api" }
    } catch (error) {
        console.error("Error in getOrCreateCustomerId:", error)
        return { error: error.message, customerId: null }
    }
}

/**
 * Fetches subscription data
 * (Now uses subscriptionApi directly)
 */
export const fetchSubscription = async ({
    session
}: {
    session: Session
}) => {
    try {
        if (!session?.access_token) {
            return {
                error: "No valid session",
                primarySubscription: null,
                hasEverHadSubscription: false
            }
        }

        // Use the subscriptionApi directly
        const result = await subscriptionApi.getSubscriptionData();

        if (!result.success) {
            throw new Error(result.message || "Failed to fetch subscription data");
        }

        return {
            primarySubscription: result.subscriptionData,
            hasEverHadSubscription: result.hasEverHadSubscription,
            error: null
        }
    } catch (error) {
        console.error("Error in fetchSubscription:", error)
        return {
            error: error.message,
            primarySubscription: null,
            hasEverHadSubscription: false,
        }
    }
}

/**
 * Creates a free subscription
 */
export const createFreeSubscription = async ({
    session
}: {
    session: Session
}) => {
    try {
        if (!session?.access_token) {
            return { error: "No valid session" }
        }

        // We need to add this method to the subscriptionApi
        const result = await subscriptionApi.createFreeSubscription();

        if (!result.success) {
            throw new Error(result.message || "Failed to create free subscription");
        }

        return { error: null }
    } catch (error) {
        console.error("Error in createFreeSubscription:", error)
        return { error: error.message }
    }
}

/**
 * Creates a checkout session for a paid subscription
 */
export const createCheckoutSession = async ({
    session,
    priceId,
    seats = 1,
    discount = false,
    discountcode = null
}: {
    session: Session,
    priceId: string,
    seats?: number,
    discount?: boolean,
    discountcode?: string | null
}) => {
    try {
        if (!session?.access_token) {
            return { error: "No valid session", stripeUrl: null }
        }

        // Use the subscriptionApi instead of the API route
        const result = await subscriptionApi.createCheckoutSession({
            priceId,
            seats,
            discount,
            discountcode
        });

        if (!result.success) {
            throw new Error(result.message || "Failed to create checkout session");
        }

        return { error: null, stripeUrl: result.stripeUrl }
    } catch (error) {
        console.error("Error in createCheckoutSession:", error)
        return { error: error.message, stripeUrl: null }
    }
}