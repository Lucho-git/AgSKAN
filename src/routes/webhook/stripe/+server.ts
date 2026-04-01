import { error, json } from "@sveltejs/kit"
import {
    PRIVATE_STRIPE_API_KEY,
    PRIVATE_STRIPE_WEBHOOK_SECRET,
} from "$env/static/private"
import Stripe from "stripe"
import type { RequestEvent } from "./$types"
import { supabaseServiceRole } from "$lib/supabaseAdmin.server"

const stripe = new Stripe(PRIVATE_STRIPE_API_KEY, { apiVersion: "2023-08-16" })

// Pro plan limits
const PRO_MARKER_LIMIT = 999999
const PRO_TRAIL_LIMIT = 999999
const FREE_MARKER_LIMIT = 100
const FREE_TRAIL_LIMIT = 100000

/**
 * Look up the internal user_id from a Stripe customer ID.
 * Falls back to Stripe metadata and email lookup if no stripe_customers row exists
 * (e.g. customers created via Payment Links).
 */
async function getUserIdFromCustomer(stripeCustomerId: string): Promise<string> {
    // 1. Direct lookup in stripe_customers table
    const { data, error: err } = await supabaseServiceRole
        .from("stripe_customers")
        .select("user_id")
        .eq("stripe_customer_id", stripeCustomerId)
        .single()

    if (data?.user_id) {
        return data.user_id
    }

    console.log(`[Webhook] No stripe_customers entry for ${stripeCustomerId}, trying fallbacks...`)

    // Fetch the Stripe customer object for metadata / email
    const customer = await stripe.customers.retrieve(stripeCustomerId)
    if (customer.deleted) {
        throw new Error(`Stripe customer ${stripeCustomerId} is deleted`)
    }

    let userId: string | null = null

    // 2. Check Stripe customer metadata for user_id
    if (customer.metadata?.user_id) {
        userId = customer.metadata.user_id
        console.log(`[Webhook] Found user_id in Stripe metadata: ${userId}`)
    }

    // 3. Fall back to email lookup in profiles table
    if (!userId && customer.email) {
        const { data: profile } = await supabaseServiceRole
            .from("profiles")
            .select("id")
            .eq("email", customer.email)
            .single()

        if (profile?.id) {
            userId = profile.id
            console.log(`[Webhook] Found user by email ${customer.email}: ${userId}`)
        }
    }

    if (!userId) {
        throw new Error(
            `No user found for stripe_customer_id: ${stripeCustomerId} (email: ${customer.email ?? 'none'})`
        )
    }

    // Auto-create the missing stripe_customers entry so future events resolve instantly
    const { error: insertError } = await supabaseServiceRole
        .from("stripe_customers")
        .upsert({ user_id: userId, stripe_customer_id: stripeCustomerId })

    if (insertError) {
        console.error("[Webhook] Failed to backfill stripe_customers:", insertError)
    } else {
        console.log(`[Webhook] Backfilled stripe_customers: ${userId} -> ${stripeCustomerId}`)
    }

    return userId
}

/**
 * Extract subscription data from a Stripe Subscription object
 * and map it to our user_subscriptions table shape
 */
function mapSubscriptionToUpdate(subscription: Stripe.Subscription) {
    const item = subscription.items.data[0]
    const interval = item?.price.recurring?.interval || "year"
    const seats = item?.quantity || 1
    const status = subscription.status // trialing, active, past_due, canceled, unpaid, incomplete, etc.

    // Determine our plan name from status
    const isActive = ["trialing", "active"].includes(status)
    const planName = isActive
        ? (item?.price.nickname || "AgSKAN Pro Annual (Standard)")
        : "FREE"

    return {
        subscription: planName,
        subscription_status: status,
        stripe_subscription_id: subscription.id,
        current_seats: isActive ? seats : 0,
        marker_limit: isActive ? PRO_MARKER_LIMIT : FREE_MARKER_LIMIT,
        trail_limit: isActive ? PRO_TRAIL_LIMIT : FREE_TRAIL_LIMIT,
        payment_interval: interval,
        next_billing_date: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        updated_at: new Date().toISOString(),
    }
}

/**
 * Upsert subscription data into user_subscriptions
 */
async function upsertSubscription(userId: string, data: Record<string, any>) {
    // Try update first
    const { error: updateError, count } = await supabaseServiceRole
        .from("user_subscriptions")
        .update(data)
        .eq("user_id", userId)

    if (updateError) {
        console.error("Error updating subscription:", updateError)
        throw new Error(`Failed to update subscription: ${updateError.message}`)
    }

    console.log("Successfully updated user_subscriptions:", { user_id: userId, ...data })
}

/**
 * Downgrade a user back to free plan
 */
async function downgradeToFree(userId: string, stripeSubscriptionId?: string) {
    const data: Record<string, any> = {
        subscription: "FREE",
        subscription_status: "free",
        current_seats: 1,
        marker_limit: FREE_MARKER_LIMIT,
        trail_limit: FREE_TRAIL_LIMIT,
        payment_interval: null,
        next_billing_date: null,
        updated_at: new Date().toISOString(),
    }
    if (stripeSubscriptionId) {
        data.stripe_subscription_id = stripeSubscriptionId
    }

    await upsertSubscription(userId, data)
    console.log("User downgraded to FREE:", userId)
}

