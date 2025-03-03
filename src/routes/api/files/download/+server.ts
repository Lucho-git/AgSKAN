// src/routes/api/files/download/+server.ts

import { error } from "@sveltejs/kit"
import { supabaseServiceRole } from "$lib/supabaseAdmin.server"

export async function GET({ url, request, locals }) {
    const fileName = url.searchParams.get("fileName")

    if (!fileName) {
        throw error(400, "File name is required")
    }

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
        throw error(401, "Unauthorized")
    }

    try {
        // Construct the full path including the user-specific folder
        const filePath = `user_${userId}/${fileName}`

        const { data, error: supabaseError } = await supabaseServiceRole.storage
            .from("user_files_bucket")
            .download(filePath)

        if (supabaseError) {
            throw error(500, supabaseError.message)
        }

        if (!data) {
            throw error(404, "File not found")
        }

        // Set appropriate headers for file download
        const headers = new Headers()
        headers.append("Content-Disposition", `attachment; filename="${fileName}"`)
        headers.append("Content-Type", "application/octet-stream")

        return new Response(data, { headers })
    } catch (err) {
        throw error(500, "An error occurred while downloading the file")
    }
}