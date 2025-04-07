// src/routes/api/_helpers/stripeHelpers.js
import { PRIVATE_STRIPE_API_KEY } from "$env/static/private"
import Stripe from "stripe"
import { pricingPlans } from "../../(marketing)/pricing/pricing_plans"

const stripe = new Stripe(PRIVATE_STRIPE_API_KEY, { apiVersion: "2023-08-16" })

/**
 * Gets or creates a Stripe customer ID (server-side only)
 */
export const getOrCreateStripeCustomerId = async ({
  supabase,
  userId,
  email,
  profileData = {}
}) => {
  console.log("Attempting to retrieve customer ID for user:", userId)

  // Check if customer ID already exists
  const { data: dbCustomer, error } = await supabase
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .single()

  if (error && error.code !== "PGRST116") {
    console.error("Error retrieving customer ID:", error)
    return { error: error, customerId: null }
  }

  if (dbCustomer?.stripe_customer_id) {
    console.log("Existing customer ID found:", dbCustomer.stripe_customer_id)
    return { error: null, customerId: dbCustomer.stripe_customer_id }
  }

  console.log("No existing customer ID found. Creating new customer.")

  try {
    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: email,
      name: profileData.full_name ?? "",
      metadata: {
        user_id: userId,
        company_name: profileData.company_name ?? "",
        website: profileData.website ?? "",
      },
    })
    console.log("New Stripe customer created:", customer.id)

    if (!customer.id) {
      console.error("Unknown stripe user creation error")
      return { error: "Unknown stripe user creation error", customerId: null }
    }

    // Store the new customer ID in the database
    const { error: stripeCustomerError } = await supabase
      .from("stripe_customers")
      .insert({
        user_id: userId,
        stripe_customer_id: customer.id,
        updated_at: new Date().toISOString(),
      })

    if (stripeCustomerError) {
      console.error("Error inserting new customer ID:", stripeCustomerError)
      return { error: stripeCustomerError, customerId: null }
    }

    console.log("Successfully created and stored new customer ID:", customer.id)
    return { error: null, customerId: customer.id }
  } catch (e) {
    console.error("Error creating Stripe customer:", e)
    return { error: e, customerId: null }
  }
}

/**
 * Fetches subscription information from Stripe (server-side only)
 */
export const fetchStripeSubscription = async ({
  customerId,
}) => {
  // Fetch user's subscriptions from Stripe
  try {
    const stripeSubscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 100,
      status: 'all',
    })

    // Find "primary" subscription
    const primaryStripeSubscription = stripeSubscriptions.data.find((x) => {
      return (
        x.status === "active" ||
        x.status === "trialing" ||
        x.status === "past_due"
      )
    })

    let appSubscription = null
    if (primaryStripeSubscription) {
      const productId =
        primaryStripeSubscription?.items?.data?.[0]?.price.product ?? ""
      appSubscription = pricingPlans.find((x) => {
        return x.stripe_product_id === productId
      })

      if (!appSubscription) {
        return {
          error: "No matching app subscription found",
          primarySubscription: null,
          hasEverHadSubscription: stripeSubscriptions.data.length > 0,
        }
      }
    }

    const primarySubscription =
      primaryStripeSubscription && appSubscription
        ? {
            stripeSubscription: primaryStripeSubscription,
            appSubscription: appSubscription,
          }
        : null

    return {
      primarySubscription,
      hasEverHadSubscription: stripeSubscriptions.data.length > 0,
    }
  } catch (e) {
    console.error("Error fetching subscription:", e)
    return {
      error: e,
      primarySubscription: null,
      hasEverHadSubscription: false,
    }
  }
}

/**
 * Creates a stripe checkout session (server-side only)
 */
export const createStripeCheckoutSession = async ({
  customerId,
  priceId,
  seats = 1,
  discount = false,
  discountcode = null,
  origin = "https://example.com"
}) => {
  try {
    // Check if this is a one-time payment
    const isOneTimePayment = priceId === "price_1Oy7FOK3At0l0k1HrMFJ1gcc";
    
    // Create checkout session params
    const sessionParams = {
      line_items: [
        {
          price: priceId,
          quantity: seats,
        },
      ],
      customer: customerId,
      mode: isOneTimePayment ? "payment" : "subscription",
      success_url: `${origin}/account`,
      cancel_url: `${origin}/account/`,
      consent_collection: {
        terms_of_service: "required",
      },
    };
    
    // Add discount if applicable
    if (discount) {
      sessionParams.discounts = [
        {
          coupon: "9VKe40q5",
        },
      ];
    }
    
    // Add test discount if applicable
    if (discountcode === "test") {
      sessionParams.discounts = [
        {
          coupon: "test_discount",
        },
      ];
    }
    
    // Create checkout session
    const stripeSession = await stripe.checkout.sessions.create(sessionParams);
    
    if (!stripeSession?.url) {
      return { error: "Failed to create checkout session", stripeUrl: null };
    }
    
    return { error: null, stripeUrl: stripeSession.url };
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return { 
      error: error.message || "An unexpected error occurred",
      stripeUrl: null
    };
  }
}