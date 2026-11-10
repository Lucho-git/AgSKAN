-- ============================================================================
-- Map log — server-truth activity feed for every master map
-- ============================================================================
-- Every meaningful action on a map is recorded here at the moment the data
-- hits the server (not from the client's optimistic state):
--
--   "Placed a marker"            X / markertype / position / timestamp
--   "Deleted a marker"           (soft deletes: deleted false → true)
--   "Started trailing — Mower — Head wash Fungicide"
--   "Closed a trail — 2h 47m, 121 ha"      (enriched when metrics arrive;
--                                           "Auto-closed an interrupted
--                                           trail" when closed by cron/system)
--   "Deleted an unfinished trail"
--
-- Capture model
--   * Postgres table triggers on the source tables — no client involvement,
--     works for every write path (app, sync engine, RPCs, cron).
--   * Actor = auth.uid() from the request's JWT, with the source row's
--     update_user_id as fallback. No actor ⇒ system event (e.g. the
--     close-stale-trails cron) → source = 'system'.
--   * occurred_at = now() at insert (server clock).
--   * master_map_id comes from map_markers directly; trails have no
--     master_map_id column so it resolves via operations → vehicle profile.
--
-- Deliberately NOT logged (v1):
--   * marker colour/style tweaks, silo fill, last_confirmed, sync churn —
--     the marker UPDATE trigger only fires when `deleted` flips.
--   * trail_stream points, spray record generation internals.
-- Phase 2 capture points (same pattern): marker edits/photos/moves,
-- marker_drawings, kmz_overlays, fields, operations, team joins,
-- vehicle presets.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.map_log (
    id            bigint generated always as identity primary key,
    master_map_id uuid not null references public.master_maps(id) on delete cascade,
    occurred_at   timestamptz not null default now(),
    source        text not null default 'app',        -- 'app' | 'system'
    actor_id      uuid,                               -- profiles.id; null = system
    actor_name    text not null default 'System',     -- snapshot (profiles rename/leave)
    action        text not null,                      -- 'marker.placed', 'trail.closed', ...
    entity_type   text not null,                      -- 'marker' | 'trail' (grows)
    entity_id     uuid not null,
    summary       text not null,                      -- one human-readable line
    details       jsonb not null default '{}'::jsonb  -- structured extras for the UI
);

comment on table public.map_log is
    'Append-only map activity feed (server truth). Rows are written by table triggers only; clients may read their own master map.';

create index if not exists map_log_map_time_idx on public.map_log (master_map_id, occurred_at desc);
create index if not exists map_log_entity_idx   on public.map_log (entity_type, entity_id);
create index if not exists map_log_actor_idx    on public.map_log (actor_id, occurred_at desc);

-- Members of the map can read; clients cannot write (triggers run as owner).
alter table public.map_log enable row level security;

drop policy if exists map_log_select_members on public.map_log;
create policy map_log_select_members on public.map_log
    for select to authenticated
    using (master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid()));

revoke all on public.map_log from anon, authenticated;
grant select on public.map_log to authenticated;
grant all on public.map_log to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Resolve (actor_id, actor_name) for a log row: the request's JWT user with
-- an optional column fallback (e.g. map_markers.update_user_id). No row ⇒
-- caller treats it as a system event.
create or replace function public.map_log_actor(p_fallback uuid default null)
returns table (actor_id uuid, actor_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
    select p.id,
           coalesce(nullif(p.full_name, ''), nullif(p.email, ''), 'Unknown user')
      from public.profiles p
     where p.id = coalesce(auth.uid(), p_fallback)
$$;

comment on function public.map_log_actor(uuid) is
    'Map log: resolves the acting profile from auth.uid() (or a fallback id).';

-- Master map for a trail: via its operation, falling back to the trailing
-- user's profile (trails has no master_map_id column).
create or replace function public.map_log_map_for_trail(p_operation_id uuid, p_vehicle_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
    select coalesce(
        (select o.master_map_id from public.operations o where o.id = p_operation_id),
        (select pr.master_map_id from public.profiles pr where pr.id = p_vehicle_id)
    )
$$;

-- "2h 47m" / "45m" / "3h" / "under a minute"
create or replace function public.map_log_format_duration(p_seconds bigint)
returns text
language sql
immutable
as $$
    select case
        when p_seconds is null or p_seconds < 60 then 'under a minute'
        when p_seconds < 3600 then floor(p_seconds / 60) || 'm'
        when p_seconds % 3600 = 0 then floor(p_seconds / 3600) || 'h'
        else floor(p_seconds / 3600) || 'h ' || floor((p_seconds % 3600) / 60) || 'm'
    end
$$;

-- 'Closed a trail — 2h 47m, 121 ha' (auto variant for system closes).
create or replace function public.map_log_trail_close_summary(p_auto boolean, p_duration_s bigint, p_hectares numeric)
returns text
language sql
immutable
as $$
    select (case when p_auto then 'Auto-closed an interrupted trail' else 'Closed a trail' end)
        || ' — ' || public.map_log_format_duration(p_duration_s)
        || case when p_hectares is not null
                then ', ' || round(p_hectares, 1)::text || ' ha'
                else '' end
$$;

-- Internal helpers — server-side only.
revoke all on function public.map_log_actor(uuid) from public, anon, authenticated;
revoke all on function public.map_log_map_for_trail(uuid, uuid) from public, anon, authenticated;
revoke all on function public.map_log_format_duration(bigint) from public, anon, authenticated;
revoke all on function public.map_log_trail_close_summary(boolean, bigint, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Marker capture: placed / deleted (soft) / restored
-- ---------------------------------------------------------------------------
create or replace function public.trg_map_log_marker()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_row        public.map_markers%rowtype;
    v_actor_id   uuid;
    v_actor_name text;
    v_action     text;
    v_summary    text;
    v_props      jsonb;
    v_coords     jsonb;
begin
    if tg_op = 'DELETE' then
        -- Hard deletes of already-soft-deleted markers are cleanup noise.
        if old.deleted is true then
            return null;
        end if;
        v_row := old;
        v_action := 'marker.deleted';
        v_summary := 'Deleted a marker';
    elsif tg_op = 'INSERT' then
        v_row := new;
        v_action := 'marker.placed';
        v_summary := 'Placed a marker';
    elsif new.deleted is true and coalesce(old.deleted, false) is false then
        v_row := new;
        v_action := 'marker.deleted';
        v_summary := 'Deleted a marker';
    elsif coalesce(new.deleted, false) is false and old.deleted is true then
        v_row := new;
        v_action := 'marker.restored';
        v_summary := 'Restored a marker';
    else
        -- Not a meaningful change (colour tweaks, silo fill, sync writes, ...)
        return null;
    end if;

    if v_row.master_map_id is null then
        return null;
    end if;

    select a.actor_id, a.actor_name into v_actor_id, v_actor_name
      from public.map_log_actor(v_row.update_user_id) a;

    v_props  := coalesce(v_row.marker_data -> 'properties', '{}'::jsonb);
    v_coords := v_row.marker_data -> 'geometry' -> 'coordinates';

    insert into public.map_log
        (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
    values (
        v_row.master_map_id,
        case when v_actor_id is null then 'system' else 'app' end,
        v_actor_id,
        coalesce(v_actor_name, 'System'),
        v_action,
        'marker',
        v_row.id,
        v_summary,
        jsonb_strip_nulls(jsonb_build_object(
            'icon',         v_props -> 'icon',
            'marker_color', v_props -> 'marker_color',
            'tint_mode',    v_props -> 'tint_mode',
            'lng',          v_coords -> 0,
            'lat',          v_coords -> 1
        ))
    );
    return null;
end
$$;

create trigger map_log_marker_placed
    after insert on public.map_markers
    for each row
    when (coalesce(new.deleted, false) = false)
    execute function public.trg_map_log_marker();

create trigger map_log_marker_deleted
    after update on public.map_markers
    for each row
    when (new.deleted is distinct from old.deleted)
    execute function public.trg_map_log_marker();

create trigger map_log_marker_hard_deleted
    after delete on public.map_markers
    for each row
    execute function public.trg_map_log_marker();

-- ---------------------------------------------------------------------------
-- Trail capture: started / closed (+ metrics enrichment) / deleted
-- ---------------------------------------------------------------------------
create or replace function public.trg_map_log_trail()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_actor_id   uuid;
    v_actor_name text;
    v_map        uuid;
    v_op_name    text;
    v_vtype      text;
    v_summary    text;
    v_duration_s bigint;
    v_auto       boolean;
begin
    if tg_op = 'DELETE' then
        -- Only unfinished trails get hard-deleted (insufficient data).
        if old.end_time is not null then
            return null;
        end if;
        v_map := public.map_log_map_for_trail(old.operation_id, old.vehicle_id);
        if v_map is null then
            return null;
        end if;

        select a.actor_id, a.actor_name into v_actor_id, v_actor_name
          from public.map_log_actor(null) a;

        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
        values (
            v_map,
            case when v_actor_id is null then 'system' else 'app' end,
            v_actor_id,
            coalesce(v_actor_name, 'System'),
            'trail.deleted', 'trail', old.id,
            'Deleted an unfinished trail',
            jsonb_strip_nulls(jsonb_build_object(
                'operation_id', old.operation_id
            ))
        );
        return null;
    end if;

    if tg_op = 'INSERT' then
        if new.end_time is not null then
            return null;   -- e.g. imported history, not a live start
        end if;
        v_map := public.map_log_map_for_trail(new.operation_id, new.vehicle_id);
        if v_map is null then
            return null;
        end if;

        v_op_name := (select o.name from public.operations o where o.id = new.operation_id);
        v_vtype   := new.vehicle_marker ->> 'type';

        select a.actor_id, a.actor_name into v_actor_id, v_actor_name
          from public.map_log_actor(null) a;

        v_summary := 'Started trailing'
            || case when v_vtype is not null then ' with ' || (new.vehicle_marker ->> 'type') else '' end
            || case when v_op_name is not null then ' — ' || v_op_name else '' end;

        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
        values (
            v_map,
            case when v_actor_id is null then 'system' else 'app' end,
            v_actor_id,
            coalesce(v_actor_name, 'System'),
            'trail.started', 'trail', new.id, v_summary,
            jsonb_strip_nulls(jsonb_build_object(
                'operation_id',   new.operation_id,
                'operation_name', v_op_name,
                'vehicle_id',     new.vehicle_id,
                'vehicle_type',   new.vehicle_marker -> 'type',
                'operator_name',  new.operator_name,
                'trail_color',    new.trail_color,
                'trail_width',    new.trail_width
            ))
        );
        return null;
    end if;

    -- UPDATE: closed (end_time null -> set) --------------------------------
    if new.end_time is not null and old.end_time is null then
        v_map := public.map_log_map_for_trail(new.operation_id, new.vehicle_id);
        if v_map is null then
            return null;
        end if;

        v_op_name := (select o.name from public.operations o where o.id = new.operation_id);

        select a.actor_id, a.actor_name into v_actor_id, v_actor_name
          from public.map_log_actor(null) a;

        -- No JWT actor on the request ⇒ the close came from the server
        -- (close-stale-trails cron) or a service role.
        v_auto := v_actor_id is null;
        v_duration_s := greatest(0, extract(epoch from (new.end_time - new.start_time))::bigint);

        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
        values (
            v_map,
            case when v_auto then 'system' else 'app' end,
            v_actor_id,
            coalesce(v_actor_name, 'System'),
            'trail.closed', 'trail', new.id,
            public.map_log_trail_close_summary(v_auto, v_duration_s, new.trail_hectares),
            jsonb_strip_nulls(jsonb_build_object(
                'operation_id',   new.operation_id,
                'operation_name', v_op_name,
                'vehicle_id',     new.vehicle_id,
                'vehicle_type',   new.vehicle_marker -> 'type',
                'operator_name',  new.operator_name,
                'duration_s',     v_duration_s,
                'trail_distance', new.trail_distance,
                'trail_hectares', new.trail_hectares
            ))
        );
        return null;
    end if;

    -- UPDATE: metrics arrived after the close (calculated in background) ---
    if new.metrics_calculated is true
       and coalesce(old.metrics_calculated, false) is false
       and new.end_time is not null then
        v_duration_s := greatest(0, extract(epoch from (new.end_time - new.start_time))::bigint);

        update public.map_log ml
           set summary = public.map_log_trail_close_summary(ml.source = 'system', v_duration_s, new.trail_hectares),
               details = ml.details || jsonb_strip_nulls(jsonb_build_object(
                   'trail_distance', new.trail_distance,
                   'trail_hectares', new.trail_hectares,
                   'trail_percentage_overlap', new.trail_percentage_overlap,
                   'metrics_calculated', true
               ))
         where ml.id = (
             select ml2.id
               from public.map_log ml2
              where ml2.entity_type = 'trail'
                and ml2.entity_id = new.id
                and ml2.action = 'trail.closed'
              order by ml2.id desc
              limit 1
         );
        return null;
    end if;

    return null;
end
$$;

create trigger map_log_trail_started
    after insert on public.trails
    for each row
    when (new.end_time is null)
    execute function public.trg_map_log_trail();

create trigger map_log_trail_closed
    after update on public.trails
    for each row
    when (new.end_time is distinct from old.end_time
          or new.metrics_calculated is distinct from old.metrics_calculated)
    execute function public.trg_map_log_trail();

create trigger map_log_trail_deleted
    after delete on public.trails
    for each row
    execute function public.trg_map_log_trail();
