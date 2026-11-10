-- Per-user ADMIN flag (2026-09-25).
--
-- Gates admin-only maintenance actions — currently the Records page
-- "Backfill", "Fix Paths" and "Regen All" buttons (previously shown to any
-- account with Developer mode enabled, incl. tester and farm-tablet
-- accounts).
--
-- This is deliberately SEPARATE from dev_tools_enabled (Developer mode:
-- Admin dashboard + dev toolbox buttons + the agskan password toggle):
-- an admin doesn't have to run dev mode to use records maintenance, and a
-- dev-mode account isn't automatically an admin.
--
-- Toggle per user from the Admin dashboard -> user settings -> General ->
-- "Admin (records tools)". Backfill below grants it to the AgSKAN accounts
-- that had access before.

alter table public.user_settings
  add column if not exists is_admin boolean not null default false;

-- Grant the flag to the AgSKAN owner / support accounts (run separately):
-- update public.user_settings us
-- set is_admin = true
-- from profiles p
-- where p.id = us.user_id
--   and p.email in (
--     'lachlan.f.ross@gmail.com',
--     'luchodore@proton.me',
--     'luchodore@gmail.com',
--     'ryan@skanfarming.com'
--   );
