// Redirect authenticated users away from the login page — no flash.
// Runs client-side in static SPA mode (adapter-static / Capacitor).
import { redirect } from "@sveltejs/kit"
import {
    PUBLIC_SUPABASE_ANON_KEY,
    PUBLIC_SUPABASE_URL,
} from "$env/static/public"
import { createClient } from "@supabase/supabase-js"

export const load = async ({ url }) => {
    const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)
    const { data: { session } } = await supabase.auth.getSession()

    // Only redirect if session is valid and not expired (avoids stale session after sign out)
    if (session) {
        const expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : null
        console.log("🟡 LOGIN +page.ts: session found, expires:", expiresAt, "redirecting to /account")
        if (!expiresAt || expiresAt > new Date()) {
            // Store map_code in localStorage so the account page can consume it
            const mapCode = url.searchParams.get("map_code") || url.searchParams.get("map_id")
            if (mapCode) {
                localStorage.setItem("pending_map_id", mapCode)
            }

            throw redirect(302, "/account")
        }
    }

    return {}
}
