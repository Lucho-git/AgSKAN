// src/routes/api/customer/status/+server.ts
import { json } from "@sveltejs/kit"
import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'
import { PRIVATE_STRIPE_API_KEY } from "$env/static/private"
import Stripe from "stripe"
import { pricingPlans } from "../../../(marketing)/pricing/pricing_plans"

const stripe = new Stripe(PRIVATE_STRIPE_API_KEY, { apiVersion: "2023-08-16" })

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

        // Get customer ID directly from the database
        const { data: dbCustomer, error: customerError } = await supabaseServiceRole
            .from("stripe_customers")
            .select("stripe_customer_id")
            .eq("user_id", user.id)
            .single()

        let customerId = dbCustomer?.stripe_customer_id;

        // If customer ID doesn't exist, create a new one
        if (!customerId) {
            // Fetch user profile data
            const { data: profile, error: profileError } = await supabaseServiceRole
                .from("profiles")
                .select(`full_name, website, company_name`)
                .eq("id", user.id)
                .single()

            if (profileError) {
                return json({
                    error: `Error fetching profile: ${profileError.message}`,
                    isActiveCustomer: false,
                    currentPlanId: null,
                }, { status: 500 })
            }

            // Create Stripe customer
            try {
                const customer = await stripe.customers.create({
                    email: user.email,
                    name: profile.full_name ?? "",
                    metadata: {
                        user_id: user.id,
                        company_name: profile.company_name ?? "",
                        website: profile.website ?? "",
                    },
                })

                customerId = customer.id

                // Store customer ID in database
                const { error: insertError } = await supabaseServiceRole
                    .from("stripe_customers")
                    .insert({
                        user_id: user.id,
                        stripe_customer_id: customer.id,
                        updated_at: new Date(),
                    })

                if (insertError) {
                    return json({
                        error: `Error saving customer ID: ${insertError.message}`,
                        isActiveCustomer: false,
                        currentPlanId: null,
                    }, { status: 500 })
                }
            } catch (stripeError) {
                return json({
                    error: `Error creating Stripe customer: ${stripeError.message}`,
                    isActiveCustomer: false,
                    currentPlanId: null,
                }, { status: 500 })
            }
        }

        // Now that we have a customer ID, fetch subscription information
        try {
            const stripeSubscriptions = await stripe.subscriptions.list({
                customer: customerId,
                limit: 100,
                status: "all",
            })

            // Find primary subscription
            const primaryStripeSubscription = stripeSubscriptions.data.find((x) => {
                return (
                    x.status === "active" ||
                    x.status === "trialing" ||
                    x.status === "past_due"
                )
            })

            let appSubscription = null;
            if (primaryStripeSubscription) {
                const productId =
                    primaryStripeSubscription?.items?.data?.[0]?.price.product ?? ""

                appSubscription = pricingPlans.find((x) => {
                    return x.stripe_product_id === productId
                })
            }

            return json({
                isActiveCustomer: !!primaryStripeSubscription,
                hasEverHadSubscription: stripeSubscriptions.data.length > 0,
                currentPlanId: appSubscription?.id || "free",
            })
        } catch (stripeError) {
            return json({
                error: `Error fetching subscriptions: ${stripeError.message}`,
                isActiveCustomer: false,
                currentPlanId: null,
            }, { status: 500 })
        }
    } catch (err) {
        console.error("Error in customer status API:", err)
        return json({
            error: err.message || "An unexpected error occurred",
            isActiveCustomer: false,
            currentPlanId: null,
        }, { status: 500 })
    }
}