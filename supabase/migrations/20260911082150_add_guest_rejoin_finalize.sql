-- ============================================================================
-- Guest polish, step 3: rejoin detection + named joins + guest removal
-- ============================================================================
-- 1) get_map_invite_preview now also returns map_id. The /guest page uses it
--    to detect "this browser already holds a valid guest session for THIS
--    map" and rejoin that same account — no duplicate anonymous accounts, no
--    repeated redeem, no extra use_count, no duplicate join logs.
--
-- 2) finalize_guest_join(display_name) — called by the /guest page once the
--    visitor has chosen their name. It sets profiles.full_name and renames
--    their most recent "team.joined" map_log entry from
--    "A visitor joined the map" to "Visitor <name> joined the map".
--
-- 3) revoke_guest_access(user_id) — lets team members remove a visitor from
--    the people/vehicles menu (members only; guests can never call it).
--
-- Run this whole file in the SQL editor (safe to re-run).
-- ============================================================================

-- NOTE: the preview's return type changed (map_id added), so the old function
-- must be dropped first — "create or replace" cannot change a return type.
drop function if exists public.get_map_invite_preview(text);

create or replace function public.get_map_invite_preview(p_token text)
returns table (
    valid boolean,
    map_name text,
    role text,
    reason text,
    map_id uuid
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_invite public.map_invites;
    v_name   text;
begin
    select * into v_invite from public.map_invites where token = p_token;

    if v_invite.token is null then
        return query select false, null::text, null::text, 'not_found'::text, null::uuid;
    elsif v_invite.revoked_at is not null then
        return query select false, null::text, null::text, 'revoked'::text, null::uuid;
    elsif v_invite.expires_at is not null and v_invite.expires_at <= now() then
        return query select false, null::text, null::text, 'expired'::text, null::uuid;
    elsif v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
        return query select false, null::text, null::text, 'used_up'::text, null::uuid;
    end if;

    select m.map_name into v_name from public.master_maps m where m.id = v_invite.master_map_id;
    return query select true, v_name, v_invite.role, null::text, v_invite.master_map_id;
end
$$;

revoke all on function public.get_map_invite_preview(text) from public;
grant execute on function public.get_map_invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- finalize_guest_join: name the guest + name their join log entry
-- ---------------------------------------------------------------------------
create or replace function public.finalize_guest_join(p_display_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_name text := nullif(trim(p_display_name), '');
    v_id   bigint;
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
                         end
         where id = v_id;
    end if;
end
$$;

revoke all on function public.finalize_guest_join(text) from public;
grant execute on function public.finalize_guest_join(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- revoke_guest_access: remove a visitor from the map (team members only)
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

    -- Same retirement as the expiry cron: drop their pointer + unlink the map.
    delete from public.vehicle_state where vehicle_id = v_target.id;

    update public.profiles
       set master_map_id = null,
           access_expires_at = null,
           updated_at = now()
     where id = v_target.id;

    -- Feed entry — best effort, never block the removal on logging.
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
                'via', 'people_menu'
            ))
        );
    exception when others then
        null;
    end;
end
$$;

revoke all on function public.revoke_guest_access(uuid) from public;
grant execute on function public.revoke_guest_access(uuid) to anon, authenticated;
