-- Fix guest join UX + the "unchecked" signup kick (applied 2026-09-18).
--
-- 1. profiles was missing from the supabase_realtime publication, so the
--    client's postgres_changes subscription on profiles never fired. New
--    guests only appeared in the people/vehicle menu (and on the map) when
--    the 60s poll ran, and their join toast showed "Someone" with no
--    vehicle icon. Publishing the table makes joins (and renames, role
--    updates) surface live.
--
-- 2. retire_self_from_map(): self-serve version of revoke_guest_access's
--    retirement. Used by the guest signup page when the invite does NOT
--    keep access after signup: deletes the caller's vehicle_state row
--    (other members prune the pointer off the realtime DELETE event) and
--    unlinks the map, so the team's map loses them immediately instead of
--    on the next poll. The old client-side disconnect left the pointer row
--    behind, which is why the guest stayed visible after signing up.
--
-- Both statements are idempotent.

do $do$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'profiles'
    ) then
        alter publication supabase_realtime add table public.profiles;
    end if;
end
$do$;

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
                'role', v_caller.map_role
            ))
        );
    exception when others then
        null;
    end;
end
$fn$;
