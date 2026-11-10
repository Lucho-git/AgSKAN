-- Provision accounts at signup instead of leaving it to the browser.
--
-- `handle_new_user()` already existed (the Supabase starter version): it only
-- inserted (id, full_name, avatar_url) into profiles. Because it runs first,
-- the app's createOrUpdateProfile() always saw an *existing* profile and never
-- took its "insert" branch — the branch that also created the free
-- subscription. That is why 61 of 1265 profiles had no user_subscriptions row
-- and 26 no user_settings row, and why a brand-new account's first dashboard
-- load could report "your plan and your settings didn't arrive" (the app read
-- those rows with `.single()`, which PostgREST answers with PGRST116 "0 rows").
--
-- What this migration does:
--   1. handle_new_user(): create the profile (now with email, onboarded state
--      and timestamps) plus a default user_settings row for every new auth
--      user. Idempotent, so it can never break a signup.
--   2. ensure_manager_subscription(): give an account its FREE plan row the
--      moment it becomes a MANAGER — the role is chosen after signup on
--      /account/select_role, so this cannot live on the auth trigger.
--      Operators and viewers join a manager's plan through an invite link and
--      deliberately don't get a plan of their own.
--   3. Backfill the accounts that are already missing these rows.

-- ---------------------------------------------------------------------------
-- 1. Profile + settings for every new auth user
-- ---------------------------------------------------------------------------
--
-- Applied as seven recorded steps: this file plus the
-- add_manager_subscription_trigger and backfill_missing_account_rows files
-- that follow it.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
    insert into public.profiles
        (id, email, full_name, avatar_url, onboarded,
         created_at, updated_at, last_sign_in)
    values (
        new.id,
        new.email,
        coalesce(
            nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
            nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
            case when new.is_anonymous then 'Visitor' end
        ),
        coalesce(
            nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
            nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
        ),
        false,
        now(), now(), now()
    )
    on conflict (id) do nothing;

    insert into public.user_settings (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end
$fn$;
