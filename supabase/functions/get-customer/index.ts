// /supabase/functions/get-customer/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Environment variables
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL')
const supabaseServiceRole = Deno.env.get('PRIVATE_SUPABASE_SERVICE_ROLE')

console.log("Get Customer Edge Function Initialized")

function corsHeaders(origin: string) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
}

serve(async (req) => {
    const origin = req.headers.get('origin') || '*'
    console.log("Request received from:", origin)

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

        // Get request body
        const requestData = await req.json().catch(e => ({}))
        const userId = requestData.userId

        if (!userId) {
            return new Response(JSON.stringify({ error: 'No userId provided' }), {
                status: 400,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            })
        }

        console.log("Getting customer data for user:", userId)

        // Create admin client with service role to bypass RLS
        const adminClient = createClient(supabaseUrl!, supabaseServiceRole!)

        // Get customer using admin privileges
        const { data: customers, error: queryError } = await adminClient
            .from("stripe_customers")
            .select("*")
            .eq("user_id", userId)

        console.log(`Query result: ${customers?.length || 0} records found, error: ${queryError ? 'yes' : 'no'}`)

        if (queryError) {
            console.error("Error querying customer:", queryError)
            return new Response(JSON.stringify({
                error: `Database error: ${queryError.message}`
            }), {
                status: 500,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            })
        }

        if (!customers || customers.length === 0) {
            console.log("No customer found for user")
            return new Response(JSON.stringify({
                customer: null,
                message: "No customer found"
            }), {
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            })
        }

        // Return the first customer if multiple exist
        const customer = customers[0]
        console.log("Customer found:", customer.stripe_customer_id)

        return new Response(JSON.stringify({
            customer: {
                id: customer.id,
                user_id: customer.user_id,
                stripe_customer_id: customer.stripe_customer_id,
                updated_at: customer.updated_at
            },
            message: "Customer found"
        }), {
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
    } catch (error) {
        console.error("Unexpected error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
    }
})