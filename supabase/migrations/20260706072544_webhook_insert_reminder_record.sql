-- webhook_insert_reminder_record
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Add trigger to track when webhook sends initial reminders
-- This prevents the cron job from sending duplicate day-0 messages

-- Ensure the table exists
CREATE TABLE IF NOT EXISTS invoice_reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    stripe_subscription_id text NOT NULL,
    reminder_day int NOT NULL DEFAULT 0,
    sent_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, stripe_subscription_id, reminder_day)
);