export async function POST({ request }: RequestEvent) {
    const body = await request.text()
    const signature = request.headers.get("stripe-signature")

    if (!signature) {
        console.error("Missing stripe-signature header")
        throw error(400, "Missing stripe-signature header")
    }

    try {
        const event = stripe.webhooks.constructEvent(
            body,
            signature,
            PRIVATE_STRIPE_WEBHOOK_SECRET,
        )

        console.log(`[Stripe Webhook] ${event.type} (${event.id})`)

        switch (event.type) {
            // ─── NEW SUBSCRIPTION (after checkout or API creation) ───
            case "customer.subscription.created": {
                const subscription = event.data.object as Stripe.Subscription
                const userId = await getUserIdFromCustomer(subscription.customer as string)
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Subscription CREATED:", {
                    user_id: userId,
                    status: subscription.status,
                    trial_end: subscription.trial_end
                        ? new Date(subscription.trial_end * 1000).toISOString()
                        : null,
                })

                await upsertSubscription(userId, updateData)
                break
            }

            // ─── SUBSCRIPTION UPDATED (seat changes, plan changes, renewals) ───
            case "customer.subscription.updated": {
                const subscription = event.data.object as Stripe.Subscription
                const userId = await getUserIdFromCustomer(subscription.customer as string)
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Subscription UPDATED:", {
                    user_id: userId,
                    status: subscription.status,
                    seats: updateData.current_seats,
                })

                await upsertSubscription(userId, updateData)
                break
            }

            // ─── SUBSCRIPTION DELETED (cancelled and period ended) ───
            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription
                const userId = await getUserIdFromCustomer(subscription.customer as string)

                console.log("[Webhook] Subscription DELETED:", {
                    user_id: userId,
                    subscription_id: subscription.id,
                })

                await downgradeToFree(userId, subscription.id)
                break
            }

            // ─── CHECKOUT COMPLETED (first-time purchase) ───
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session

                // Only handle subscription checkouts
                if (session.mode !== "subscription" || !session.subscription) break

                const userId = await getUserIdFromCustomer(session.customer as string)

                // Fetch the full subscription object from Stripe
                const subscription = await stripe.subscriptions.retrieve(
                    session.subscription as string,
                )
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Checkout COMPLETED:", {
                    user_id: userId,
                    subscription_id: subscription.id,
                    status: subscription.status,
                })

                await upsertSubscription(userId, updateData)
                break
            }

            // ─── INVOICE PAID (renewal success, confirms active) ───
            case "invoice.paid": {
                const invoice = event.data.object as Stripe.Invoice

                // Only handle subscription invoices
                if (!invoice.subscription || !invoice.customer) break

                const userId = await getUserIdFromCustomer(invoice.customer as string)

                // Fetch fresh subscription data
                const subscription = await stripe.subscriptions.retrieve(
                    invoice.subscription as string,
                )
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Invoice PAID:", {
                    user_id: userId,
                    subscription_id: subscription.id,
                    amount: invoice.amount_paid,
                })

                await upsertSubscription(userId, updateData)
                break
            }

            // ─── INVOICE PAYMENT FAILED (card declined, etc.) ───
            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice

                if (!invoice.subscription || !invoice.customer) break

                const userId = await getUserIdFromCustomer(invoice.customer as string)

                // Fetch fresh subscription — status will be 'past_due' or 'unpaid'
                const subscription = await stripe.subscriptions.retrieve(
                    invoice.subscription as string,
                )
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Invoice PAYMENT FAILED:", {
                    user_id: userId,
                    subscription_id: subscription.id,
                    status: subscription.status,
                    attempt: invoice.attempt_count,
                })

                // Update status — mapSubscriptionToUpdate handles the logic:
                // 'past_due' keeps pro access (grace period), 'unpaid'/'canceled' downgrades
                await upsertSubscription(userId, updateData)
                break
            }

            // ─── TRIAL ENDING SOON (3 days before trial ends) ───
            case "customer.subscription.trial_will_end": {
                const subscription = event.data.object as Stripe.Subscription
                const userId = await getUserIdFromCustomer(subscription.customer as string)

                console.log("[Webhook] Trial ending soon:", {
                    user_id: userId,
                    trial_end: subscription.trial_end
                        ? new Date(subscription.trial_end * 1000).toISOString()
                        : null,
                })

                // No DB change needed — just logging for now.
                // Could trigger an email notification here in the future.
                break
            }

            default:
                console.log(`[Webhook] Unhandled event type: ${event.type}`)
        }

        return json({ received: true })
    } catch (err) {
        console.error("Error processing webhook:", {
            error: err instanceof Error ? err.message : "Unknown error",
            stack: err instanceof Error ? err.stack : undefined,
        })

        throw error(400, err instanceof Error ? err.message : "Unknown error")
    }
}
