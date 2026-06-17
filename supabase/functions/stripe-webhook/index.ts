// /supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@14?target=deno"

const stripeApiKey = Deno.env.get('PRIVATE_STRIPE_API_KEY')
const stripeWebhookSecret = Deno.env.get('PRIVATE_STRIPE_WEBHOOK_SECRET')
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL')
const supabaseServiceRole = Deno.env.get('PRIVATE_SUPABASE_SERVICE_ROLE')
const clickSendUser = Deno.env.get('CLICKSEND_USERNAME') || 'lachie@skanfarming.com'
const clickSendKey = Deno.env.get('CLICKSEND_API_KEY') || 'A9FBA50D-3EB6-96CF-849E-30826ECD4B14'

const stripe = new Stripe(stripeApiKey!, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const supabase = createClient(supabaseUrl!, supabaseServiceRole!)

// Plan limits
const PRO_MARKER_LIMIT = 999999
const PRO_TRAIL_LIMIT = 999999
const FREE_MARKER_LIMIT = 100
const FREE_TRAIL_LIMIT = 100000
const SHORT_DOMAIN = "https://agskan.com/p"

/**
 * Look up user_id from a Stripe customer ID.
 * Falls back to Stripe metadata and email lookup if no stripe_customers row exists
 * (e.g. customers created via Payment Links).
 */
async function getUserIdFromCustomer(stripeCustomerId: string): Promise<string> {
    // 1. Direct lookup in stripe_customers table
    const { data, error } = await supabase
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
        const { data: profile } = await supabase
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
    const { error: insertError } = await supabase
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

/**
 * Send an SMS via ClickSend
 */
async function sendSms(phoneNumber: string, message: string): Promise<boolean> {
    try {
        const auth = btoa(`${clickSendUser}:${clickSendKey}`)
        const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${auth}`,
            },
            body: JSON.stringify({
                messages: [
                    {
                        source: "sdk",
                        body: message,
                        to: phoneNumber,
                    },
                ],
            }),
        })

        if (!res.ok) {
            console.error("[SMS] ClickSend error:", res.status, await res.text())
            return false
        }

        console.log(`[SMS] Sent to ${phoneNumber}: ${message}`)
        return true
    } catch (err) {
        console.error("[SMS] Failed:", err instanceof Error ? err.message : err)
        return false
    }
}

/**
 * Look up the user's mobile & first name and send an invoice SMS.
 * Checks Stripe customer.phone first, then falls back to profiles.mobile.
 * Supports {firstName} placeholder in the message.
 * Currently restricted to SMS_TEST_NUMBERS whitelist.
 */
async function sendInvoiceSms(userId: string, stripeCustomerId: string, message: string) {
    let rawMobile: string | null = null
    let firstName = "there"

    // 1. Try Stripe customer phone first
    try {
        const customer = await stripe.customers.retrieve(stripeCustomerId)
        if (!customer.deleted && customer.phone) {
            rawMobile = customer.phone
            firstName = customer.name?.split(" ")[0] || customer.metadata?.first_name || "there"
            console.log(`[SMS] Using Stripe phone for ${stripeCustomerId}: ${rawMobile}`)
        }
    } catch (err) {
        console.log(`[SMS] Could not retrieve Stripe customer ${stripeCustomerId}:`, err instanceof Error ? err.message : err)
    }

    // 2. Fall back to profiles table
    if (!rawMobile) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("mobile, first_name")
            .eq("id", userId)
            .single()

        rawMobile = profile?.mobile || null
        if (profile?.first_name) firstName = profile.first_name
    }

    if (!rawMobile) {
        console.log(`[SMS] SKIP: No mobile number for user ${userId} (checked Stripe & profiles)`)
        return
    }

    const personalized = message.replace("{firstName}", firstName)

    const ok = await sendSms(rawMobile, personalized)
    if (!ok) {
        console.error(`[SMS] FAILED to send to ${normalized} (user ${userId})`)
    }
}

/**
 * Generate a short skanfarming.com/p/:code URL for the given long URL.
 * Returns the short URL, or the original long URL on failure.
 */
async function shortenUrl(longUrl: string): Promise<string> {
    try {
        const code = crypto.randomUUID().slice(0, 6)
        const { error } = await supabase
            .from("short_urls")
            .insert({ code, long_url: longUrl })

        if (error) {
            console.error("[shortenUrl] Insert failed:", error.message)
            return longUrl
        }

        console.log(`[shortenUrl] ${code} → ${longUrl}`)
        return `${SHORT_DOMAIN}/${code}`
    } catch (err) {
        console.error("[shortenUrl] Error:", err instanceof Error ? err.message : err)
        return longUrl
    }
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

        // Verify webhook signature (async for Deno's Web Crypto API)
        const event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            stripeWebhookSecret!,
            undefined,
            cryptoProvider
        )

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

            // ─── INVOICE PAID (renewal OR manual invoice for a subscription price) ───
            case "invoice.paid": {
                const invoice = event.data.object as any
                if (!invoice.customer) break

                const userId = await getUserIdFromCustomer(invoice.customer as string)

                if (invoice.subscription) {
                    // Standard renewal — update from existing subscription
                    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
                    const updateData = mapSubscriptionToUpdate(subscription)

                    console.log("[Webhook] Invoice PAID (renewal):", {
                        user_id: userId, amount: invoice.amount_paid,
                        billing_reason: invoice.billing_reason,
                    })

                    await updateSubscription(userId, updateData)
                } else {
                    // Manual invoice with no subscription — check if line items include
                    // a recurring price and create a subscription for the customer.
                    const lineItems = invoice.lines?.data || []
                    const recurringItem = lineItems.find(
                        (li: any) => li.price?.type === "recurring"
                    )

                    if (recurringItem) {
                        console.log("[Webhook] Invoice PAID (manual — creating subscription):", {
                            user_id: userId,
                            amount: invoice.amount_paid,
                            price: recurringItem.price?.id,
                            quantity: recurringItem.quantity,
                        })

                        // Create a Stripe subscription so future renewals work
                        const subscription = await stripe.subscriptions.create({
                            customer: invoice.customer as string,
                            items: [{ price: recurringItem.price.id, quantity: recurringItem.quantity || 1 }],
                            backdate_start_date: Math.floor(Date.now() / 1000),
                            metadata: { created_from_invoice: invoice.id },
                        })

                        const updateData = mapSubscriptionToUpdate(subscription)
                        await updateSubscription(userId, updateData)
                    } else {
                        console.log("[Webhook] Invoice PAID (one-off, no subscription):", invoice.id)
                    }
                }

                // SMS receipt for all paid invoices
                const amount = (invoice.amount_paid / 100).toFixed(2)
                const currency = invoice.currency?.toUpperCase() || "AUD"
                const email = invoice.customer_email || "your email"
                await sendInvoiceSms(userId, invoice.customer as string,
                    `Hi {firstName},\nReceipt from AgSKAN: $${amount} ${currency}\nYour payment has been received — thanks!\nSent to: ${email}\nContact: service@skanfarming.com`
                )
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

                // SMS reminder
                const email = invoice.customer_email || "your email"
                const payLink = await shortenUrl(invoice.hosted_invoice_url || "")
                const reason = invoice.billing_reason || ""

                // Auto-renewal that failed — card issue
                if (reason === "subscription_cycle") {
                    await sendInvoiceSms(userId, invoice.customer as string,
                        `Hi {firstName}, your automatic renewal with AgSKAN couldn't be processed — your card may have expired.\nSent to: ${email}\nUpdate payment: ${payLink}\nContact: service@skanfarming.com`
                    )
                } else {
                    await sendInvoiceSms(userId, invoice.customer as string,
                        `Hi {firstName}, a friendly reminder from AgSKAN that your invoice remains unpaid.\nSent to: ${email}\nPay online: ${payLink}\nIf you've already paid please disregard. Contact: service@skanfarming.com`
                    )
                }
                break
            }

            // ─── INVOICE SENT (new invoice created) ───
            case "invoice.sent": {
                const invoice = event.data.object as any
                if (!invoice.customer) break

                const userId = await getUserIdFromCustomer(invoice.customer as string)
                const email = invoice.customer_email || "your email"
                const dueDate = invoice.due_date
                    ? new Date(invoice.due_date * 1000).toLocaleDateString("en-AU")
                    : "soon"
                const reason = invoice.billing_reason || "manual"

                console.log("[Webhook] Invoice SENT:", {
                    user_id: userId, amount: invoice.amount_due,
                    billing_reason: reason,
                })

                // Auto-renewal — receipt SMS sent on invoice.paid instead (after charge succeeds)
                if (reason === "subscription_cycle") {
                    console.log("[Webhook] Invoice SENT (auto-renewal, no SMS — waiting for invoice.paid):", invoice.id)
                } else {
                    // Manual, subscription_create, subscription_update — needs payment
                    const payLink = await shortenUrl(invoice.hosted_invoice_url || "")
                    await sendInvoiceSms(userId, invoice.customer as string,
                        `Hi {firstName},\nInvoice from AgSKAN — due ${dueDate}\nPay online: ${payLink}\nSent to: ${email}\nContact: service@skanfarming.com`
                    )
                }
                break
            }

            // ─── INVOICE UPCOMING (due in ~3 days) ───
            case "invoice.upcoming": {
                // No SMS sent for upcoming invoices — Stripe already emails the customer.
                // We only SMS on invoice.sent and invoice.payment_failed.
                console.log("[Webhook] Invoice UPCOMING (no SMS):", event.id)
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
