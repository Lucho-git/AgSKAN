// /supabase/functions/send-invite-sms/index.ts
// Text a guest invite link via ClickSend. Team members (never guests) can send.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("PUBLIC_SUPABASE_URL")!
const supabaseServiceRole = Deno.env.get("PRIVATE_SUPABASE_SERVICE_ROLE")!
const clickSendUser = Deno.env.get("CLICKSEND_USERNAME") || "lachie@skanfarming.com"
const clickSendKey = Deno.env.get("CLICKSEND_API_KEY") || "A9FBA50D-3EB6-96CF-849E-30826ECD4B14"

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
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders })
    }
    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405)
    }

    try {
        const { phone, message } = await req.json()

        if (!phone || !message) {
            return json({ error: "Missing phone or message" }, 400)
        }
        if (String(message).length > 500) {
            return json({ error: "Message too long (max 500 chars)" }, 400)
        }

        // Verify caller is a signed-in team member with a map.
        const authHeader = req.headers.get("Authorization")
        if (!authHeader) {
            return json({ error: "Missing auth header" }, 401)
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRole)
        const token = authHeader.replace("Bearer ", "")
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return json({ error: "Unauthorized" }, 401)
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("map_role, master_map_id")
            .eq("id", user.id)
            .single()

        if (!profile?.master_map_id) {
            return json({ error: "No map linked to this account" }, 403)
        }

        // Members and the map owner can text invites; guests cannot.
        const { data: mapRow } = await supabase
            .from("master_maps")
            .select("master_user_id")
            .eq("id", profile.master_map_id)
            .single()

        const isOwner = mapRow?.master_user_id === user.id
        if (profile.map_role !== "member" && !isOwner) {
            return json({ error: "Only team members can text invites" }, 403)
        }

        // Send via ClickSend (same account used by invoices/notifications).
        const auth = btoa(`${clickSendUser}:${clickSendKey}`)
        const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${auth}`,
            },
            body: JSON.stringify({
                messages: [{
                    source: "sdk",
                    from: "AgSKAN",
                    body: String(message),
                    to: String(phone),
                }],
            }),
        })

        if (!res.ok) {
            const errText = await res.text()
            console.error("[send-invite-sms] ClickSend error:", res.status, errText)
            return json({ error: `SMS provider error: ${res.status}` }, 502)
        }

        const result = await res.json()
        console.log(`[send-invite-sms] Sent to ${phone} by ${user.id}`)

        return json({ success: true, data: result.data }, 200)
    } catch (err) {
        console.error("[send-invite-sms] Error:", err instanceof Error ? err.message : err)
        return json({ error: "Internal server error" }, 500)
    }
})
