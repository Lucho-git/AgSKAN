// src/routes/api/files/upload/+server.ts

import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({ request, locals }) => {
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

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
        return json({ error: "No file selected" }, { status: 400 })
    }

    try {
        // Upload to main bucket
        const { data: uploadData, error: uploadError } =
            await locals.supabase.storage
                .from("user_files_bucket")
                .upload(`user_${userId}/${file.name}`, file)

        if (uploadError) throw uploadError

        // Upload to copy bucket
        await locals.supabase.storage
            .from("user_files_bucket_copy")
            .upload(`user_${userId}/${file.name}`, file)

        // Insert metadata and return the full row
        const { data: insertData, error: insertError } = await locals.supabase
            .from("user_files")
            .insert({
                file_name: file.name,
                file_path: uploadData.path,
                user_id: userId,
            })
            .select("*")
            .single()

        if (insertError) throw insertError

        // Return the complete file data
        return json({
            message: "File uploaded successfully",
            file: insertData,
        })
    } catch (error) {
        return json({ error: "Failed to upload file" }, { status: 500 })
    }
}