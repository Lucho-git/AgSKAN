-- ============================================================================
-- Guest invites: "keep access after signup" flag
-- ============================================================================
-- 1) map_invites.retain_on_signup — set from the invite modal checkbox. When
--    true, a guest who later creates a real account keeps their map access.
-- 2) profiles.retain_after_signup — copied onto the guest at redeem time; the
--    (future) signup/upgrade flow checks it to decide whether the guest stays
--    connected to the map after account creation.
--
-- NOTE: create_map_invite gains a 5th parameter, so the old 4-arg version is
-- dropped first — keeping both would make PostgREST calls ambiguous.
-- Safe to re-run.
-- ============================================================================

alter table public.map_invites
    add column if not exists retain_on_signup boolean not null default false;

alter table public.profiles
    add column if not exists retain_after_signup boolean not null default false;

drop function if exists public.create_map_invite(text, integer, integer, integer);

create or replace function public.create_map_invite(
    p_role text default 'viewer',
    p_expires_hours int default 168,
    p_max_uses int default null,
    p_access_hours int default 48,
    p_retain_on_signup boolean default false
)
returns public.map_invites
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_profile public.profiles;
    v_invite  public.map_invites;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select * into v_profile from public.profiles where id = auth.uid();
    if v_profile.id is null or v_profile.master_map_id is null then
        raise exception 'No map linked to this account';
    end if;
    if v_profile.map_role = 'viewer' then
        raise exception 'Viewers cannot create invites';
    end if;

    insert into public.map_invites
        (master_map_id, created_by, role, expires_at, max_uses, access_hours, retain_on_signup)
    values (
        v_profile.master_map_id,
        v_profile.id,
        case when p_role = 'member' then 'member' else 'viewer' end,
        case when p_expires_hours is null
             then null
             else now() + make_interval(hours => p_expires_hours) end,
        p_max_uses,
        coalesce(p_access_hours, 48),
        coalesce(p_retain_on_signup, false)
    )
    returning * into v_invite;

    return v_invite;
end
$$;

-- ---------------------------------------------------------------------------
-- Redeem: also copy the invite's retain flag onto the guest profile
-- ---------------------------------------------------------------------------
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
           retain_after_signup = case
                          when p.master_map_id = v_invite.master_map_id and p.map_role = 'member'
                          then p.retain_after_signup
                          else v_invite.retain_on_signup
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
             access_expires_at, retain_after_signup, onboarded, updated_at, created_at)
        select
            u.id,
            u.email,
            coalesce(u.raw_user_meta_data ->> 'full_name', 'Visitor'),
            case when v_invite.role = 'viewer' then 'viewer' else 'operator' end,
            v_invite.master_map_id,
            v_invite.role,
            v_access,
            v_invite.retain_on_signup,
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
                'access_expires_at', v_access,
                'retain_after_signup', v_invite.retain_on_signup
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
