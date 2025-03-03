// src/routes/api/files/load_fields/+server.ts
import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        // Try to get from Authorization header (client-side)
        let session = null;
        const authHeader = request.headers.get('Authorization')
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7)

            // Verify the token using Supabase
            try {
                const { data, error } = await locals.supabase.auth.getUser(token)
                if (!error && data?.user) {
                    session = {
                        user: data.user,
                        access_token: token
                    }
                }
            } catch (e) {
                // Token verification failed
            }
        }

        // Fallback to server-side session if needed
        if (!session) {
            session = await locals.getSession()
        }

        if (!session) {
            return json({ error: "Unauthorized" }, { status: 401 })
        }

        const userId = session.user.id

        const { data: profileData, error: profileError } = await locals.supabase
            .from("profiles")
            .select("master_map_id")
            .eq("id", userId)
            .single()

        if (profileError) {
            throw profileError
        }

        const masterMapId = profileData.master_map_id
        if (!masterMapId) {
            return json(
                { error: "No master map associated with user" },
                { status: 400 },
            )
        }

        const { data: fieldsData, error: fieldsError } = await locals.supabase
            .from("fields")
            .select(`*`)
            .eq("map_id", masterMapId)
            .order("name", { ascending: true })

        if (fieldsError) {
            throw fieldsError
        }

        return json({ fields: fieldsData })
    } catch (error) {
        return json(
            { error: "An error occurred while fetching fields" },
            { status: 500 },
        )
    }
}