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
        stripe_product_id: "prod_U9qgyqB2m0KN8p"
    }
];

function corsHeaders(origin: string) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function getAmountCents(value: unknown) {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function getPriceAmountCents(price: any) {
    if (!price || typeof price === 'string') return null

    return getAmountCents(price.unit_amount) ??
        getAmountCents(price.amount) ??
        getAmountCents(price.unit_amount_decimal) ??
        getAmountCents(price.amount_decimal) ??
        getAmountCents(price.tiers?.[0]?.unit_amount) ??
        getAmountCents(price.tiers?.[0]?.unit_amount_decimal) ??
        getAmountCents(price.tiers?.[0]?.flat_amount)
}

function getDiscountInfo(subscription: any) {
    const discount = subscription?.discount ?? subscription?.discounts?.[0] ?? null
    const coupon = discount?.coupon ?? null

    return {
        hasDiscount: !!coupon,
        couponId: coupon?.id ?? null,
        couponName: coupon?.name ?? null,
        percentOff: typeof coupon?.percent_off === 'number' ? coupon.percent_off : null,
        amountOff: typeof coupon?.amount_off === 'number' ? coupon.amount_off : null,
        duration: coupon?.duration ?? null,
    }
}

async function getBillingPricing(subscription: any, includeDebug = false) {
    const item = subscription?.items?.data?.[0]
    const priceId = typeof item?.price === 'string' ? item.price : item?.price?.id
    let price = item?.price

    if (priceId) {
        try {
            price = await stripe.prices.retrieve(priceId, {
                expand: ['tiers'],
            })
        } catch (error) {
            console.error('[subscription] Failed to retrieve Stripe price for billing estimate', {
                priceId,
                error: getErrorMessage(error),
            })
        }
    }

    const grossUnitAmountCents = getPriceAmountCents(price)
    const discountInfo = getDiscountInfo(subscription)
    const netUnitAmountCents = grossUnitAmountCents != null && discountInfo.percentOff != null
        ? Math.round(grossUnitAmountCents * (1 - discountInfo.percentOff / 100))
        : grossUnitAmountCents

    const pricing = {
        priceId: priceId ?? null,
        productId: typeof price?.product === 'string' ? price.product : price?.product?.id ?? null,
        nickname: price?.nickname ?? null,
        billingScheme: price?.billing_scheme ?? null,
        tiersMode: price?.tiers_mode ?? null,
        recurringInterval: price?.recurring?.interval ?? item?.plan?.interval ?? null,
        currency: price?.currency ?? subscription?.currency ?? null,
        quantity: item?.quantity ?? subscription?.quantity ?? null,
        grossUnitAmountCents,
        netUnitAmountCents,
        discount: discountInfo,
        estimateUnavailableReason: grossUnitAmountCents == null
            ? 'Stripe price did not include a unit amount or retrievable first tier amount'
            : grossUnitAmountCents <= 0
                ? 'Stripe price amount was zero or negative'
                : null,
        debug: includeDebug ? {
            itemPriceType: typeof item?.price,
            itemQuantity: item?.quantity ?? null,
            priceUnitAmount: price?.unit_amount ?? null,
            priceUnitAmountDecimal: price?.unit_amount_decimal ?? null,
            priceTiers: price?.tiers ?? null,
            priceTransformQuantity: price?.transform_quantity ?? null,
            subscriptionDiscount: subscription?.discount ?? null,
            subscriptionDiscounts: subscription?.discounts ?? null,
        } : null,
    }

    console.log('[subscription] Billing pricing source', pricing)

    return pricing
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
        let debugPricing = false;

        if (req.method === 'POST') {
            try {
                const requestData = await req.json();
                customerId = requestData.customerId;
                debugPricing = requestData.debugPricing === true;
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
                expand: ['data.items.data.price', 'data.discount.coupon'],
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

            const billingPricing = activeSubscription
                ? await getBillingPricing(activeSubscription, debugPricing)
                : null

            const result = {
                primarySubscription: activeSubscription ? {
                    stripeSubscription: activeSubscription,
                    appSubscription: { id: currentPlanId },
                    billingPricing,
                } : null,
                hasEverHadSubscription: subscriptions.data.length > 0,
                currentPlanId: currentPlanId
            };

            return new Response(JSON.stringify(result), {
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            });
        } catch (stripeError) {
            return new Response(JSON.stringify({
                error: `Stripe API error: ${getErrorMessage(stripeError)}`
            }), {
                status: 500,
                headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({ error: `Unexpected error: ${getErrorMessage(error)}` }), {
            status: 500,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        });
    }
});