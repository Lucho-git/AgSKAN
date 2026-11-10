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
        now(),
        now(),
        now()
    )
    on conflict (id) do nothing;

    insert into public.user_settings (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 2. FREE plan for managers
-- ---------------------------------------------------------------------------
create or replace function public.ensure_manager_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
    insert into public.user_subscriptions
        (user_id, subscription, marker_limit, trail_limit, current_seats,
         created_at, updated_at)
    values (new.id, 'FREE', 100, 100000, 1, now(), now())
    on conflict (user_id) do nothing;

    return new;
end
$fn$;

drop trigger if exists on_profile_inserted_manager on public.profiles;
create trigger on_profile_inserted_manager
    after insert on public.profiles
    for each row
    when (new.role = 'manager')
    execute function public.ensure_manager_subscription();

drop trigger if exists on_profile_became_manager on public.profiles;
create trigger on_profile_became_manager
    after update of role on public.profiles
    for each row
    when (new.role = 'manager' and old.role is distinct from 'manager')
    execute function public.ensure_manager_subscription();

-- ---------------------------------------------------------------------------
-- 3. Backfill
-- ---------------------------------------------------------------------------
-- Auth users that never got a profile row.
insert into public.profiles
    (id, email, full_name, avatar_url, onboarded, created_at, updated_at, last_sign_in)
select
    u.id,
    u.email,
    coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        case when u.is_anonymous then 'Visitor' end
    ),
    coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'picture'), '')
    ),
    false,
    coalesce(u.created_at, now()),
    coalesce(u.updated_at, now()),
    coalesce(u.last_sign_in_at, u.created_at, now())
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Profiles with no settings row.
insert into public.user_settings (user_id)
select p.id
from public.profiles p
where not exists (select 1 from public.user_settings s where s.user_id = p.id)
on conflict (user_id) do nothing;

-- Managers with no plan row. Non-managers are left alone on purpose.
insert into public.user_subscriptions
    (user_id, subscription, marker_limit, trail_limit, current_seats,
     created_at, updated_at)
select p.id, 'FREE', 100, 100000, 1, now(), now()
from public.profiles p
where p.role = 'manager'
  and not exists (
      select 1 from public.user_subscriptions s where s.user_id = p.id
  )
on conflict (user_id) do nothing;
