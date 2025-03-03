// src/routes/api/files/+server.ts
import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import type { FileUpload } from "$lib/types"

export const GET: RequestHandler = async ({ request, locals }) => {
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

        const { data, error } = await locals.supabase
            .from("user_files")
            .select(`file_id, user_id, file_name, file_path, created_at`)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })

        if (error) {
            throw error
        }

        const files: FileUpload[] = data.map((file: any) => ({
            id: file.file_id,
            name: file.file_name,
            path: file.file_path,
            uploadedDate: file.created_at,
            status: "Processed",
            message: "File uploaded successfully",
        }))

        return json(files)
    } catch (error) {
        return json({ error: "Failed to fetch user files" }, { status: 500 })
    }
}