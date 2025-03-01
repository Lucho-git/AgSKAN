// src/routes/api/customer/subscription/update-metadata/+server.ts
import { json } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";

export async function POST({ request, locals }) {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return json({ error: "Unauthorized - no valid token" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const supabaseServiceRole = locals.supabaseServiceRole;

    try {
        // Create a Supabase client with the provided token
        const supabase = createClient(
            PUBLIC_SUPABASE_URL,
            PUBLIC_SUPABASE_ANON_KEY,
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            }
        );

        // Verify the token by getting user info
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return json({ error: "Invalid or expired token" }, { status: 401 });
        }

        // Parse request body
        const updateData = await request.json();

        // Update user_subscriptions table using the appropriate client
        const client = supabaseServiceRole || supabase;
        const { error: updateError } = await client
            .from("user_subscriptions")
            .update({
                current_seats: updateData.current_seats,
                lingering_seats: updateData.lingering_seats,
                next_billing_date: updateData.next_billing_date,
                updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id);

        if (updateError) {
            console.error("Error updating subscription metadata:", updateError);
            return json({
                success: false,
                error: updateError.message || "Failed to update subscription metadata"
            }, { status: 500 });
        }

        return json({
            success: true,
            message: "Subscription metadata updated successfully"
        });
    } catch (error) {
        console.error("Error updating subscription metadata:", error);
        return json({
            success: false,
            error: error.message || "An unexpected error occurred"
        }, { status: 500 });
    }
}