// src/routes/api/customer/status/+server.ts
import { json } from "@sveltejs/kit"
import { getOrCreateCustomerId, fetchSubscription } from "../../../(admin)/account/subscription_helpers.server"
import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

export async function GET({ request, locals }) {
    const authHeader = request.headers.get('Authorization')
    const supabaseServiceRole = locals.supabaseServiceRole

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ error: "Unauthorized - no valid token" }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]

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
        )

        // Verify the token by getting user info
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return json({ error: "Invalid or expired token" }, { status: 401 })
        }

        // Create a session object similar to what getSession() would return
        const session = {
            user,
            access_token: token
        }

        const result = await getOrCreateCustomerId({
            supabaseServiceRole,
            session,
        })

        if (!result || typeof result !== "object") {
            return json({
                error: "Invalid response from customer creation",
                isActiveCustomer: false,
                currentPlanId: null,
            }, { status: 500 })
        }

        const { error: idError, customerId } = result

        if (idError || !customerId) {
            return json({
                error: `Error creating customer ID: ${idError}`,
                isActiveCustomer: false,
                currentPlanId: null,
            }, { status: 500 })
        }

        const {
            primarySubscription,
            hasEverHadSubscription,
            error: fetchErr,
        } = await fetchSubscription({
            customerId,
        })

        if (fetchErr) {
            return json({
                error: `Error fetching subscription: ${fetchErr}`,
                isActiveCustomer: false,
                currentPlanId: null,
            }, { status: 500 })
        }

        return json({
            isActiveCustomer: !!primarySubscription,
            hasEverHadSubscription,
            currentPlanId: primarySubscription?.appSubscription?.id || "free",
        })
    } catch (err) {
        console.error("Error in customer status API:", err)
        return json({
            error: err.message || "An unexpected error occurred",
            isActiveCustomer: false,
            currentPlanId: null,
        }, { status: 500 })
    }
}