// /supabase/functions/send-sms/index.ts
// Admin-only endpoint to send an SMS via ClickSend
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("PUBLIC_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!
const supabaseServiceRole =
    Deno.env.get("PRIVATE_SUPABASE_SERVICE_ROLE") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const clickSendUser = Deno.env.get("CLICKSEND_USERNAME") || "lachie@skanfarming.com"
const clickSendKey = Deno.env.get("CLICKSEND_API_KEY") || "A9FBA50D-3EB6-96CF-849E-30826ECD4B14"

// Same CORS setup as send-invite-sms. Without these headers the browser's
// preflight fails and the POST never leaves the page.
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

/**
 * ClickSend expects E.164 (+61412345678) but the admin dashboard passes
 * profiles.mobile straight through, which is stored in local AU format
 * ("0478638278" or "0478 638 278"). Normalise before sending.
 */
function normalizePhone(raw: string): string {
    const cleaned = String(raw).replace(/[^\d+]/g, "")
    if (cleaned.startsWith("+")) return cleaned
    if (cleaned.startsWith("0061")) return `+61${cleaned.slice(4)}`
    if (cleaned.startsWith("0")) return `+61${cleaned.replace(/^0+/, "")}`
    if (cleaned.startsWith("61") && cleaned.length === 11) return `+${cleaned}`
    return cleaned
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

        const to = normalizePhone(phone)

        // Verify caller is signed in and has the developer/admin tools enabled.
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

        // Same gate the admin dashboard itself uses: admin_dashboard_query()
        // rejects callers without user_settings.dev_tools_enabled. NOTE: this
        // used to test profiles.role === "ADMIN", a value that exists on no
        // row (roles are manager/operator/viewer/null), so every call 403'd.
        const { data: settings } = await supabase
            .from("user_settings")
            .select("dev_tools_enabled")
            .eq("user_id", user.id)
            .single()

        if (settings?.dev_tools_enabled !== true) {
            return json({ error: "Admin access required" }, 403)
        }

        // Send via ClickSend (same account used by invoices/notifications)
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
                    to,
                }],
            }),
        })

        if (!res.ok) {
            const errText = await res.text()
            console.error("[send-sms] ClickSend error:", res.status, errText)
            return json({ error: `SMS provider error: ${res.status}` }, 502)
        }

        const result = await res.json()
        console.log(`[send-sms] Sent to ${to} by ${user.id}`)

        return json({ success: true, data: result.data }, 200)
    } catch (err) {
        console.error("[send-sms] Error:", err instanceof Error ? err.message : err)
        return json({ error: "Internal server error" }, 500)
    }
})
