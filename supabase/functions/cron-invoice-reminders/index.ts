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
const DAY_MS = 24 * 60 * 60 * 1000
const smsDryRun = Deno.env.get("SMS_DRY_RUN") === "true"

// ── SMS helpers (same as stripe-webhook) ──────────────────────

/**
 * ClickSend expects E.164 (+61412345678) but profiles.mobile is stored in
 * local AU format ("0478 638 278"), so normalise before sending.
 */
function normalizePhone(raw: string): string {
    const cleaned = String(raw).replace(/[^\d+]/g, "")
    if (cleaned.startsWith("+")) return cleaned
    if (cleaned.startsWith("0061")) return `+61${cleaned.slice(4)}`
    if (cleaned.startsWith("0")) return `+61${cleaned.replace(/^0+/, "")}`
    if (cleaned.startsWith("61") && cleaned.length === 11) return `+${cleaned}`
    return cleaned
}

async function sendSms(phoneNumber: string, message: string): Promise<boolean> {
    const to = normalizePhone(phoneNumber)

    if (!to) {
        console.error(`[SMS] Invalid phone number: ${phoneNumber}`)
        return false
    }

    if (smsDryRun) {
        console.log(`[SMS] DRY RUN — would send to ${to}: ${message}`)
        return true
    }

    try {
        const auth = btoa(`${clickSendUser}:${clickSendKey}`)
        const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${auth}`,
            },
            body: JSON.stringify({ messages: [{ source: "sdk", from: "AgSKAN", body: message, to }] }),
        })
        if (!res.ok) {
            console.error("[SMS] ClickSend error:", res.status, await res.text())
            return false
        }
        console.log(`[SMS] Sent to ${to}`)
        return true
    } catch (err) {
        console.error("[SMS] Failed:", err instanceof Error ? err.message : err)
        return false
    }
}

async function sendInvoiceSms(userId: string, stripeCustomerId: string, message: string): Promise<boolean> {
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
        // profiles stores full_name — there is no first_name column
        const { data: profile, error: profileError } = await supabase
            .from("profiles").select("mobile, full_name").eq("id", userId).single()

        if (profileError) {
            console.error(`[SMS] profiles lookup failed for ${userId}:`, profileError.message)
        }

        rawMobile = profile?.mobile || null
        const fullName = profile?.full_name?.trim()
        if (fullName) firstName = fullName.split(" ")[0]
    }

    if (!rawMobile) {
        console.log(`[SMS] SKIP: No mobile for user ${userId}`)
        return false
    }

    const personalized = message.replace("{firstName}", firstName)
    return await sendSms(rawMobile, personalized)
}

/**
 * Find the app user behind a Stripe invoice. Invoices raised from the dashboard
 * often carry no subscription, so fall back to the customer the invoice belongs to.
 */
async function resolveUserId(customerId: string, subscriptionId: string | null): Promise<string | null> {
    const { data: byCustomer } = await supabase
        .from("stripe_customers")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .limit(1)

    if (byCustomer?.[0]?.user_id) return byCustomer[0].user_id

    if (subscriptionId) {
        const { data: bySubscription } = await supabase
            .from("user_subscriptions")
            .select("user_id")
            .eq("stripe_subscription_id", subscriptionId)
            .limit(1)

        if (bySubscription?.[0]?.user_id) return bySubscription[0].user_id
    }

    return null
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
        // The invoice is the source of truth for chasing money: plenty of invoices are
        // raised manually from the Stripe dashboard and have no subscription at all.
        const { data: invoices, error: queryError } = await supabase
            .from("stripe_invoices")
            .select("id, customer_id, subscription_id, status, due_date, created, hosted_invoice_url")
            .eq("status", "open")
            .order("created", { ascending: true })
            .limit(500)

        if (queryError) {
            console.error("[Cron] Query error:", queryError.message)
            return new Response(JSON.stringify({ error: queryError.message }), { status: 500 })
        }

        if (!invoices || invoices.length === 0) {
            console.log("[Cron] No open invoices found")
            return new Response(JSON.stringify({ message: "No reminders needed", processed: 0 }), { status: 200 })
        }

        console.log(`[Cron] Found ${invoices.length} open invoices`)

        let sent = 0
        let skipped = 0
        let updated = 0

        for (const invoice of invoices) {
            const now = Date.now()

            // ── RE-VERIFY against Stripe (catches invoices paid since the DB row was written) ──
            let fresh: any
            try {
                fresh = await stripe.invoices.retrieve(invoice.id)
            } catch (err) {
                console.log(`[Cron] ${invoice.id}: cannot load from Stripe — skipping (${err instanceof Error ? err.message : err})`)
                skipped++
                continue
            }

            if (fresh.status !== "open" || (fresh.amount_due ?? 0) <= 0) {
                console.log(`[Cron] ${invoice.id}: Stripe status "${fresh.status}" / amount_due ${fresh.amount_due} — syncing DB, skipping SMS`)
                await supabase.from("stripe_invoices")
                    .update({
                        status: fresh.status,
                        amount_due: fresh.amount_due ?? 0,
                        due_date: fresh.due_date ? new Date(fresh.due_date * 1000).toISOString() : null,
                        hosted_invoice_url: fresh.hosted_invoice_url || null,
                    })
                    .eq("id", invoice.id)
                updated++
                continue
            }

            // ── Determine which reminder day this is ──
            // Stripe only sets due_date on invoices sent to the customer, so fall back to
            // the creation date and require a full day before texting about it.
            const dueDate = fresh.due_date
                ? new Date(fresh.due_date * 1000)
                : new Date((fresh.created || Math.floor(now / 1000)) * 1000)
            const daysOverdue = Math.floor((now - dueDate.getTime()) / DAY_MS)
            const minimumDays = fresh.due_date ? 0 : 1

            // Find the highest applicable reminder day
            let reminderDay = -1
            for (const day of REMINDER_DAYS) {
                if (daysOverdue >= Math.max(day, minimumDays)) reminderDay = day
            }
            if (reminderDay < 0) {
                console.log(`[Cron] ${invoice.id}: Not yet due (${daysOverdue}d)`)
                continue
            }

            // Check if this reminder was already sent for THIS invoice
            const { data: existing } = await supabase
                .from("invoice_reminders")
                .select("id")
                .eq("stripe_invoice_id", invoice.id)
                .eq("reminder_day", reminderDay)
                .limit(1)

            if (existing && existing.length > 0) {
                console.log(`[Cron] ${invoice.id}: Reminder day ${reminderDay} already sent — skipping`)
                skipped++
                continue
            }

            // ── Resolve customer + invoice URL ──
            const customerId = (fresh.customer as string) || invoice.customer_id
            const subscriptionId = (fresh.subscription as string) || invoice.subscription_id || null

            const userId = await resolveUserId(customerId, subscriptionId)
            if (!userId) {
                console.log(`[Cron] ${invoice.id}: No app user for customer ${customerId} — skipping`)
                skipped++
                continue
            }

            const invoiceUrl = fresh.hosted_invoice_url
                ? await shortenUrl(fresh.hosted_invoice_url)
                : "https://agskan.com/account/billing"

            // ── Send SMS ──
            const dayLabel = reminderDay === 0 ? "due today" :
                reminderDay === 1 ? "1 day overdue" :
                `${reminderDay} days overdue`

            const msg = reminderDay === 0
                ? `Hi {firstName}, Invoice from AgSKAN - due ${dueDate.toLocaleDateString("en-AU")}. Pay online: ${invoiceUrl}. Contact: service@skanfarming.com`
                : `Hi {firstName}, your AgSKAN invoice is now ${dayLabel}. Please arrange payment: ${invoiceUrl}. Contact: service@skanfarming.com`

            const sentOk = await sendInvoiceSms(userId, customerId, msg)

            if (!sentOk) {
                console.log(`[Cron] ${invoice.id}: SMS not sent — will retry on the next run`)
                skipped++
                continue
            }

            // Record the reminder against the invoice so each invoice gets its own schedule
            const { error: recordError } = await supabase
                .from("invoice_reminders")
                .upsert({
                    user_id: userId,
                    stripe_subscription_id: subscriptionId,
                    stripe_invoice_id: invoice.id,
                    reminder_day: reminderDay,
                    sent_at: new Date().toISOString(),
                }, { onConflict: "stripe_invoice_id,reminder_day" })

            if (recordError) {
                console.error(`[Cron] ${invoice.id}: failed to record reminder:`, recordError.message)
            }

            sent++
            console.log(`[Cron] Sent reminder day ${reminderDay} to user ${userId} for invoice ${invoice.id}`)
        }

        return new Response(JSON.stringify({
            message: "Reminder check complete",
            processed: invoices.length,
            sent,
            skipped,
            updated,
        }), { status: 200 })

    } catch (err) {
        console.error("[Cron] Fatal:", err instanceof Error ? err.message : err)
        return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
    }
})
