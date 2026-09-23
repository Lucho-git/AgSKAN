-- ============================================================================
-- Marker archive - durable per-marker lifecycle record for usage stats
-- ============================================================================
-- One row per marker EVER placed (never removed - deleted markers get stamped,
-- not dropped). This is the source of truth for "most used markers per user,
-- including deleted ones, over time".
--
-- Why a dedicated table (not just map_log / map_markers):
--   * map_log is an append-only FEED written by triggers; it only covers
--     activity since it was installed, and its details are event payloads.
--   * map_markers soft-deletes (deleted / deleted_at) and keeps deleted rows,
--     but it is the WORKING table - deleted rows could be purged someday, and
--     update_user_id is the LAST updater, not necessarily the placer.
--   * marker_archive freezes the PLACEMENT snapshot (who / what / where /
--     when) at insert time and survives everything.
--
-- Capture model
--   * Triggers on map_markers (after insert / delete-flip / hard delete) run
--     as the table owner - every write path is covered (app, sync engine,
--     RPCs, cron), no client involvement.
--   * placed_by = auth.uid() from the request JWT, falling back to
--     update_user_id (same helper the map log uses).
--   * Backfilled once from map_markers (including soft-deleted rows) so the
--     stats go back years, not just to when the triggers were installed.
--     Backfilled rows are best-effort: the snapshot is the marker's state at
--     install time and placed_by falls back to its last updater.
--
-- Stats read: public.get_marker_stats(map, profile, since, until) - groups
-- placements + deleted counts per icon class, RLS-scoped to the caller's map.
-- ============================================================================

-- 1. Table -------------------------------------------------------------------
create table if not exists public.marker_archive (
    marker_id       uuid primary key,                     -- map_markers.id
    master_map_id   uuid not null references public.master_maps(id) on delete cascade,
    placed_by       uuid,                                 -- profiles.id (placer)
    placed_by_name  text not null default 'Unknown user', -- snapshot (renames/leaves)
    placed_at       timestamptz not null default now(),
    icon_class      text,                                 -- placement-time icon
    marker_color    text,
    tint_mode       text,
    notes           text,
    lat             double precision,
    lng             double precision,
    marker_data     jsonb,                                -- frozen placement snapshot
    deleted_at      timestamptz,                          -- stamped when removed
    deleted_by      uuid,
    deleted_by_name text,
    archived_at     timestamptz not null default now()
);

comment on table public.marker_archive is
    'Durable archive: one row per marker ever placed (deleted markers are stamped, never dropped). Source for marker usage stats.';

-- 2. Indexes -----------------------------------------------------------------
create index if not exists marker_archive_map_time_idx
    on public.marker_archive (master_map_id, placed_at desc);

create index if not exists marker_archive_actor_idx
    on public.marker_archive (placed_by, placed_at desc);

create index if not exists marker_archive_icon_idx
    on public.marker_archive (icon_class);

-- 3. Access ------------------------------------------------------------------
alter table public.marker_archive enable row level security;

drop policy if exists marker_archive_select_members on public.marker_archive;
create policy marker_archive_select_members on public.marker_archive
    for select to authenticated
    using (master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid()));

revoke all on public.marker_archive from anon, authenticated;
grant select on public.marker_archive to authenticated;
grant all on public.marker_archive to service_role;

-- 4. Triggers ----------------------------------------------------------------
create or replace function public.trg_marker_archive()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
    v_actor_id   uuid;
    v_actor_name text;
    v_props      jsonb;
    v_coords     jsonb;
