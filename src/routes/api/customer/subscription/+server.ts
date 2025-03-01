// src/routes/api/customer/subscription/+server.ts
import { json } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";
import { getOrCreateStripeCustomerId, fetchStripeSubscription } from "../../_helpers/stripeHelpers.js";

export async function GET({ request, locals }) {
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

        // Get the user's profile data
        const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, company_name, website")
            .eq("id", user.id)
            .single();

        // Get or create the customer ID
        const { error: idError, customerId } = await getOrCreateStripeCustomerId({
            supabase: supabaseServiceRole || supabase,
            userId: user.id,
            email: user.email,
            profileData: profile || {}
        });

        if (idError || !customerId) {
            return json({ error: `Failed to get customer ID: ${idError}` }, { status: 500 });
        }

        // Fetch the subscription
        const {
            error: subError,
            primarySubscription,
            hasEverHadSubscription
        } = await fetchStripeSubscription({ customerId });

        if (subError) {
            return json({ error: `Failed to fetch subscription: ${subError}` }, { status: 500 });
        }

        return json({
            primarySubscription,
            hasEverHadSubscription,
            currentPlanId: primarySubscription?.appSubscription?.id || "free"
        });
    } catch (error) {
        console.error("Error handling subscription request:", error);
        return json({
            error: error.message || "An unexpected error occurred"
        }, { status: 500 });
    }
}