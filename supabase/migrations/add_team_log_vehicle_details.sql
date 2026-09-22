-- Enrich team join / leave / removal log entries with the person's machine.
--
-- The activity feed now renders team.joined / team.removed / team.left rows
-- with the vehicle marker of the person involved plus a people +/- stamp.
-- The vehicle_state row is DELETED when someone is removed or leaves, so the
-- machine must be captured into map_log.details at event time -- hence these
-- function updates:
--
--   * finalize_guest_join - merges vehicle_type / vehicle_body_color into
--     the caller's team.joined entry (their pointer row exists by then, it
--     is created just before the visitor enters the map).
--   * revoke_guest_access - captures the target's marker before deleting.
--   * retire_self_from_map - captures the caller's marker before deleting.
--
-- Safe to re-run. Signatures unchanged.

create or replace function public.finalize_guest_join(p_display_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_name   text := nullif(trim(p_display_name), '');
    v_id     bigint;
    v_marker jsonb;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;
    if v_name is null then
        return;
    end if;

    update public.profiles
       set full_name = v_name,
           updated_at = now()
     where id = auth.uid();

    -- Their machine (their pointer row was created when they entered the map).
    select vehicle_marker into v_marker
      from public.vehicle_state
     where vehicle_id = auth.uid();

    -- Rename this caller's most recent join entry (written at redeem time).
    select id into v_id
      from public.map_log
     where actor_id = auth.uid()
       and action = 'team.joined'
     order by id desc
     limit 1;

    if v_id is not null then
        update public.map_log
           set actor_name = v_name,
               summary = case
                             when coalesce(details ->> 'role', 'viewer') = 'viewer'
                             then 'Visitor ' || v_name || ' joined the map'
                             else v_name || ' joined the map'
                         end,
               details = coalesce(details, '{}'::jsonb)
                         || jsonb_strip_nulls(jsonb_build_object(
                                'vehicle_type', v_marker ->> 'type',
                                'vehicle_body_color', v_marker ->> 'bodyColor'
                            ))
         where id = v_id;
    end if;
end
$$;

revoke all on function public.finalize_guest_join(text) from public;
grant execute on function public.finalize_guest_join(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- revoke_guest_access: capture the removed person's machine in the log
-- ---------------------------------------------------------------------------
create or replace function public.revoke_guest_access(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_caller      public.profiles;
    v_target      public.profiles;
    v_owner       uuid;
    v_target_name text;
    v_marker      jsonb;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select * into v_caller from public.profiles where id = auth.uid();
    select * into v_target from public.profiles where id = p_user_id;

    if v_target.id is null then
        raise exception 'That account no longer exists';
    end if;
    if v_target.id = v_caller.id then
        raise exception 'You cannot remove yourself';
    end if;
    if v_caller.master_map_id is null
       or v_target.master_map_id is distinct from v_caller.master_map_id then
        raise exception 'That guest is not on your map';
    end if;

    select m.master_user_id into v_owner
      from public.master_maps m
     where m.id = v_caller.master_map_id;

    -- Guests must never be able to remove anyone.
    if not (v_caller.map_role = 'member' or v_caller.id = v_owner) then
        raise exception 'Only team members can remove guest access';
    end if;

    -- This path removes guests only; team members are managed elsewhere.
    if v_target.map_role is distinct from 'viewer' then
        raise exception 'Only guests can be removed here';
    end if;

    v_target_name := coalesce(nullif(v_target.full_name, ''), 'A visitor');

    -- Capture their machine before the pointer row is removed.
    select vehicle_marker into v_marker
      from public.vehicle_state
     where vehicle_id = v_target.id;

    -- Same retirement as the expiry cron: drop their pointer + unlink the map.
    delete from public.vehicle_state where vehicle_id = v_target.id;

    update public.profiles
       set master_map_id = null,
           access_expires_at = null,
           updated_at = now()
     where id = v_target.id;

    -- Feed entry - best effort, never block the removal on logging.
    begin
        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action,
             entity_type, entity_id, summary, details)
        values (
            v_caller.master_map_id,
            'app',
            auth.uid(),
            coalesce(nullif(v_caller.full_name, ''), 'A team member'),
            'team.removed',
            'profile',
            v_target.id,
            'Visitor ' || v_target_name || ' was removed from the map',
            jsonb_strip_nulls(jsonb_build_object(
                'removed_user_id', v_target.id,
                'role', v_target.map_role,
                'via', 'people_menu',
                'vehicle_type', v_marker ->> 'type',
                'vehicle_body_color', v_marker ->> 'bodyColor'
            ))
        );
    exception when others then
        null;
    end;
end
$$;

revoke all on function public.revoke_guest_access(uuid) from public;
grant execute on function public.revoke_guest_access(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- retire_self_from_map: capture the leaving person's machine in the log
-- ---------------------------------------------------------------------------
create or replace function public.retire_self_from_map()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_caller public.profiles;
    v_map_id uuid;
    v_name   text;
    v_marker jsonb;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select * into v_caller from public.profiles where id = auth.uid();
    if v_caller.id is null or v_caller.master_map_id is null then
        return;
    end if;

    v_map_id := v_caller.master_map_id;
    v_name := coalesce(nullif(v_caller.full_name, ''), 'A visitor');

    -- Capture their machine before the pointer row is removed.
    select vehicle_marker into v_marker
      from public.vehicle_state
     where vehicle_id = v_caller.id;

    -- Same retirement as revoke_guest_access / the expiry cron: drop their
    -- pointer row (other clients prune it live off the DELETE event) and
    -- unlink the map.
    delete from public.vehicle_state where vehicle_id = v_caller.id;

    update public.profiles
       set master_map_id = null,
           access_expires_at = null,
           retain_after_signup = false,
           updated_at = now()
     where id = v_caller.id;

    -- Feed entry - best effort, never block the retirement on logging.
    begin
        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action,
             entity_type, entity_id, summary, details)
        values (
            v_map_id,
            'app',
            v_caller.id,
            v_name,
            'team.left',
            'profile',
            v_caller.id,
            'Visitor ' || v_name || ' left the map',
            jsonb_strip_nulls(jsonb_build_object(
                'via', 'signup',
                'role', v_caller.map_role,
                'vehicle_type', v_marker ->> 'type',
                'vehicle_body_color', v_marker ->> 'bodyColor'
            ))
        );
    exception when others then
        null;
    end;
end
$fn$;
