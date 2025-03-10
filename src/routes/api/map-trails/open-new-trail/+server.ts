// src/routes/api/map-trails/open-new-trail/+server.ts
import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { v4 as uuidv4 } from "uuid"
import { verifyClientToken } from "$lib/helpers/authHelpers"

export const POST: RequestHandler = async ({ request, locals }) => {
    try {
        // Check authentication using our helper
        const session = await verifyClientToken(request, locals.supabase)

        // If no session, check server-side session as fallback
        if (!session) {
            const serverSession = await locals.getSession()
            if (!serverSession) {
                return json({ error: "Unauthorized" }, { status: 401 })
            }
        }

        const { vehicle_id, operation_id, vehicle_info } = await request.json()

        if (!vehicle_id || !operation_id || !vehicle_info) {
            return json({ error: "Missing required fields" }, { status: 400 })
        }

        // Create new trail entry
        const serverStartTime = new Date().toISOString()

        const newTrail = {
            id: uuidv4(),
            vehicle_id,
            operation_id,
            start_time: serverStartTime,
            trail_color: vehicle_info.vehicle_marker.bodyColor || "#000000", // Default to black if no color
            trail_width: vehicle_info.vehicle_marker.swath || 11, // Default to 3 if no swath
        }

        // Use Supabase client
        const supabaseClient = locals.supabase

        const { data, error } = await supabaseClient
            .from("trails")
            .insert([newTrail])
            .select("*")

        if (error) {
            console.error("Error creating new trail:", error)
            return json({ error: "Failed to create new trail" }, { status: 500 })
        }

        return json({ trail: data[0] }, { status: 201 })
    } catch (error) {
        console.error("Unexpected error:", error)
        return json({ error: "An unexpected error occurred" }, { status: 500 })
    }
}