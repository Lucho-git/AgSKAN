-- fix_cron_invoice_lookup_by_customer
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Fix the cron to look up invoices by customer_id as well as subscription_id
-- This handles cases where subscription_id is null in stripe_invoices

-- First, let's find who 17b52843 is and their stripe customer
SELECT us.user_id, us.stripe_subscription_id, us.subscription_status, sc.stripe_customer_id
FROM user_subscriptions us
LEFT JOIN stripe_customers sc ON sc.user_id = us.user_id
WHERE us.subscription_status IN ('past_due', 'unpaid');
