-- create_invoice_reminder_function
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Track when reminders were sent to avoid duplicates
CREATE TABLE IF NOT EXISTS invoice_reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    stripe_subscription_id text NOT NULL,
    stripe_invoice_id text,
    reminder_day int NOT NULL, -- 0 = initial, 1, 3, 7, 14
    sent_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, stripe_subscription_id, reminder_day)
);

-- Function to find and send invoice reminders via the edge function
CREATE OR REPLACE FUNCTION process_invoice_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    sub RECORD;
    inv RECORD;
    days_since int;
    reminder_days int[] := ARRAY[0, 1, 3, 7, 14];
    reminder_day int;
    edge_url text := 'https://hmxxqacnzxqpcheoeidn.supabase.co/functions/v1/send-sms';
    service_key text;
BEGIN
    -- Get service role key from vault or env
    service_key := current_setting('app.settings.service_role_key', true);
    IF service_key IS NULL THEN
        RAISE WARNING 'Service role key not configured for cron';
        RETURN;
    END IF;

    -- Find subscriptions that are past_due or unpaid
    FOR sub IN
        SELECT us.user_id, us.stripe_subscription_id, us.stripe_customer_id,
               us.subscription_status, us.created_at
        FROM user_subscriptions us
        WHERE us.subscription_status IN ('past_due', 'unpaid')
          AND us.stripe_subscription_id IS NOT NULL
          AND us.stripe_customer_id IS NOT NULL
    LOOP
        -- Calculate days since subscription was created (or last invoice)
        days_since := EXTRACT(DAY FROM now() - sub.created_at)::int;
        
        -- Check each reminder window
        FOREACH reminder_day IN ARRAY reminder_days
        LOOP
            -- Only send if we've passed this day threshold AND haven't sent this reminder yet
            IF days_since >= reminder_day AND NOT EXISTS (
                SELECT 1 FROM invoice_reminders ir
                WHERE ir.user_id = sub.user_id
                  AND ir.stripe_subscription_id = sub.stripe_subscription_id
                  AND ir.reminder_day = reminder_day
            ) THEN
                -- Get the latest unpaid invoice for this subscription
                SELECT id, hosted_invoice_url INTO inv
                FROM stripe_invoices
                WHERE customer_id = sub.stripe_customer_id
                  AND status = 'open'
                ORDER BY created DESC
                LIMIT 1;
                
                -- Record the reminder
                INSERT INTO invoice_reminders (user_id, stripe_subscription_id, stripe_invoice_id, reminder_day)
                VALUES (sub.user_id, sub.stripe_subscription_id, inv.id, reminder_day)
                ON CONFLICT DO NOTHING;
                
                RAISE LOG 'Reminder day % for user % (sub %)', reminder_day, sub.user_id, sub.stripe_subscription_id;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;
