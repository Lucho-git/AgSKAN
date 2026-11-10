-- ============================================================================
-- Guest invites: temporary, view-only map access via seamless share links
-- ============================================================================
-- ⚠️ NOT YET APPLIED to the live project (Supabase MCP auth was down when this
--    was written). Apply via the SQL editor or a restored connection, then:
--    enable Anonymous Sign-ins in the dashboard (Auth → Sign In / Providers).
--
-- The flow this powers:
--   1. A member/owner taps "Invite to map" → create_map_invite() → gets a
--      token. Link: https://www.skanfarming.com.au/guest?invite=<token>
--   2. A visitor opens the link → the site shows the map name (preview) with
--      one "Join" button → tapping it signs them in ANONYMOUSLY (Supabase
--      anonymous auth — no email/password) → redeem_map_invite(token).
--   3. The RPC validates the token, puts the account on the map as a
--      'viewer' with a limited access window, bumps usage, logs the join.
--   4. disconnect_expired_viewers() (cron) retires guests when their window
--      ends and removes their map presence.
--
-- Design notes:
--   * Tokens are 32-hex random, revocable and expiring — the 4-digit
--     join_code is deliberately NOT used for guest links.
--   * Email clients / link scanners follow URLs before humans do, so
--     redemption must stay behind a tap on the site (never a bare GET).
--   * Anonymous users are still `authenticated` at the DB level with
--     `is_anonymous: true` in the JWT, so auth.uid() works everywhere.
--   * Viewers are read-only: the interim guards are BEFORE triggers on the
--     write tables (RLS is still OFF on these tables — full RLS with role
--     policies remains the long-term hardening step).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Role + access window on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
    add column if not exists map_role text not null default 'member';
alter table public.profiles
    add column if not exists access_expires_at timestamptz;

comment on column public.profiles.map_role is
    'member | viewer — viewers are guest-invite accounts with read-only map access.';
comment on column public.profiles.access_expires_at is
    'When a viewer''s temporary access ends (null = no expiry; members keep null).';

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
create table if not exists public.map_invites (
    token         text primary key
                  default encode(extensions.gen_random_bytes(16), 'hex'),
    master_map_id uuid not null references public.master_maps(id) on delete cascade,
    created_by    uuid,                       -- profiles.id of the inviter
    role          text not null default 'viewer' check (role in ('viewer', 'member')),
    expires_at    timestamptz,                -- redemption deadline (null = none)
    max_uses      int,                        -- null = unlimited
    use_count     int not null default 0,
    revoked_at    timestamptz,
    created_at    timestamptz not null default now(),
    last_used_at  timestamptz,
    access_hours  int not null default 48     -- viewer access window after joining
);

comment on table public.map_invites is
    'Shareable invite tokens for a map. Created/deleted via RPCs only; guests redeem anonymously.';

create index if not exists map_invites_map_idx
    on public.map_invites (master_map_id, created_at desc);

-- Members can see their map's invites (to manage/revoke); writes via RPC only.
alter table public.map_invites enable row level security;

drop policy if exists map_invites_select_members on public.map_invites;
create policy map_invites_select_members on public.map_invites
    for select to authenticated
    using (master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid()));

revoke all on public.map_invites from anon, authenticated;
grant select on public.map_invites to authenticated;
grant all on public.map_invites to service_role;

