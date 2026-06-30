-- =============================================================================
-- Fix Jack Sutherland's Stripe subscription linkage
-- Profile: 2dc06b40-89ae-4c99-8684-78652f868ac1
-- Stripe customer: cus_RseMBKKhoeb3Bq
-- Issue: stripe_customers is linked but user_subscriptions has manual data,
--         stripe_subscription_id is null
-- =============================================================================

-- Option A: Force sync via the subscription edge function (preferred)
-- This will look up his Stripe customer, find the active subscription,
-- and update user_subscriptions automatically.
--
-- Run this curl from terminal (replace with your project ref and service_role key):
--
-- curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/subscription" \
--   -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
--   -H "Content-Type: application/json" \
--   -d '{"userId": "2dc06b40-89ae-4c99-8684-78652f868ac1"}'

-- =============================================================================
-- Option B: If Option A doesn't work, find his Stripe subscription manually.
-- Use the Stripe CLI or dashboard:
--   stripe subscriptions list --customer cus_RseMBKKhoeb3Bq --limit 5 --status active
--
-- Then update manually:
-- UPDATE user_subscriptions
-- SET
--   stripe_subscription_id = '<sub_xxxx>',
--   subscription = 'Pro',
--   subscription_status = 'active',
--   current_seats = <quantity>,
--   next_billing_date = '<from_stripe>',
--   payment_interval = '<month|year>'
-- WHERE user_id = '2dc06b40-89ae-4c99-8684-78652f868ac1';

-- =============================================================================
-- Verify after sync
SELECT
  p.email,
  p.full_name,
  sc.stripe_customer_id,
  us.subscription,
  us.subscription_status,
  us.stripe_subscription_id,
  us.current_seats,
  us.next_billing_date,
  us.payment_interval
FROM profiles p
LEFT JOIN stripe_customers sc ON sc.user_id = p.id
LEFT JOIN user_subscriptions us ON us.user_id = p.id
WHERE p.id = '2dc06b40-89ae-4c99-8684-78652f868ac1';
