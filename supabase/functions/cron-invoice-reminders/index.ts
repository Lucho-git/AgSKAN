// /supabase/functions/cron-invoice-reminders/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@14?target=deno"

const stripeApiKey = Deno.env.get('PRIVATE_STRIPE_API_KEY')
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL')
const supabaseServiceRole = Deno.env.get('PRIVATE_SUPABASE_SERVICE_ROLE')
const clickSendUser = Deno.env.get('CLICKSEND_USERNAME') || 'lachie@skanfarming.com'
const clickSendKey = Deno.env.get('CLICKSEND_API_KEY') || 'A9FBA50D-3EB6-96CF-849E-30826ECD4B14'

const stripe = new Stripe(stripeApiKey!, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
})
const supabase = createClient(supabaseUrl!, supabaseServiceRole!)

const SHORT_DOMAIN = "https://agskan.com/p"
const REMINDER_DAYS = [0, 1, 3, 7, 14]

// ── SMS helpers (same as stripe-webhook) ──────────────────────

async function sendSms(phoneNumber: string, message: string): Promise<boolean> {
    try {
        const auth = btoa(`${clickSendUser}:${clickSendKey}`)
        const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${auth}`,
            },
            body: JSON.stringify({ messages: [{ source: "sdk", body: message, to: phoneNumber }] }),
        })
        if (!res.ok) {
            console.error("[SMS] ClickSend error:", res.status, await res.text())
            return false
        }
        console.log(`[SMS] Sent to ${phoneNumber}`)
        return true
    } catch (err) {
        console.error("[SMS] Failed:", err instanceof Error ? err.message : err)
        return false
    }
}

async function sendInvoiceSms(userId: string, stripeCustomerId: string, message: string) {
    let rawMobile: string | null = null
    let firstName = "there"

    try {
        const customer = await stripe.customers.retrieve(stripeCustomerId)
        if (!customer.deleted && customer.phone) {
            rawMobile = customer.phone
            firstName = customer.name?.split(" ")[0] || customer.metadata?.first_name || "there"
        }
    } catch (err) {
        console.log(`[SMS] Could not retrieve Stripe customer ${stripeCustomerId}`)
    }

    if (!rawMobile) {
        const { data: profile } = await supabase
            .from("profiles").select("mobile, first_name").eq("id", userId).single()
        rawMobile = profile?.mobile || null
        if (profile?.first_name) firstName = profile.first_name
    }

    if (!rawMobile) {
        console.log(`[SMS] SKIP: No mobile for user ${userId}`)
        return
    }

    const personalized = message.replace("{firstName}", firstName)
    await sendSms(rawMobile, personalized)
}

async function shortenUrl(longUrl: string): Promise<string> {
    try {
        const code = crypto.randomUUID().slice(0, 6)
        const { error } = await supabase.from("short_urls").insert({ code, long_url: longUrl })
        if (error) { console.error("[shortenUrl] Insert failed:", error.message); return longUrl }
        return `${SHORT_DOMAIN}/${code}`
    } catch { return longUrl }
}

// ── Main handler ────────────────────────────────────────────

serve(async (req: Request) => {
    // Auth check
    const auth = req.headers.get("Authorization")
    if (auth !== "Bearer agskan-cron-2024") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    console.log("[Cron] Starting invoice reminder check...")

    try {
        // Get all past_due / unpaid subscriptions
        const { data: subs, error: queryError } = await supabase
            .from("user_subscriptions")
            .select("user_id, subscription_status, stripe_subscription_id")
            .in("subscription_status", ["past_due", "unpaid"])

        if (queryError) {
            console.error("[Cron] Query error:", queryError.message)
            return new Response(JSON.stringify({ error: queryError.message }), { status: 500 })
        }

        if (!subs || subs.length === 0) {
            console.log("[Cron] No past_due / unpaid subscriptions found")
            return new Response(JSON.stringify({ message: "No reminders needed", processed: 0 }), { status: 200 })
        }

        console.log(`[Cron] Found ${subs.length} past_due/unpaid subscriptions`)

        let sent = 0
        let skipped = 0
        let updated = 0

        for (const sub of subs) {
            // ── RE-VERIFY against Stripe (catches already-paid subs with stale DB) ──
            if (sub.stripe_subscription_id) {
                try {
                    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
                    if (stripeSub.status === "active" || stripeSub.status === "trialing") {
                        console.log(`[Cron] ${sub.user_id}: Stripe status is "${stripeSub.status}" — updating DB to active, skipping SMS`)
                        await supabase.from("user_subscriptions")
                            .update({ subscription_status: stripeSub.status, updated_at: new Date().toISOString() })
                            .eq("user_id", sub.user_id)
                        // Clean up any scheduled reminders for this user
                        await supabase.from("invoice_reminders")
                            .delete()
                            .eq("user_id", sub.user_id)
                        updated++
                        continue
                    }
                } catch (err) {
                    console.error(`[Cron] Failed to retrieve Stripe sub ${sub.stripe_subscription_id}:`, err instanceof Error ? err.message : err)
                    skipped++
                    continue
                }
            }

            // ── Determine which reminder day this is ──
            // Get the most recent invoice for this subscription
            const { data: invoices } = await supabase
                .from("stripe_invoices")
                .select("id, status, due_date, hosted_invoice_url")
                .eq("subscription_id", sub.stripe_subscription_id)
                .order("created", { ascending: false })
                .limit(1)

            if (!invoices || invoices.length === 0) {
                console.log(`[Cron] ${sub.user_id}: No invoices found — skipping`)
                skipped++
                continue
            }

            const invoice = invoices[0]
            if (!invoice.due_date) {
                console.log(`[Cron] ${sub.user_id}: Invoice has no due_date — skipping`)
                skipped++
                continue
            }

            const dueDate = new Date(invoice.due_date)
            const now = new Date()
            const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

            // Find the highest applicable reminder day
            let reminderDay = -1
            for (const day of REMINDER_DAYS) {
                if (daysOverdue >= day) reminderDay = day
            }
            if (reminderDay < 0) {
                console.log(`[Cron] ${sub.user_id}: Not yet due (${daysOverdue}d overdue)`)
                continue
            }

            // Check if we already sent this reminder
            const { data: existing } = await supabase
                .from("invoice_reminders")
                .select("id")
                .eq("user_id", sub.user_id)
                .eq("stripe_subscription_id", sub.stripe_subscription_id)
                .eq("reminder_day", reminderDay)
                .limit(1)

            if (existing && existing.length > 0) {
                console.log(`[Cron] ${sub.user_id}: Reminder day ${reminderDay} already sent — skipping`)
                skipped++
                continue
            }

            // ── Get invoice URL (shortened) ──
            let invoiceUrl = invoice.hosted_invoice_url
            if (invoiceUrl) {
                invoiceUrl = await shortenUrl(invoiceUrl)
            } else {
                invoiceUrl = "https://agskan.com/account/billing"
            }

            // Get stripe_customer_id for this user
            const { data: sc } = await supabase
                .from("stripe_customers")
                .select("stripe_customer_id")
                .eq("user_id", sub.user_id)
                .limit(1)
            const stripeCustomerId = sc?.[0]?.stripe_customer_id

            // ── Send SMS ──
            const dayLabel = reminderDay === 0 ? "due today" :
                reminderDay === 1 ? "1 day overdue" :
                `${reminderDay} days overdue`

            const msg = reminderDay === 0
                ? `Hi {firstName}, Invoice from AgSKAN - due ${dueDate.toLocaleDateString("en-AU")}. Pay online: ${invoiceUrl}. Contact: service@skanfarming.com`
                : `Hi {firstName}, your AgSKAN invoice is now ${dayLabel}. Please arrange payment: ${invoiceUrl}. Contact: service@skanfarming.com`

            if (stripeCustomerId) {
                await sendInvoiceSms(sub.user_id, stripeCustomerId, msg)
            }

            // Record reminder
            await supabase.from("invoice_reminders").insert({
                user_id: sub.user_id,
                stripe_subscription_id: sub.stripe_subscription_id,
                stripe_invoice_id: invoice.id,
                reminder_day: reminderDay,
                sent_at: new Date().toISOString(),
            })

            sent++
            console.log(`[Cron] Sent reminder day ${reminderDay} to user ${sub.user_id}`)
        }

        return new Response(JSON.stringify({
            message: "Reminder check complete",
            processed: subs.length,
            sent,
            skipped,
            updated,
        }), { status: 200 })

    } catch (err) {
        console.error("[Cron] Fatal:", err instanceof Error ? err.message : err)
        return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
    }
})
