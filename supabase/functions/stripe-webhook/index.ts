// /supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.0.0?dts"

const stripeApiKey = Deno.env.get('PRIVATE_STRIPE_API_KEY')
const stripeWebhookSecret = Deno.env.get('PRIVATE_STRIPE_WEBHOOK_SECRET')
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL')
const supabaseServiceRole = Deno.env.get('PRIVATE_SUPABASE_SERVICE_ROLE')

const stripe = new Stripe(stripeApiKey!, { apiVersion: '2023-10-16' })
const supabase = createClient(supabaseUrl!, supabaseServiceRole!)

// Plan limits
const PRO_MARKER_LIMIT = 999999
const PRO_TRAIL_LIMIT = 999999
const FREE_MARKER_LIMIT = 100
const FREE_TRAIL_LIMIT = 100000

/**
 * Look up user_id from a Stripe customer ID
 */
async function getUserIdFromCustomer(stripeCustomerId: string): Promise<string> {
    const { data, error } = await supabase
        .from("stripe_customers")
        .select("user_id")
        .eq("stripe_customer_id", stripeCustomerId)
        .single()

    if (error || !data) {
        throw new Error(`No user found for stripe_customer_id: ${stripeCustomerId}`)
    }
    return data.user_id
}

/**
 * Map a Stripe Subscription to our user_subscriptions columns
 */
function mapSubscriptionToUpdate(subscription: any) {
    const item = subscription.items?.data?.[0]
    const interval = item?.price?.recurring?.interval || "year"
    const seats = item?.quantity || 1
    const status = subscription.status // trialing, active, past_due, canceled, unpaid, incomplete

    // Users with trialing or active status keep pro access
    const isActive = ["trialing", "active"].includes(status)
    const planName = isActive
        ? (item?.price?.nickname || "AgSKAN Pro Annual (Standard)")
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
 * Update user_subscriptions table
 */
async function updateSubscription(userId: string, data: Record<string, any>) {
    const { error } = await supabase
        .from("user_subscriptions")
        .update(data)
        .eq("user_id", userId)

    if (error) {
        console.error("DB update error:", error)
        throw new Error(`Failed to update subscription: ${error.message}`)
    }
    console.log("Updated user_subscriptions:", { user_id: userId, ...data })
}

/**
 * Downgrade user to free
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
    if (stripeSubscriptionId) data.stripe_subscription_id = stripeSubscriptionId

    await updateSubscription(userId, data)
    console.log("User downgraded to FREE:", userId)
}

serve(async (req) => {
    // Only allow POST
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200 })
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 })
    }

    try {
        const body = await req.text()
        const signature = req.headers.get("stripe-signature")

        if (!signature) {
            console.error("Missing stripe-signature header")
            return new Response(JSON.stringify({ error: "Missing signature" }), { status: 400 })
        }

        // Verify webhook signature
        const event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret!)

        console.log(`[Stripe Webhook] ${event.type} (${event.id})`)

        switch (event.type) {
            // ─── NEW SUBSCRIPTION ───
            case "customer.subscription.created": {
                const subscription = event.data.object
                const userId = await getUserIdFromCustomer(subscription.customer as string)
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Subscription CREATED:", {
                    user_id: userId, status: subscription.status,
                    trial_end: subscription.trial_end
                        ? new Date(subscription.trial_end * 1000).toISOString() : null,
                })

                await updateSubscription(userId, updateData)
                break
            }

            // ─── SUBSCRIPTION UPDATED (seat changes, renewals, plan changes) ───
            case "customer.subscription.updated": {
                const subscription = event.data.object
                const userId = await getUserIdFromCustomer(subscription.customer as string)
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Subscription UPDATED:", {
                    user_id: userId, status: subscription.status,
                    seats: updateData.current_seats,
                })

                await updateSubscription(userId, updateData)
                break
            }

            // ─── SUBSCRIPTION DELETED (cancelled + period ended) ───
            case "customer.subscription.deleted": {
                const subscription = event.data.object
                const userId = await getUserIdFromCustomer(subscription.customer as string)

                console.log("[Webhook] Subscription DELETED:", {
                    user_id: userId, subscription_id: subscription.id,
                })

                await downgradeToFree(userId, subscription.id)
                break
            }

            // ─── CHECKOUT COMPLETED (first-time purchase) ───
            case "checkout.session.completed": {
                const session = event.data.object as any

                if (session.mode !== "subscription" || !session.subscription) break

                const userId = await getUserIdFromCustomer(session.customer as string)
                const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Checkout COMPLETED:", {
                    user_id: userId, subscription_id: subscription.id,
                    status: subscription.status,
                })

                await updateSubscription(userId, updateData)
                break
            }

            // ─── INVOICE PAID (renewal success) ───
            case "invoice.paid": {
                const invoice = event.data.object as any
                if (!invoice.subscription || !invoice.customer) break

                const userId = await getUserIdFromCustomer(invoice.customer as string)
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Invoice PAID:", {
                    user_id: userId, amount: invoice.amount_paid,
                })

                await updateSubscription(userId, updateData)
                break
            }

            // ─── INVOICE PAYMENT FAILED (card declined) ───
            case "invoice.payment_failed": {
                const invoice = event.data.object as any
                if (!invoice.subscription || !invoice.customer) break

                const userId = await getUserIdFromCustomer(invoice.customer as string)
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
                const updateData = mapSubscriptionToUpdate(subscription)

                console.log("[Webhook] Invoice PAYMENT FAILED:", {
                    user_id: userId, status: subscription.status,
                    attempt: invoice.attempt_count,
                })

                await updateSubscription(userId, updateData)
                break
            }

            // ─── TRIAL ENDING SOON (3 days before) ───
            case "customer.subscription.trial_will_end": {
                const subscription = event.data.object
                const userId = await getUserIdFromCustomer(subscription.customer as string)

                console.log("[Webhook] Trial ending soon:", {
                    user_id: userId,
                    trial_end: subscription.trial_end
                        ? new Date(subscription.trial_end * 1000).toISOString() : null,
                })
                // Future: send email notification
                break
            }

            default:
                console.log(`[Webhook] Unhandled event: ${event.type}`)
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
        })
    } catch (err) {
        console.error("Webhook error:", err instanceof Error ? err.message : err)
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        )
    }
})