begin
    if tg_op = 'INSERT' then
        select a.actor_id, a.actor_name into v_actor_id, v_actor_name
          from public.map_log_actor(new.update_user_id) a;
        v_props  := coalesce(new.marker_data -> 'properties', '{}'::jsonb);
        v_coords := new.marker_data -> 'geometry' -> 'coordinates';
        insert into public.marker_archive
            (marker_id, master_map_id, placed_by, placed_by_name, placed_at,
             icon_class, marker_color, tint_mode, notes, lat, lng, marker_data,
             deleted_at)
        values (
            new.id,
            new.master_map_id,
            v_actor_id,
            coalesce(v_actor_name, 'Unknown user'),
            coalesce(new.created_at, now()),
            v_props ->> 'icon',
            v_props ->> 'marker_color',
            v_props ->> 'tint_mode',
            new.notes,
            (v_coords ->> 1)::double precision,
            (v_coords ->> 0)::double precision,
            new.marker_data,
            case when new.deleted is true then coalesce(new.deleted_at, now()) end
        )
        on conflict (marker_id) do nothing;
        return null;
    end if;

    -- Hard delete: keep the archive row, just stamp it.
    if tg_op = 'DELETE' then
        update public.marker_archive
           set deleted_at = coalesce(deleted_at, old.deleted_at, now())
         where marker_id = old.id;
        return null;
    end if;

    -- UPDATE: the trigger only fires when `deleted` flips.
    if new.deleted is true then
        select a.actor_id, a.actor_name into v_actor_id, v_actor_name
          from public.map_log_actor(new.update_user_id) a;
        update public.marker_archive
           set deleted_at      = coalesce(new.deleted_at, now()),
               deleted_by      = v_actor_id,
               deleted_by_name = coalesce(v_actor_name, 'Unknown user')
         where marker_id = new.id;
    else
        -- Restored - clear the removal stamp.
        update public.marker_archive
           set deleted_at = null, deleted_by = null, deleted_by_name = null
         where marker_id = new.id;
    end if;
    return null;
end
$fn$;

create trigger marker_archive_insert
    after insert on public.map_markers
    for each row
    execute function public.trg_marker_archive();

create trigger marker_archive_deleted
    after update on public.map_markers
    for each row
    when (new.deleted is distinct from old.deleted)
    execute function public.trg_marker_archive();

create trigger marker_archive_hard_deleted
    after delete on public.map_markers
    for each row
    execute function public.trg_marker_archive();

-- 5. Backfill ----------------------------------------------------------------
-- Best-effort: current snapshot + last updater for attribution. `on conflict
-- do nothing` makes it safe to re-run.
insert into public.marker_archive
    (marker_id, master_map_id, placed_by, placed_by_name, placed_at,
     icon_class, marker_color, tint_mode, notes, lat, lng, marker_data,
     deleted_at)
select m.id,
       m.master_map_id,
       m.update_user_id,
       coalesce(nullif(p.full_name, ''), nullif(p.email, ''), 'Unknown user'),
       coalesce(m.created_at, m.updated_at, now()),
       m.marker_data -> 'properties' ->> 'icon',
       m.marker_data -> 'properties' ->> 'marker_color',
       m.marker_data -> 'properties' ->> 'tint_mode',
       m.notes,
       (m.marker_data -> 'geometry' -> 'coordinates' ->> 1)::double precision,
       (m.marker_data -> 'geometry' -> 'coordinates' ->> 0)::double precision,
       m.marker_data,
       case when m.deleted is true then coalesce(m.deleted_at, m.updated_at, m.created_at) end
  from public.map_markers m
  left join public.profiles p on p.id = m.update_user_id
 where m.master_map_id is not null
on conflict (marker_id) do nothing;

-- 6. Stats read --------------------------------------------------------------
create or replace function public.get_marker_stats(
    p_master_map_id uuid default null,
    p_profile_id    uuid default null,
    p_since         timestamptz default null,
    p_until         timestamptz default null
)
returns table (
    icon_class text,
    placements bigint,
    deleted    bigint,
    first_used timestamptz,
    last_used  timestamptz
)
language sql
stable
set search_path to 'public'
as $fn$
    select a.icon_class,
           count(*)            as placements,
           count(a.deleted_at) as deleted,
           min(a.placed_at)    as first_used,
           max(a.placed_at)    as last_used
      from public.marker_archive a
     where (p_master_map_id is null or a.master_map_id = p_master_map_id)
       and (p_profile_id    is null or a.placed_by    = p_profile_id)
       and (p_since         is null or a.placed_at   >= p_since)
       and (p_until         is null or a.placed_at    < p_until)
     group by a.icon_class
     order by count(*) desc, a.icon_class
$fn$;

comment on function public.get_marker_stats(uuid, uuid, timestamptz, timestamptz) is
    'Marker usage stats: placements (+ deleted) per icon class, optionally scoped to a map / profile / time window. RLS applies (caller''s map only).';

revoke all on function public.get_marker_stats(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.get_marker_stats(uuid, uuid, timestamptz, timestamptz) from anon;
grant execute on function public.get_marker_stats(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_marker_stats(uuid, uuid, timestamptz, timestamptz) to service_role;
