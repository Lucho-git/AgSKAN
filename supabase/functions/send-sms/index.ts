// /supabase/functions/send-sms/index.ts
// Admin-only endpoint to send an SMS via ClickSend
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("PUBLIC_SUPABASE_URL")!
const supabaseServiceRole = Deno.env.get("PRIVATE_SUPABASE_SERVICE_ROLE")!
const clickSendUser = Deno.env.get("CLICKSEND_USERNAME") || "lachie@skanfarming.com"
const clickSendKey = Deno.env.get("CLICKSEND_API_KEY") || "A9FBA50D-3EB6-96CF-849E-30826ECD4B14"

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 200 })
    }
    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 })
    }

    try {
        const { phone, message } = await req.json()

        if (!phone || !message) {
            return new Response(JSON.stringify({ error: "Missing phone or message" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            })
        }

        if (message.length > 500) {
            return new Response(JSON.stringify({ error: "Message too long (max 500 chars)" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            })
        }

        // Verify caller is an authenticated admin
        const authHeader = req.headers.get("Authorization")
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing auth header" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRole)
        const token = authHeader.replace("Bearer ", "")
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            })
        }

        // Check admin role via profiles
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single()

        if (!profile || profile.role !== "ADMIN") {
            return new Response(JSON.stringify({ error: "Admin access required" }), {
                status: 403,
                headers: { "Content-Type": "application/json" },
            })
        }

        // Send via ClickSend
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
                    from: "agskan",
                    body: message,
                    to: phone,
                }],
            }),
        })

        if (!res.ok) {
            const errText = await res.text()
            console.error("[send-sms] ClickSend error:", res.status, errText)
            return new Response(JSON.stringify({ error: `SMS provider error: ${res.status}` }), {
                status: 502,
                headers: { "Content-Type": "application/json" },
            })
        }

        const result = await res.json()
        console.log(`[send-sms] Sent to ${phone}: ${message}`)

        return new Response(JSON.stringify({ success: true, data: result.data }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        })
    } catch (err) {
        console.error("[send-sms] Error:", err instanceof Error ? err.message : err)
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        })
    }
})
