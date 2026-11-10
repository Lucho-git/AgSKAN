-- schedule_invoice_reminder_cron
-- Scheduled the 'invoice-reminders-daily' pg_cron job (08:00 UTC) that POSTs to
-- the cron-invoice-reminders Edge Function. The original statement embedded the
-- function's shared bearer token, so the cron.schedule call is not reproduced
-- here. On a fresh project, schedule the job by hand with the token from secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net;
