-- Guest -> operator upgrade (applied 2026-09-18).
--
-- The /guest/upgrade page's "ticked invite" path (invite created with
-- "Keep their access after signup") previously just made the guest's
-- view-only access permanent — the account stayed in guest mode (viewer)
-- forever. It now upgrades them to a full OPERATOR on the map they were
-- viewing:
--
--   * profiles.role      viewer  -> operator   (turns off guest-mode UI)
--   * profiles.map_role  viewer  -> member     (unblocks the viewer write
--                                               triggers on markers/trails,
--                                               shows as Member everywhere)
--   * access_expires_at  cleared (permanent, no guest window)
--   * retain_after_signup cleared (consumed)
--   * profiles.email synced from auth.users when available
--   * user_subscriptions + user_settings rows provisioned (what every
--     normal signup gets via updateOrCreateProfile helpers)
--   * map_log entry ('team.upgraded') so the team sees the change
--
-- Guards: self only (auth.uid()), must still be a guest (map_role viewer),
-- must be on a map, and the invite must have set retain_after_signup.
-- Non-retain guests use retire_self_from_map instead (they leave).

create or replace function public.upgrade_guest_account()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_caller public.profiles;
    v_map_id uuid;
    v_name   text;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select * into v_caller from public.profiles where id = auth.uid();
    if v_caller.id is null or v_caller.master_map_id is null then
        return;
    end if;

    -- Only REAL guest profiles on a retain-enabled invite upgrade. Anyone
    -- already on the team, or guests from plain time-limited invites, is
    -- left untouched.
    if v_caller.map_role is distinct from 'viewer' then
        return;
    end if;
    if not coalesce(v_caller.retain_after_signup, false) then
        return;
    end if;

    v_map_id := v_caller.master_map_id;
    v_name   := coalesce(nullif(v_caller.full_name, ''), 'A visitor');

    -- Guest -> full operator on the map they were viewing. Name, vehicle
    -- pointer and map link all carry over; only the role + window change.
    update public.profiles p
       set role = 'operator',
           map_role = 'member',
           access_expires_at = null,
           retain_after_signup = false,
           email = coalesce(
               (select u.email from auth.users u where u.id = p.id),
               p.email
           ),
           updated_at = now()
     where p.id = v_caller.id;

    -- Every real account gets these rows at signup; provision them here too.
    insert into public.user_subscriptions
        (user_id, subscription, marker_limit, trail_limit, current_seats,
         created_at, updated_at)
    values (auth.uid(), 'FREE', 100, 100000, 1, now(), now())
    on conflict (user_id) do nothing;

    insert into public.user_settings (user_id)
    values (auth.uid())
    on conflict (user_id) do nothing;

    -- Feed entry - best effort, never block the upgrade on logging.
    begin
        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action,
             entity_type, entity_id, summary, details)
        values (
            v_map_id,
            'app',
            v_caller.id,
            v_name,
            'team.upgraded',
            'profile',
            v_caller.id,
            'Visitor ' || v_name || ' upgraded to a full operator account',
            jsonb_strip_nulls(jsonb_build_object(
                'via', 'signup',
                'role', 'operator'
            ))
        );
    exception when others then
        null;
    end;
end
$fn$;
