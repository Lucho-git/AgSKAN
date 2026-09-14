// /supabase/functions/send-test-push/index.ts
// Sends a test push notification to the CALLING user's own app installs via
// OneSignal. Used by Settings → Notifications to verify the mobile push
// pipeline end-to-end.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendOneSignalPush } from "../_shared/onesignal.ts"

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
        // Caller must be signed in — the test always targets the caller's own
        // devices, so there is nothing to authorise beyond that.
        const authHeader = req.headers.get("Authorization")
        if (!authHeader) return json({ error: "Missing auth header" }, 401)

        const supabase = createClient(supabaseUrl, serviceRole)
        const token = authHeader.replace("Bearer ", "")
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) return json({ error: "Unauthorized" }, 401)

        // Optional custom copy; defaults are fine for a first test.
        let body: { title?: string; body?: string } = {}
        try {
            body = await req.json()
        } catch {
            // empty body is fine
        }

        const title = String(body.title || "AgSKAN test notification").slice(0, 80)
        const text = String(
            body.body || "Push notifications are working on this device ✅",
        ).slice(0, 220)

        const result = await sendOneSignalPush({
            externalId: user.id,
            title,
            body: text,
            data: { url: "/account/mapviewer", type: "test" },
        })

        if (result.skipped) {
            return json(
                { success: false, reason: "not-configured", error: result.error },
                500,
            )
        }
        if (!result.ok) {
            return json(
                { success: false, error: result.error, errors: result.errors ?? null },
                502,
            )
        }

        return json(
            {
                success: true,
                recipients: result.recipients,
                id: result.id ?? null,
                errors: result.errors ?? null,
            },
            200,
        )
    } catch (error) {
        console.error(
            "[send-test-push] error:",
            error instanceof Error ? error.message : error,
        )
        return json({ error: "Internal server error" }, 500)
    }
})
