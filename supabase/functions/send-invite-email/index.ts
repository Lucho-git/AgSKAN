// /supabase/functions/send-invite-email/index.ts
// Email a guest invite link via Brevo (service@skanfarming.com).
// Team members (never guests) can send.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("PUBLIC_SUPABASE_URL")!
const supabaseServiceRole = Deno.env.get("PRIVATE_SUPABASE_SERVICE_ROLE")!
const brevoKey =
    Deno.env.get("PRIVATE_BREVO_API_KEY") || Deno.env.get("BREVO_API_KEY") || ""
const SENDER_EMAIL = "service@skanfarming.com"
const SENDER_NAME = "AgSKAN"

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
        const { email, subject, message } = await req.json()

        if (!email || !message) {
            return json({ error: "Missing email or message" }, 400)
        }
        if (!brevoKey) {
            console.error("[send-invite-email] No Brevo API key configured")
            return json({ error: "Email provider not configured" }, 500)
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

        // Members and the map owner can email invites; guests cannot.
        const { data: mapRow } = await supabase
            .from("master_maps")
            .select("master_user_id")
            .eq("id", profile.master_map_id)
            .single()

        const isOwner = mapRow?.master_user_id === user.id
        if (profile.map_role !== "member" && !isOwner) {
            return json({ error: "Only team members can send invites" }, 403)
        }

        // Send via Brevo
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": brevoKey,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                sender: { name: SENDER_NAME, email: SENDER_EMAIL },
                replyTo: { email: SENDER_EMAIL, name: SENDER_NAME },
                to: [{ email: String(email) }],
                subject: String(subject || "You're invited to view a map on AgSKAN"),
                textContent: String(message),
            }),
        })

        if (!res.ok) {
            const errText = await res.text()
            console.error("[send-invite-email] Brevo error:", res.status, errText)
            let providerMessage = ""
            try {
                providerMessage = JSON.parse(errText)?.message || ""
            } catch {
                providerMessage = errText.slice(0, 200)
            }
            return json(
                { error: `Email provider error: ${res.status}${providerMessage ? ` — ${providerMessage}` : ""}` },
                502,
            )
        }

        const result = await res.json()
        console.log(`[send-invite-email] Sent to ${email} by ${user.id}`)

        return json({ success: true, messageId: result?.messageId ?? null }, 200)
    } catch (err) {
        console.error("[send-invite-email] Error:", err instanceof Error ? err.message : err)
        return json({ error: "Internal server error" }, 500)
    }
})
