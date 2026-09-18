-- ============================================================================
-- Guest invites: only apply to ANONYMOUS guests + repair damaged accounts
-- ============================================================================
-- Bug fixed: redeem_map_invite used to (a) overwrite profiles.role with
-- 'viewer' for ANY caller and (b) move the caller to the invite's map — so a
-- full account (e.g. a map owner) clicking a guest link lost their own map,
-- their account role, and got "guest mode" everywhere.
--
-- New rules:
--   - VIEWER invites (guest links) only apply to ANONYMOUS users. A signed-in
--     account gets NOTHING changed — the function returns guest_applied=false
--     so the client can route them to their own app.
--   - MEMBER invites still apply to signed-in accounts, but the account's
--     `role` is NEVER changed and members never get an expiring guest window.
--   - The function now returns a `guest_applied` column (true = applied).
--
-- The repair at the end restores accounts already damaged (map owners left
-- with role='viewer' / moved off their own map).
-- Safe to re-run. Apply one statement at a time (Management API rejects
-- multi-statement batches).

-- @@STATEMENT@@

drop function if exists public.redeem_map_invite(text);

-- @@STATEMENT@@

create or replace function public.redeem_map_invite(p_token text)
returns table (
    map_id uuid,
    map_name text,
    join_code text,
    role text,
    access_expires_at timestamptz,
    guest_applied boolean
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
    v_anon   boolean;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    v_anon := coalesce(
        (select u.is_anonymous from auth.users u where u.id = auth.uid()),
        false
    );

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

    select m.map_name, m.join_code
      into v_name, v_code
      from public.master_maps m
     where m.id = v_invite.master_map_id;

    -- Guest links are for anonymous guests only. A signed-in account keeps
    -- their map, map_role and role — NOTHING is changed, and the invite is
    -- not counted as used.
    if not v_anon and v_invite.role = 'viewer' then
        return query
            select v_invite.master_map_id,
                   v_name,
                   v_code,
                   v_invite.role,
                   null::timestamptz,
                   false;
        return;
    end if;

    v_access := case when v_invite.access_hours is null
                     then null
                     else now() + make_interval(hours => v_invite.access_hours) end;

    -- Put the caller on the map. Existing members keep their standing;
    -- everyone else takes the invite's role. `role` (the app-level account
    -- type) is only ever set for anonymous guests — a signed-in account is
    -- never downgraded by a link, and members never get an expiring window.
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
                          when v_invite.role = 'member' then null
                          else v_access
                      end,
           retain_after_signup = case
                          when p.master_map_id = v_invite.master_map_id and p.map_role = 'member'
                          then p.retain_after_signup
                          when v_invite.role = 'viewer'
                          then v_invite.retain_on_signup
                          else p.retain_after_signup
                      end,
           role = case
                      when p.master_map_id = v_invite.master_map_id and p.map_role = 'member'
                      then p.role
                      when v_anon and v_invite.role = 'viewer' then 'viewer'
                      else coalesce(p.role, 'operator')
                  end,
           onboarded = true
     where p.id = auth.uid();

    if not found then
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

    return query select v_invite.master_map_id, v_name, v_code,
                        v_invite.role, v_access, true;
end
$$;

-- @@STATEMENT@@

-- ---------------------------------------------------------------------------
-- Data repair: map owners damaged by the old behaviour — role overwritten to
-- 'viewer' (by a guest invite) and/or moved off their own map. Owners must be
-- managers on their own map; restore role, map_role, no expiry, and point
-- master_map_id back at a map they own. Anonymous guests are untouched.
-- ---------------------------------------------------------------------------
update public.profiles p
   set role = 'manager',
       map_role = 'member',
       access_expires_at = null,
       master_map_id = owned.mid,
       updated_at = now()
  from (
      select distinct on (master_user_id) master_user_id, id as mid
        from public.master_maps
       order by master_user_id, created_at asc nulls last
  ) owned
 where owned.master_user_id = p.id
   and p.role = 'viewer'
   and exists (
       select 1 from auth.users u
        where u.id = p.id and coalesce(u.is_anonymous, false) = false
   );
