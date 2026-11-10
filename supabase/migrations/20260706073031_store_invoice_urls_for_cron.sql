-- store_invoice_urls_for_cron
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Table to store Stripe invoice data so cron can send proper links
CREATE TABLE IF NOT EXISTS stripe_invoices (
    id text PRIMARY KEY,
    customer_id text NOT NULL,
    subscription_id text,
    hosted_invoice_url text,
    amount_due int,
    status text,
    due_date timestamptz,
    created timestamptz NOT NULL DEFAULT now()
);
