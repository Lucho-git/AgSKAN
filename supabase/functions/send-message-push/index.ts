// /supabase/functions/send-message-push/index.ts
// Push an offline member's phone when someone messages them from the map.
// Sends both channels:
//   1. Web push (VAPID) → their stored browser/PWA subscriptions.
//   2. Native push (OneSignal) → their app installs, addressed by external_id.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as webpush from "jsr:@negrel/webpush"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendOneSignalPush } from "../_shared/onesignal.ts"

const PUBLIC_VAPID_KEY = Deno.env.get("PUBLIC_VAPID_KEY")
const PRIVATE_VAPID_KEY = Deno.env.get("PRIVATE_VAPID_KEY")
const supabaseUrl = Deno.env.get("PUBLIC_SUPABASE_URL")!
const serviceRole = Deno.env.get("PRIVATE_SUPABASE_SERVICE_ROLE")!

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

    try {
        const { recipient_id, sender_name, body } = await req.json()
        if (!recipient_id) {
            return json({ error: "Missing recipient_id" }, 400)
        }

        // Caller must be a signed-in member of the same map.
        const authHeader = req.headers.get("Authorization")
        if (!authHeader) return json({ error: "Missing auth header" }, 401)

        const supabase = createClient(supabaseUrl, serviceRole)
        const token = authHeader.replace("Bearer ", "")
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) return json({ error: "Unauthorized" }, 401)
        if (user.id === recipient_id) return json({ error: "Cannot message yourself" }, 400)

        const { data: sender } = await supabase
            .from("profiles")
            .select("master_map_id, full_name")
            .eq("id", user.id)
            .single()
        const { data: recipient } = await supabase
            .from("profiles")
            .select("master_map_id")
            .eq("id", recipient_id)
            .single()

        if (!sender?.master_map_id || !recipient?.master_map_id) {
            return json({ error: "No map linked to this account" }, 403)
        }
        if (sender.master_map_id !== recipient.master_map_id) {
            return json({ error: "Recipient is not on your map" }, 403)
        }

        // Recipient's web-push subscriptions (one row per browser/PWA device).
        const { data: subs, error: subsError } = await supabase
            .from("push_subscriptions")
            .select("id, subscription")
            .eq("user_id", recipient_id)
        if (subsError) {
            // Don't bail — OneSignal may still reach their phone.
            console.error("[send-message-push] subscription lookup failed:", subsError)
        }

        // Keep the title to just the sender's name so the message preview gets
        // the rest of the space on the notification.
        const title = sender_name || sender.full_name || "Team member"
        const rawText = body ? String(body) : ""
        const text = rawText || "📍 Shared a location"

        // 1) Web push (VAPID) to PWA/browser subscriptions.
        let sent = 0
        const webSubs = subs ?? []
        if (webSubs.length > 0 && PUBLIC_VAPID_KEY && PRIVATE_VAPID_KEY) {
            const vapidKeys = await webpush.importVapidKeys({
                publicKey: JSON.parse(PUBLIC_VAPID_KEY),
                privateKey: JSON.parse(PRIVATE_VAPID_KEY),
            })
            const appServer = await webpush.ApplicationServer.new({
                contactInformation: "mailto:lachie@skanfarming.com",
                vapidKeys,
            })
            const payload = JSON.stringify({
                title,
                body: text,
                url: `https://www.skanfarming.com.au/account/mapviewer?messageFrom=${user.id}`,
            })
            const staleIds: number[] = []
            for (const row of webSubs) {
                try {
                    const subscription = JSON.parse(row.subscription)
                    const subscriber = appServer.subscribe(subscription)
                    await subscriber.pushTextMessage(payload, {
                        urgency: webpush.Urgency.High,
                        ttl: 3600,
                    })
                    sent++
                } catch (error) {
                    console.warn(
                        "[send-message-push] device failed:",
                        row.id,
                        error instanceof Error ? error.message : error,
                    )
                    // Gone/subscription-expired → clean it up.
                    if (error instanceof webpush.PushMessageError && error.isGone()) {
                        staleIds.push(row.id)
                    }
                }
            }
            if (staleIds.length > 0) {
                await supabase.from("push_subscriptions").delete().in("id", staleIds)
            }
        }

        // 2) Native push (OneSignal) to app installs — no tokens stored on our side.
        const onesignal = await sendOneSignalPush({
            externalId: recipient_id,
            title,
            body: text,
            data: {
                url: `/account/mapviewer?messageFrom=${user.id}`,
                type: "map_message",
                sender_id: user.id,
            },
            groupKey: user.id,
        })

        return json({
            success: true,
            sent,
            total: webSubs.length,
            onesignal: {
                ok: onesignal.ok,
                skipped: onesignal.skipped,
                sent: onesignal.recipients,
                error: onesignal.error ?? null,
            },
        }, 200)
    } catch (error) {
        console.error(
            "[send-message-push] error:",
            error instanceof Error ? error.message : error,
        )
        return json({ error: "Internal server error" }, 500)
    }
})
