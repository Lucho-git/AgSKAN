-- Invoice reminder tracking
--
-- Both tables were originally created ad-hoc, so this migration is written to be
-- safe on the existing database (create ... if not exists / drop ... if exists).

create table if not exists public.stripe_invoices (
    id text primary key,
    customer_id text not null,
    subscription_id text,
    hosted_invoice_url text,
    amount_due int,
    status text,
    due_date timestamptz,
    created timestamptz not null default now()
);

create table if not exists public.invoice_reminders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    stripe_subscription_id text,
    stripe_invoice_id text,
    reminder_day int not null default 0,
    sent_at timestamptz not null default now()
);

-- Reminders used to be unique per (user, subscription, day), which meant a subscription
-- only ever received one reminder per day offset for its lifetime: every invoice after
-- the first was silently suppressed. Track reminders per invoice instead.
alter table public.invoice_reminders
    drop constraint if exists invoice_reminders_user_id_stripe_subscription_id_reminder_d_key;

-- Invoices raised manually in Stripe have no subscription.
alter table public.invoice_reminders
    alter column stripe_subscription_id drop not null;

create unique index if not exists invoice_reminders_invoice_day_key
    on public.invoice_reminders (stripe_invoice_id, reminder_day);

-- The reminder cron scans open invoices by status/due date.
create index if not exists stripe_invoices_status_due_date_idx
    on public.stripe_invoices (status, due_date);