-- ---------------------------------------------------------------------------
-- Create an invite (members/owners of the caller's map)
-- ---------------------------------------------------------------------------
create or replace function public.create_map_invite(
    p_role text default 'viewer',
    p_expires_hours int default 168,   -- link valid 7 days by default
    p_max_uses int default null,
    p_access_hours int default 48      -- guest keeps access 48h after joining
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
        (master_map_id, created_by, role, expires_at, max_uses, access_hours)
    values (
        v_profile.master_map_id,
        v_profile.id,
        case when p_role = 'member' then 'member' else 'viewer' end,
        case when p_expires_hours is null
             then null
             else now() + make_interval(hours => p_expires_hours) end,
        p_max_uses,
        coalesce(p_access_hours, 48)
    )
    returning * into v_invite;

    return v_invite;
end
$$;

-- ---------------------------------------------------------------------------
-- Preview (anon-safe: powers the one-tap /guest page)
-- ---------------------------------------------------------------------------
create or replace function public.get_map_invite_preview(p_token text)
returns table (valid boolean, map_name text, role text, reason text)
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
        return query select false, null::text, null::text, 'not_found'::text;
    elsif v_invite.revoked_at is not null then
        return query select false, null::text, null::text, 'revoked'::text;
    elsif v_invite.expires_at is not null and v_invite.expires_at <= now() then
        return query select false, null::text, null::text, 'expired'::text;
    elsif v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
        return query select false, null::text, null::text, 'used_up'::text;
    end if;

    select m.map_name into v_name from public.master_maps m where m.id = v_invite.master_map_id;
    return query select true, v_name, v_invite.role, null::text;
end
$$;

-- ---------------------------------------------------------------------------
-- Redeem (works for anonymous sessions — that's the whole point)
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
    -- redeem a link (never downgrade); everyone else gets the invite's role.
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
           onboarded = true
     where p.id = auth.uid();
    v_wrote := found;

    if not v_wrote then
        -- Fresh (usually anonymous) account — mirror the app's profile insert.
        insert into public.profiles
            (id, email, full_name, master_map_id, map_role, access_expires_at,
             onboarded, updated_at, created_at)
        select
            u.id,
            u.email,
            coalesce(u.raw_user_meta_data ->> 'full_name', 'Visitor'),
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

-- ---------------------------------------------------------------------------
-- Revoke (members/owners of the invite's map)
-- ---------------------------------------------------------------------------
create or replace function public.revoke_map_invite(p_token text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_invite  public.map_invites;
    v_profile public.profiles;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select * into v_invite from public.map_invites where token = p_token;
    if v_invite.token is null then
        raise exception 'Invite not found';
    end if;

    select * into v_profile from public.profiles where id = auth.uid();
    if v_profile.id is null
       or v_profile.master_map_id is distinct from v_invite.master_map_id
       or v_profile.map_role = 'viewer' then
        raise exception 'Not allowed';
    end if;

    update public.map_invites
       set revoked_at = now()
     where token = p_token;
end
$$;

-- ---------------------------------------------------------------------------
-- Retire expired viewers (cron)
-- ---------------------------------------------------------------------------
create or replace function public.disconnect_expired_viewers()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_count int;
begin
    -- Remove their map presence (pointer marker) first.
    delete from public.vehicle_state vs
     using public.profiles p
     where vs.vehicle_id = p.id
       and p.map_role = 'viewer'
       and p.access_expires_at is not null
       and p.access_expires_at <= now();

    update public.profiles p
       set master_map_id = null,
           access_expires_at = null
     where p.map_role = 'viewer'
       and p.access_expires_at is not null
       and p.access_expires_at <= now();

    get diagnostics v_count = row_count;
    return v_count;
end
$$;

-- Schedule hourly (run once, after reviewing):
--   select cron.schedule('expire-viewer-access', '15 * * * *',
--                        $$select public.disconnect_expired_viewers();$$);

-- ---------------------------------------------------------------------------
-- Interim write guards — viewers are read-only
-- ---------------------------------------------------------------------------
-- RLS is still off on the core tables, so these BEFORE triggers are the
-- server-side stop for guest writes. No auth.uid() (cron / service role)
-- passes untouched. Extend this pattern to marker_drawings / fields / kmz
-- overlays as they're reviewed.
create or replace function public.trg_block_viewer_writes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.map_role = 'viewer'
    ) then
        raise exception 'View-only access: this action is not available on a guest invite.';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end
$$;

drop trigger if exists block_viewer_marker_writes on public.map_markers;
create trigger block_viewer_marker_writes
    before insert or update or delete on public.map_markers
    for each row
    execute function public.trg_block_viewer_writes();

drop trigger if exists block_viewer_trail_writes on public.trails;
create trigger block_viewer_trail_writes
    before insert or update or delete on public.trails
    for each row
    execute function public.trg_block_viewer_writes();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.create_map_invite(text, int, int, int) from public, anon;
revoke all on function public.revoke_map_invite(text) from public, anon;
revoke all on function public.get_map_invite_preview(text) from public;
revoke all on function public.redeem_map_invite(text) from public;
revoke all on function public.disconnect_expired_viewers() from public, anon, authenticated;
revoke all on function public.trg_block_viewer_writes() from public, anon, authenticated;

grant execute on function public.create_map_invite(text, int, int, int) to authenticated;
grant execute on function public.revoke_map_invite(text) to authenticated;
grant execute on function public.get_map_invite_preview(text) to anon, authenticated;
grant execute on function public.redeem_map_invite(text) to anon, authenticated;
