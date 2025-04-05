// /supabase/functions/subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "https://esm.sh/stripe@12.0.0?dts"

// Environment variables
const stripeApiKey = Deno.env.get('PRIVATE_STRIPE_API_KEY')
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL')
const supabaseAnonKey = Deno.env.get('PUBLIC_SUPABASE_ANON_KEY')
const supabaseServiceRole = Deno.env.get('PRIVATE_SUPABASE_SERVICE_ROLE')

// Initialize Stripe
const stripe = new Stripe(stripeApiKey!, {
    apiVersion: '2023-10-16',
})

// Define pricing plans - Only the minimal info needed
const pricingPlans = [
    {
        id: "free",
        stripe_product_id: null
    },
    {
        id: "pro",
        stripe_product_id: "prod_QUxgzq6c3meKyZ"
    }
];

function corsHeaders(origin: string) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
}

serve(async (req) => {
    const origin = req.headers.get('origin') || '*'

    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(origin) })
    }

    try {
        // Auth validation
        const authHeader = req.headers.get('Authorization')

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'Unauthorized - invalid auth header' }), {
                status: 401,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            })
        }

        const token = authHeader.split(' ')[1]

        // Get user from token
        const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        })

        const { data: userData, error: userError } = await supabase.auth.getUser()

        if (userError || !userData.user) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            })
        }

        // Get customer ID from request or fetch it
        let customerId = null;

        if (req.method === 'POST') {
            try {
                const requestData = await req.json();
                customerId = requestData.customerId;
            } catch (e) {
                // No valid JSON body
            }
        }

        // If no customer ID provided, get it from the database
        if (!customerId) {
            const adminClient = createClient(supabaseUrl!, supabaseServiceRole!)

            const { data: customers, error: queryError } = await adminClient
                .from("stripe_customers")
                .select("stripe_customer_id")
                .eq("user_id", userData.user.id);

            if (queryError) {
                return new Response(JSON.stringify({
                    error: `Database error: ${queryError.message}`
                }), {
                    status: 500,
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
                });
            }

            if (!customers || customers.length === 0) {
                return new Response(JSON.stringify({
                    primarySubscription: null,
                    hasEverHadSubscription: false,
                    currentPlanId: "free"
                }), {
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
                });
            }

            customerId = customers[0].stripe_customer_id;
        }

        if (!customerId) {
            return new Response(JSON.stringify({
                primarySubscription: null,
                hasEverHadSubscription: false,
                currentPlanId: "free"
            }), {
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            });
        }

        // Get subscriptions from Stripe
        try {
            const subscriptions = await stripe.subscriptions.list({
                customer: customerId,
                status: 'all',
            });

            // Find active subscription
            const activeSubscription = subscriptions.data.find(sub =>
                ['active', 'trialing', 'past_due'].includes(sub.status));

            let currentPlanId = "free";

            if (activeSubscription) {
                const productId = activeSubscription.items.data[0]?.price.product;

                // Find matching plan by product ID
                const matchingPlan = pricingPlans.find(plan => plan.stripe_product_id === productId);

                if (matchingPlan) {
                    currentPlanId = matchingPlan.id;
                }
            }

            const result = {
                primarySubscription: activeSubscription ? {
                    stripeSubscription: activeSubscription,
                    appSubscription: { id: currentPlanId }
                } : null,
                hasEverHadSubscription: subscriptions.data.length > 0,
                currentPlanId: currentPlanId
            };

            return new Response(JSON.stringify(result), {
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            });
        } catch (stripeError) {
            return new Response(JSON.stringify({
                error: `Stripe API error: ${stripeError.message}`
            }), {
                status: 500,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({ error: `Unexpected error: ${error.message}` }), {
            status: 500,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        });
    }
});