// src/routes/api/subscription/free/+server.ts
import { json } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";

export async function POST({ request }) {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return json({ error: "Unauthorized - no valid token" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];

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

        // Check if there's already a subscription
        const { data: existingSub } = await supabase
            .from("user_subscriptions")
            .select("*")
            .eq("user_id", user.id)
            .single();

        // If subscription exists, just update it
        if (existingSub) {
            const { error } = await supabase
                .from("user_subscriptions")
                .update({
                    subscription: "FREE",
                    marker_limit: 100,
                    trail_limit: 10000,
                    current_seats: 5,
                    lingering_seats: 0,
                    next_billing_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq("user_id", user.id);

            if (error) {
                throw error;
            }
        } else {
            // Create a new free subscription for the user
            const { error } = await supabase
                .from("user_subscriptions")
                .insert({
                    user_id: user.id,
                    subscription: "FREE",
                    marker_limit: 100,
                    trail_limit: 10000,
                    current_seats: 5,
                    lingering_seats: 0,
                    next_billing_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) {
                throw error;
            }
        }

        // Also update profile to indicate onboarding complete
        await supabase
            .from("profiles")
            .update({
                onboarded: true,
                updated_at: new Date().toISOString()
            })
            .eq("id", user.id);

        return json({ success: true, message: "Free plan activated successfully" });
    } catch (error) {
        console.error("Error activating free plan:", error);
        return json({
            error: error.message || "An unexpected error occurred",
            details: error.toString()
        }, { status: 500 });
    }
}