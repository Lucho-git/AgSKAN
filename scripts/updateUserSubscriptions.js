import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.PRIVATE_SUPABASE_SERVICE_ROLE)
const stripe = new Stripe(process.env.PRIVATE_STRIPE_API_KEY, { apiVersion: '2023-08-16' })

// Plan limits
const PRO_MARKER_LIMIT = 999999
const PRO_TRAIL_LIMIT = 999999
const FREE_MARKER_LIMIT = 100
const FREE_TRAIL_LIMIT = 100000

async function updateUserSubscriptions() {
  console.log('=== Syncing Stripe subscriptions to user_subscriptions ===\n')

  const { data: stripeCustomers, error } = await supabase
    .from('stripe_customers')
    .select('user_id, stripe_customer_id')

  if (error) {
    console.error('Error fetching stripe customers:', error)
    return
  }

  console.log(`Found ${stripeCustomers.length} stripe customers\n`)

  let updated = 0
  let downgraded = 0
  let errors = 0

  for (const customer of stripeCustomers) {
    try {
      // Get ALL subscriptions (not just active — includes trialing, past_due, etc.)
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.stripe_customer_id,
        limit: 10,
      })

      // Find the most relevant subscription (prefer active/trialing over cancelled)
      const ranked = subscriptions.data.sort((a, b) => {
        const priority = { active: 0, trialing: 1, past_due: 2, unpaid: 3, canceled: 4, incomplete: 5, incomplete_expired: 6 }
        return (priority[a.status] ?? 99) - (priority[b.status] ?? 99)
      })

      const subscription = ranked[0]

      if (subscription && ['active', 'trialing', 'past_due'].includes(subscription.status)) {
        const item = subscription.items.data[0]
        const interval = item?.price.recurring?.interval || 'year'
        const seats = item?.quantity || 1
        const isActive = ['trialing', 'active'].includes(subscription.status)

        const updateData = {
          subscription: isActive
            ? (item?.price.nickname || 'AgSKAN Pro Annual (Standard)')
            : 'FREE',
          subscription_status: subscription.status,
          stripe_subscription_id: subscription.id,
          current_seats: isActive ? seats : 0,
          marker_limit: isActive ? PRO_MARKER_LIMIT : FREE_MARKER_LIMIT,
          trail_limit: isActive ? PRO_TRAIL_LIMIT : FREE_TRAIL_LIMIT,
          payment_interval: interval,
          next_billing_date: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }

        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update(updateData)
          .eq('user_id', customer.user_id)

        if (updateError) {
          console.error(`  ✗ Error updating user ${customer.user_id}:`, updateError.message)
          errors++
        } else {
          console.log(`  ✓ ${customer.user_id} → ${updateData.subscription} (${subscription.status}, ${seats} seats)`)
          updated++
        }
      } else {
        // No active subscription — ensure they're on free plan
        const { error: downgradeError } = await supabase
          .from('user_subscriptions')
          .update({
            subscription: 'FREE',
            subscription_status: 'free',
            stripe_subscription_id: subscription?.id || null,
            current_seats: 1,
            marker_limit: FREE_MARKER_LIMIT,
            trail_limit: FREE_TRAIL_LIMIT,
            payment_interval: null,
            next_billing_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', customer.user_id)

        if (downgradeError) {
          console.error(`  ✗ Error downgrading user ${customer.user_id}:`, downgradeError.message)
          errors++
        } else {
          console.log(`  ↓ ${customer.user_id} → FREE (no active subscription)`)
          downgraded++
        }
      }
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        console.error(`  ✗ Stripe error for ${customer.stripe_customer_id}: ${error.message}`)
        if (error.type === 'StripeInvalidRequestError' && error.raw?.code === 'resource_missing') {
          console.log(`    → Customer not found in Stripe. Consider removing from database.`)
        }
      } else {
        console.error(`  ✗ Unexpected error for ${customer.stripe_customer_id}:`, error)
      }
      errors++
    }
  }

  console.log(`\n=== Sync complete ===`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Downgraded to FREE: ${downgraded}`)
  console.log(`  Errors: ${errors}`)
  console.log(`  Total processed: ${stripeCustomers.length}`)
}

updateUserSubscriptions()
  .then(() => console.log('\nFinished.'))
  .catch(console.error)
