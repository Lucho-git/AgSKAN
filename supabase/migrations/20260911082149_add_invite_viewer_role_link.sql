-- ============================================================================
-- Guest invites, step 2: redeem also sets the app's viewer role
-- ============================================================================
-- The app already has `profiles.role` ('manager' | 'operator' | 'viewer') —
-- that's what the map UI reads as user_type. A guest redeem must set BOTH:
--   * map_role = 'viewer'   → temporary-access marker + server write guards
--   * role     = 'viewer'   → the app's own viewer semantics (UI gating)
--
-- Run this whole file in the SQL editor (create or replace — safe to re-run).
-- ============================================================================

create or replace function public.redeem_map_invite(p_token text)
returns table (
    map_id uuid,
    map_name text,
    join_code text,
    role text,
    access_expires_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_invite public.map_invites;
    v_name   text;
    v_code   text;
    v_access timestamptz;
    v_wrote  boolean := false;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    -- Serialise concurrent redemptions of the same token.
    select * into v_invite
      from public.map_invites
     where token = p_token
       for update;

    if v_invite.token is null then
        raise exception 'Invite not found';
    end if;
    if v_invite.revoked_at is not null then
        raise exception 'Invite revoked';
    end if;
    if v_invite.expires_at is not null and v_invite.expires_at <= now() then
        raise exception 'Invite expired';
    end if;
    if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
        raise exception 'Invite already used';
    end if;

    v_access := case when v_invite.access_hours is null
                     then null
                     else now() + make_interval(hours => v_invite.access_hours) end;

    -- Put the caller on the map. Existing members keep their standing if they
    -- redeem a link (never downgrade); everyone else becomes a viewer (both
    -- the temporary-access marker and the app-level role).
    update public.profiles p
       set master_map_id = v_invite.master_map_id,
           map_role = case
                          when p.master_map_id = v_invite.master_map_id and p.map_role = 'member'
                          then 'member'
                          else v_invite.role
                      end,
           access_expires_at = case
                          when p.master_map_id = v_invite.master_map_id and p.map_role = 'member'
                          then null
                          else v_access
                      end,
           role = case
                      when p.master_map_id = v_invite.master_map_id and p.map_role = 'member'
                      then p.role
                      when v_invite.role = 'viewer' then 'viewer'
                      else coalesce(p.role, 'operator')
                  end,
           onboarded = true
     where p.id = auth.uid();
    v_wrote := found;

    if not v_wrote then
        -- Fresh (usually anonymous) account — mirror the app's profile insert.
        insert into public.profiles
            (id, email, full_name, role, master_map_id, map_role,
             access_expires_at, onboarded, updated_at, created_at)
        select
            u.id,
            u.email,
            coalesce(u.raw_user_meta_data ->> 'full_name', 'Visitor'),
            case when v_invite.role = 'viewer' then 'viewer' else 'operator' end,
            v_invite.master_map_id,
            v_invite.role,
            v_access,
            true,
            now(),
            now()
        from auth.users u
        where u.id = auth.uid();
    end if;

    update public.map_invites
       set use_count = use_count + 1,
           last_used_at = now()
     where token = p_token;

    select m.map_name, m.join_code
      into v_name, v_code
      from public.master_maps m
     where m.id = v_invite.master_map_id;

    -- Feed entry — best effort, never block the join on logging.
    begin
        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action,
             entity_type, entity_id, summary, details)
        values (
            v_invite.master_map_id,
            'app',
            auth.uid(),
            coalesce(
                (select nullif(p.full_name, '') from public.profiles p where p.id = auth.uid()),
                'Visitor'
            ),
            'team.joined',
            'profile',
            auth.uid(),
            case when v_invite.role = 'viewer'
                 then 'A visitor joined the map'
                 else 'A new member joined the map' end,
            jsonb_strip_nulls(jsonb_build_object(
                'role', v_invite.role,
                'via', 'invite_link',
                'access_expires_at', v_access
            ))
        );
    exception when others then
        null;
    end;

    return query select v_invite.master_map_id, v_name, v_code, v_invite.role, v_access;
end
$$;

revoke all on function public.redeem_map_invite(text) from public;
grant execute on function public.redeem_map_invite(text) to anon, authenticated;
