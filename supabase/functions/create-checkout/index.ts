// /supabase/functions/create-checkout/index.ts
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

/**
 * Gets or creates a Stripe customer for the user
 */
async function getOrCreateCustomer(userId: string, email: string, profileData: any = {}) {
    // Create admin client with service role
    const adminClient = createClient(supabaseUrl!, supabaseServiceRole!)

    // Check if customer already exists
    const { data: customers, error: queryError } = await adminClient
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("user_id", userId)

    if (queryError) {
        throw new Error(`Database error: ${queryError.message}`)
    }

    // If customer exists, return the ID
    if (customers && customers.length > 0) {
        return customers[0].stripe_customer_id
    }

    // Create a new customer in Stripe
    const customerData: Stripe.CustomerCreateParams = {
        email,
        metadata: {
            user_id: userId
        }
    }

    // Add additional customer data if available
    if (profileData.full_name) customerData.name = profileData.full_name
    if (profileData.company_name) customerData.metadata!.company = profileData.company_name
    if (profileData.website) {
        // Remove http(s) for Stripe requirements
        const website = profileData.website.replace(/^https?:\/\//, '')
        customerData.metadata!.website = website
    }

    // Create the customer in Stripe
    const customer = await stripe.customers.create(customerData)

    // Store the customer ID in our database
    const { error: insertError } = await adminClient
        .from("stripe_customers")
        .insert({
            user_id: userId,
            stripe_customer_id: customer.id
        })

    if (insertError) {
        throw new Error(`Failed to store customer: ${insertError.message}`)
    }

    return customer.id
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

        const user = userData.user

        // Get request body
        const requestData = await req.json().catch(() => ({}))
        const priceId = requestData.priceId
        const seats = parseInt(requestData.seats || '1')
        const discount = requestData.discount === true
        const discountcode = requestData.discountcode

        // Validate required params
        if (!priceId) {
            return new Response(JSON.stringify({ error: 'Price ID is required' }), {
                status: 400,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            })
        }

        // Get the user's profile data
        const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, company_name, website")
            .eq("id", user.id)
            .single()

        // Get or create Stripe customer (handles both cases automatically)
        const customerId = await getOrCreateCustomer(user.id, user.email, profile)

        // Default success and cancel URLs
        const successUrl = `${origin}/account/billing?checkout_success=true`
        const cancelUrl = `${origin}/account/billing?checkout_cancelled=true`

        // Set up checkout session parameters
        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: seats
                }
            ],
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl,
            allow_promotion_codes: true
        }

        // Apply discount code if provided
        if (discount && discountcode === 'test') {
            // Example: Apply a specific coupon
            sessionParams.discounts = [{ coupon: 'test_coupon' }]
        } else if (discount) {
            // Example: Apply a default discount
            sessionParams.discounts = [{ coupon: 'default_discount' }]
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create(sessionParams)

        return new Response(JSON.stringify({ stripeUrl: session.url }), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
    } catch (error) {
        console.error("Error creating checkout session:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
    }
})