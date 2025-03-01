// src/lib/helpers/subscriptionHelpers.ts
import type { Session } from "@supabase/supabase-js"
import { pricingPlans } from "../../routes/(marketing)/pricing/pricing_plans"
import { createClient } from "@supabase/supabase-js"
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

// Client-side helper functions that won't interact directly with Stripe
// They'll make calls to our API endpoints instead

/**
 * Gets or creates a customer ID via an API call
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

        const response = await fetch("/api/customer/id", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            }
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || "Failed to get customer ID")
        }

        const { customerId } = await response.json()
        return { error: null, customerId }
    } catch (error) {
        console.error("Error in getOrCreateCustomerId:", error)
        return { error: error.message, customerId: null }
    }
}

/**
 * Fetches subscription data via an API call
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

        const response = await fetch("/api/customer/subscription", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            }
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || "Failed to fetch subscription")
        }

        const data = await response.json()
        return {
            primarySubscription: data.primarySubscription,
            hasEverHadSubscription: data.hasEverHadSubscription,
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
 * Creates a free subscription via API call
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

        const response = await fetch("/api/subscription/free", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            }
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || "Failed to create free subscription")
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

        const response = await fetch("/api/subscription/checkout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                priceId,
                seats,
                discount,
                discountcode
            })
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.message || "Failed to create checkout session")
        }

        const { stripeUrl } = await response.json()
        return { error: null, stripeUrl }
    } catch (error) {
        console.error("Error in createCheckoutSession:", error)
        return { error: error.message, stripeUrl: null }
    }
}