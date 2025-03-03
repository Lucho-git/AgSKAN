import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const DELETE: RequestHandler = async ({ locals, request }) => {
    try {
        // Get authentication from the Authorization header
        let userId = null;
        const authHeader = request.headers.get('Authorization')

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7)

            // Verify the token using Supabase
            try {
                const { data, error: authError } = await locals.supabase.auth.getUser(token)
                if (!authError && data?.user) {
                    userId = data.user.id
                }
            } catch (e) {
                // Token verification failed
            }
        }

        // No valid authentication found
        if (!userId) {
            return json({ error: "Unauthorized" }, { status: 401 })
        }

        const { fieldId } = await request.json()

        if (!fieldId) {
            return json({ error: "Field ID is required" }, { status: 400 })
        }

        // First, check if the field belongs to the user's master map
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

        // Delete the field
        const { error: deleteError } = await locals.supabase
            .from("fields")
            .delete()
            .eq("field_id", fieldId)
            .eq("map_id", masterMapId)

        if (deleteError) {
            throw deleteError
        }

        return json({ success: true, message: "Field deleted successfully" })
    } catch (error) {
        return json(
            { error: "An error occurred while deleting the field" },
            { status: 500 },
        )
    }
}