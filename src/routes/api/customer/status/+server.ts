// src/routes/api/customer/status/+server.ts
import { json } from "@sveltejs/kit"
import { getOrCreateCustomerId, fetchSubscription } from "../../../(admin)/account/subscription_helpers.server"

export async function GET({ locals }) {
    const { getSession, supabaseServiceRole } = locals

    try {
        const session = await getSession()
        if (!session) {
            return json({ error: "Unauthorized" }, { status: 401 })
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