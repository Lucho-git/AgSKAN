-- reset_all_reminders
-- One-off data fix for specific customers' invoice reminders / short URLs.
-- It made no schema change. The original statements are left out of the repo
-- because they contain customer data (Stripe invoice links, customer ids); they
-- remain in supabase_migrations.schema_migrations on the project.
select 1;
