import {
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
} from "$env/static/public"
import { createSupabaseServerClient } from "@supabase/auth-helpers-sveltekit"
import type { Handle, HandleServerError } from "@sveltejs/kit"
import { v4 as uuidv4 } from "uuid"
import { supabaseServiceRole } from "$lib/supabaseAdmin.server"

async function getUserFullName(supabase, userId: string) {
    if (!userId) return null

    const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single()

    if (error) {
        console.error("Error fetching user full name:", error)
        return null
    }

    return data?.full_name
}

async function logErrorToDatabase(
    supabase,
    errorDetails: any,
    errorId: string,
) {
    try {
        const { error } = await supabase.from("error_logs").insert({
            id: errorId,
            user_id: errorDetails.userId,
            full_name: errorDetails.userFullName,
            url: errorDetails.url,
            status: errorDetails.status,
            timestamp: errorDetails.timestamp,
            error_details: {
                method: errorDetails.method,
                userAgent: errorDetails.userAgent,
                referer: errorDetails.referer,
                route: errorDetails.route,
                message: errorDetails.message,
                stack: errorDetails.stack,
            },
        })

        if (error) {
            console.error("Failed to log error to database:", error)
        } else {
            console.log("Error logged to database successfully:", errorId)
        }
    } catch (logError) {
        console.error("Error while logging to database:", logError)
    }
}

// Check if a URL is for browser DevTools, bot crawlers, or static asset requests we want to ignore
function shouldIgnoreRequest(url: URL, userAgent: string | null): boolean {
    const pathsToIgnore = [
        '/.well-known/appspecific/com.chrome.devtools.json',
        '/.well-known/appspecific/',
        '/chrome-extension',
        '/favicon.ico',
        '/apple-touch-icon',
        '/apple-touch-icon-precomposed',
        '/robots.txt',
        '/sitemap',
        '/.env',
        '/wp-admin',
        '/wp-login',
        '/.git',
    ]

    if (pathsToIgnore.some(path => url.pathname.toLowerCase().includes(path))) {
        return true
    }

    // Ignore common bot/crawler user agents
    if (userAgent) {
        const botPatterns = [
            'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
            'censys', 'zgrab', 'guzzlehttp', 'go-http-client', 'python-requests',
            'scan', 'security', 'masscan', 'nmap',
        ]
        const ua = userAgent.toLowerCase()
        if (botPatterns.some(pattern => ua.includes(pattern))) {
            return true
        }
    }

    return false
}

// Strip sensitive/large data from headers — only keep useful diagnostics
function getSafeDiagnostics(headers: Headers): { userAgent: string | null; referer: string | null } {
    return {
        userAgent: headers.get('user-agent'),
        referer: headers.get('referer'),
    }
}

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.supabase = createSupabaseServerClient({
        supabaseUrl: PUBLIC_SUPABASE_URL,
        supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
        event,
        cookieOptions: {
            domain: "skanfarming.com.au",
            secure: true,
            sameSite: "lax",
            path: "/",
        },
    })

    event.locals.supabaseServiceRole = supabaseServiceRole

    event.locals.getSession = async () => {
        const {
            data: { session },
        } = await event.locals.supabase.auth.getSession()
        return session
    }

    try {
        const response = await resolve(event, {
            transformPageChunk: ({ html }) =>
                html.replace(
                    "%sveltekit.head%",
                    `%sveltekit.head%
                <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' https://salesiq.zohopublic.com.au;">
                `,
                ),
        })

        // Only log server errors (5xx), not client errors like 404s
        // 404s are mostly bots/crawlers and not actionable
        if (response.status >= 500) {
            const session = await event.locals.getSession()
            const errorId = uuidv4()
            const userId = session?.user?.id
            const userFullName = await getUserFullName(
                event.locals.supabaseServiceRole,
                userId,
            )
            const diag = getSafeDiagnostics(event.request.headers)

            const errorDetails = {
                id: errorId,
                status: response.status,
                url: event.url.toString(),
                method: event.request.method,
                userAgent: diag.userAgent,
                referer: diag.referer,
                userId: userId,
                userFullName: userFullName,
                timestamp: new Date().toISOString(),
                route: event.route?.id,
                message: `Server error: ${response.status}`,
            }

            console.error(`${response.status} Error:`, errorDetails)
            await logErrorToDatabase(
                event.locals.supabaseServiceRole,
                errorDetails,
                errorId,
            )
        }

        return response
    } catch (error) {
        throw error
    }
}

export const handleError: HandleServerError = async ({ error, event }) => {
    const status = (error as any).status || 500
    const userAgent = event.request.headers.get('user-agent')

    // Don't log errors for browser-specific requests or bots
    if (shouldIgnoreRequest(event.url, userAgent)) {
        return {
            message: "Not found",
            status: 404,
        }
    }

    // Don't log 404s — they're not actionable
    if (status === 404) {
        return {
            message: "Not found",
            status: 404,
        }
    }

    const errorId = uuidv4()
    const session = await event.locals.getSession()
    const userId = session?.user?.id
    const userFullName = await getUserFullName(
        event.locals.supabaseServiceRole,
        userId,
    )
    const diag = getSafeDiagnostics(event.request.headers)

    const errorDetails = {
        id: errorId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        status,
        url: event.url.toString(),
        route: event.route?.id,
        method: event.request.method,
        userAgent: diag.userAgent,
        referer: diag.referer,
        userId: userId,
        userFullName: userFullName,
        timestamp: new Date().toISOString(),
    }

    console.error("Detailed error:", errorDetails)

    // Only log server errors (5xx) to the database to avoid bloat
    if (status >= 500) {
        await logErrorToDatabase(
            event.locals.supabaseServiceRole,
            errorDetails,
            errorId,
        )
    }

    // Return an object that will be passed to the error page
    return {
        message: "An error occurred. Our team has been notified.",
        errorId: errorId,
    }
}