// /supabase/functions/redirect/index.ts
// Handles GET /p/:code → 302 redirect to the stored long_url
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get("PUBLIC_SUPABASE_URL")!
const supabaseServiceRole = Deno.env.get("PRIVATE_SUPABASE_SERVICE_ROLE")!

serve(async (req: Request) => {
    const url = new URL(req.url)
    const code = url.pathname.replace(/^\/p\//, "").trim()

    if (!code || code.length > 20) {
        return new Response("Not found", { status: 404 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRole)

    const { data, error } = await supabase
        .from("short_urls")
        .select("long_url")
        .eq("code", code)
        .single()

    if (error || !data) {
        console.log(`[redirect] Code not found: ${code}`)
        return new Response("Not found", { status: 404 })
    }

    console.log(`[redirect] ${code} → ${data.long_url}`)

    return new Response(null, {
        status: 302,
        headers: { Location: data.long_url },
    })
})
