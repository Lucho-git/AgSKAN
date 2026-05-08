// /supabase/functions/create-portal/index.ts
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

function corsHeaders(origin: string) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
}

function withTimeout<T>(promise: Promise<T>, message: string, ms = 15000): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms)
        }),
    ])
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
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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

        const requestData = await req.json().catch(() => ({}));
        console.log('create-portal request', {
            userId: userData.user.id,
            flow: requestData.flow || 'portal_home',
            seatQuantity: requestData.seatQuantity || null,
        })

        const adminClient = createClient(supabaseUrl!, supabaseServiceRole!)
        const { data: customers, error: customerError } = await adminClient
            .from("stripe_customers")
            .select("stripe_customer_id")
            .eq("user_id", userData.user.id)

        if (customerError) {
            return new Response(JSON.stringify({ error: `Database error: ${customerError.message}` }), {
                status: 500,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            })
        }

        if (!customers || customers.length === 0) {
            return new Response(JSON.stringify({ error: 'No subscription found to manage' }), {
                status: 404,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            })
        }

        const customerId = customers[0].stripe_customer_id

        const returnUrl = requestData.returnUrl ||
            `${origin}/account/billing`;

        const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
            customer: customerId,
            return_url: returnUrl,
        }

        if (requestData.flow === 'seat_update_confirm') {
            const seatQuantity = Number(requestData.seatQuantity)

            if (!Number.isInteger(seatQuantity) || seatQuantity < 1 || seatQuantity > 50) {
                return new Response(JSON.stringify({ error: 'Seat quantity must be between 1 and 50' }), {
                    status: 400,
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
                })
            }

            console.log('create-portal seat update: fetching subscriptions')
            const subscriptions = await withTimeout(
                stripe.subscriptions.list({
                    customer: customerId,
                    status: 'all',
                    limit: 10,
                    expand: ['data.items.data.price'],
                }),
                'Timed out fetching Stripe subscriptions'
            )

            const activeSubscription = subscriptions.data.find((subscription) =>
                ['active', 'trialing', 'past_due'].includes(subscription.status)
            )

            if (!activeSubscription) {
                return new Response(JSON.stringify({ error: 'No active subscription found to update' }), {
                    status: 404,
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
                })
            }

            if (activeSubscription.items.data.length !== 1) {
                return new Response(JSON.stringify({ error: 'Seat updates are only supported for single-item subscriptions' }), {
                    status: 400,
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
                })
            }

            const subscriptionItem = activeSubscription.items.data[0]
            const currentQuantity = subscriptionItem.quantity || 1
            console.log('create-portal seat update: active subscription found', {
                subscriptionId: activeSubscription.id,
                subscriptionItemId: subscriptionItem.id,
                currentQuantity,
                requestedQuantity: seatQuantity,
            })

            if (seatQuantity === currentQuantity) {
                return new Response(JSON.stringify({ error: 'Seat quantity is unchanged' }), {
                    status: 400,
                    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
                })
            }

            sessionParams.flow_data = {
                type: 'subscription_update_confirm',
                subscription_update_confirm: {
                    subscription: activeSubscription.id,
                    items: [
                        {
                            id: subscriptionItem.id,
                            quantity: seatQuantity,
                        },
                    ],
                },
                after_completion: {
                    type: 'redirect',
                    redirect: {
                        return_url: returnUrl,
                    },
                },
            }
        }

        console.log('create-portal: creating billing portal session', {
            flow: sessionParams.flow_data?.type || 'portal_home',
        })
        const session = await withTimeout(
            stripe.billingPortal.sessions.create(sessionParams),
            'Timed out creating Stripe billing portal session'
        );

        return new Response(JSON.stringify({ url: session.url }), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error("Error creating portal session:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        });
    }
});