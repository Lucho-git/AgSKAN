// src/routes/api/files/update_field/+server.ts
import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const PUT: RequestHandler = async ({ locals, request }) => {
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

        const { fieldId, name, area } = await request.json()

        if (!fieldId || !name) {
            return json({ error: "Field ID and name are required" }, { status: 400 })
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

        // Prepare update data with conditional area
        const updateData = { name }
        if (area !== undefined) {
            updateData['area'] = area
        }

        // Update the field
        const { data: updatedData, error: updateError } = await locals.supabase
            .from("fields")
            .update(updateData)
            .eq("field_id", fieldId)
            .eq("map_id", masterMapId)
            .select()

        if (updateError) {
            throw updateError
        }

        return json({
            success: true,
            message: "Field updated successfully",
            data: updatedData,
        })
    } catch (error) {
        return json(
            { error: "An error occurred while updating the field" },
            { status: 500 },
        )
    }
}