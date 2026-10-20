-- rebuild_null_path_trails.sql
-- Rebuild geometry for closed trails whose path was never stored, using the
-- trail_stream points that were left behind.
--
-- Why this exists: some closes (notably the 2026-06-30 bulk end_time backfill)
-- stamped end_time on trails without building any geometry, so path and
-- detailed_path stayed NULL while the full point stream remained in
-- trail_stream. Those rows render as "0 km" in Trail History, and the stream
-- points are the ONLY copy of their track — they must be rebuilt, never
-- deleted as empty trails.
--
-- close_stale_trails (fix_close_stale_trails_zero_points.sql) deletes trails
-- with fewer than 2 points. That is only safe because such a trail has nothing
-- to rebuild. A trail with >= 2 points is never treated as empty.
--
-- The geometry expressions below are copied verbatim from
-- update_close_stale_trails_pause_geometry.sql so a rebuilt trail is
-- byte-identical to one closed by the cron or by the app.
--
-- Both functions are additive and non-destructive: they never delete points
-- unless delete_points => true is passed explicitly.

-- ─────────────────────────────────────────────────────────────────────────────
-- Single trail
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.rebuild_trail_geometry_from_stream(
    trail_id_param uuid,
    force         boolean default false,
    delete_points boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_exists       boolean;
    v_has_path     boolean;
    v_pts          int;
    v_last_ts      timestamptz;
    v_detailed     text;
    v_simple       text;
    v_pause_detailed text;
    v_pause_simple text;
    v_metrics      jsonb;
    v_metrics_err  text;
    v_had_pauses   boolean := false;
begin
    select true, (path is not null)
      into v_exists, v_has_path
      from public.trails
     where id = trail_id_param;

    if not coalesce(v_exists, false) then
        return jsonb_build_object('success', false, 'error', 'Trail does not exist');
    end if;

    if v_has_path and not force then
        return jsonb_build_object('success', false, 'error', 'Trail already has a path (pass force => true to overwrite)');
    end if;

    select count(*), max(ts.timestamp)
      into v_pts, v_last_ts
      from public.trail_stream ts
     where ts.trail_id = trail_id_param;

    if coalesce(v_pts, 0) < 2 then
        return jsonb_build_object(
            'success', false,
            'error', 'Trail has fewer than 2 stream points; nothing to rebuild',
            'point_count', coalesce(v_pts, 0)
        );
    end if;

    v_detailed := null;
    v_simple := null;
    v_pause_detailed := null;
    v_pause_simple := null;

    if exists (select 1 from public.trail_pauses tp where tp.trail_id = trail_id_param) then
        -- WORK parts: pause points excluded, split at pause gaps.
        with pts as (
            select ts.timestamp,
                   ST_SetSRID(ST_MakePointM(
                       ST_X(ts.coordinate::geometry),
                       ST_Y(ts.coordinate::geometry),
                       round(extract(epoch from ts.timestamp) * 1000)::float8
                   ), 4326) as pm,
                   ST_SetSRID(ST_MakePoint(
                       ST_X(ts.coordinate::geometry),
                       ST_Y(ts.coordinate::geometry)
                   ), 4326) as p2,
                   exists (
                       select 1 from public.trail_pauses tp
                       where tp.trail_id = trail_id_param
                         and ts.timestamp > tp.paused_at
                         and ts.timestamp < coalesce(tp.resumed_at, 'infinity'::timestamptz)
                   ) as is_pause
              from public.trail_stream ts
             where ts.trail_id = trail_id_param
        ),
        work_pts as (
            select * from pts where not is_pause
        ),
        assigned as (
            select p.timestamp, p.pm, p.p2,
                   (select count(*)
                      from public.trail_pauses tp
                     where tp.trail_id = trail_id_param
                       and tp.paused_at < p.timestamp) as seg_no
              from work_pts p
        ),
        segs as (
            select seg_no,
                   ST_MakeLine(pm order by timestamp) as det_line,
                   ST_MakeLine(p2 order by timestamp) as sim_line
              from assigned
             group by seg_no
            having count(*) >= 2
        )
        select
            ST_AsEWKT(ST_Multi(ST_Collect(det_line order by seg_no))),
            ST_AsEWKT(ST_Multi(ST_Collect(ST_Simplify(sim_line, 0.000005) order by seg_no)))
          into v_detailed, v_simple
          from segs;

        -- PAUSE parts: one dotted part per pause window.
        with pp as (
            select tp.paused_at as win_start,
                   ts.timestamp,
                   ST_SetSRID(ST_MakePointM(
                       ST_X(ts.coordinate::geometry),
                       ST_Y(ts.coordinate::geometry),
                       round(extract(epoch from ts.timestamp) * 1000)::float8
                   ), 4326) as pm,
                   ST_SetSRID(ST_MakePoint(
                       ST_X(ts.coordinate::geometry),
                       ST_Y(ts.coordinate::geometry)
                   ), 4326) as p2
              from public.trail_pauses tp
              join public.trail_stream ts
                on ts.trail_id = tp.trail_id
               and ts.timestamp > tp.paused_at
               and ts.timestamp < coalesce(tp.resumed_at, 'infinity'::timestamptz)
             where tp.trail_id = trail_id_param
        ),
        pause_parts as (
            select win_start,
                   ST_MakeLine(pm order by timestamp) as det_line,
                   ST_MakeLine(p2 order by timestamp) as sim_line
              from pp
             group by win_start
            having count(*) >= 2
        )
        select
            ST_AsEWKT(ST_Multi(ST_Collect(det_line order by win_start))),
            ST_AsEWKT(ST_Multi(ST_Collect(ST_Simplify(sim_line, 0.000005) order by win_start)))
          into v_pause_detailed, v_pause_simple
          from pause_parts;
    else        select
            ST_AsEWKT(ST_MakeLine(
                ST_SetSRID(ST_MakePointM(
                    ST_X(ts.coordinate::geometry),
                    ST_Y(ts.coordinate::geometry),
                    round(extract(epoch from ts.timestamp) * 1000)::float8
                ), 4326)
                order by ts.timestamp
            )),
            ST_AsEWKT(ST_Simplify(
                ST_MakeLine(
                    ST_SetSRID(ST_MakePoint(
                        ST_X(ts.coordinate::geometry),
                        ST_Y(ts.coordinate::geometry)
                    ), 4326)
                    order by ts.timestamp
                ),
                0.000005
            ))
          into v_detailed, v_simple
          from public.trail_stream ts
         where ts.trail_id = trail_id_param;
    end if;

    if v_detailed is null and v_simple is null then
        -- Every point fell inside a pause window: promote the pause geometry
        -- so the trail still renders instead of being stored with no path.
        if v_pause_simple is not null then
            v_had_pauses := true;
            v_simple := v_pause_simple;
            v_detailed := v_pause_detailed;
            v_pause_simple := null;
            v_pause_detailed := null;
        else
            return jsonb_build_object(
                'success', false,
                'error', 'Points could not form a line (all fell inside pause windows)',
                'point_count', v_pts
            );
        end if;
    end if;

    update public.trails
       set path                 = coalesce(v_simple::geometry, path),
           detailed_path        = coalesce(v_detailed::geometry, detailed_path),
           pause_path           = coalesce(v_pause_simple::geometry, pause_path),
           pause_detailed_path  = coalesce(v_pause_detailed::geometry, pause_detailed_path),
           end_time             = coalesce(v_last_ts, end_time),
           metrics_calculated   = false
     where id = trail_id_param;

    begin
        v_metrics := public.calculate_trail_metrics(trail_id_param);
    exception when others then
        v_metrics_err := sqlerrm;
    end;

    if delete_points then
        delete from public.trail_stream ts where ts.trail_id = trail_id_param;
    end if;

    return jsonb_build_object(
        'success', true,
        'trail_id', trail_id_param,
        'point_count', v_pts,
        'end_time', v_last_ts,
        'had_pauses', v_had_pauses or v_pause_detailed is not null,
        'metrics', v_metrics,
        'metrics_error', v_metrics_err,
        'points_deleted', delete_points
    );
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Batch: every closed trail that has no path but does have points
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.rebuild_null_path_trails(boolean);

create or replace function public.rebuild_null_path_trails(
    dry_run boolean default true
)
returns table (
    trail_id     uuid,
    operation_id uuid,
    point_count  int,
    last_point   timestamptz,
    rebuilt      boolean,
    error        text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_trail  record;
    v_result jsonb;
begin
    for v_trail in
        select tr.id,
               tr.operation_id,
               (select count(*) from public.trail_stream ts where ts.trail_id = tr.id) as pts,
               (select max(ts.timestamp) from public.trail_stream ts where ts.trail_id = tr.id) as last_ts
          from public.trails tr
         where tr.path is null
           and tr.end_time is not null
           and exists (select 1 from public.trail_stream ts where ts.trail_id = tr.id)
         order by tr.start_time asc
    loop
        if v_trail.pts < 2 then
            -- Nothing rebuildable: fewer than two points cannot form a line.
            return query
                select v_trail.id, v_trail.operation_id, v_trail.pts::int, v_trail.last_ts,
                       false, 'skipped: fewer than 2 points'::text;
            continue;
        end if;

        if dry_run then
            return query
                select v_trail.id, v_trail.operation_id, v_trail.pts::int, v_trail.last_ts,
                       false, 'dry_run'::text;
            continue;
        end if;

        begin
            v_result := public.rebuild_trail_geometry_from_stream(v_trail.id, true, false);

            return query
                select v_trail.id,
                       v_trail.operation_id,
                       v_trail.pts::int,
                       v_trail.last_ts,
                       coalesce((v_result->>'success')::boolean, false),
                       case
                           when coalesce((v_result->>'success')::boolean, false) then null
                           else coalesce(v_result->>'error', 'unknown error')
                       end;
        exception when others then
            return query
                select v_trail.id, v_trail.operation_id, v_trail.pts::int, v_trail.last_ts,
                       false, sqlerrm;
        end;
    end loop;
end;
$function$;

comment on function public.rebuild_trail_geometry_from_stream(uuid, boolean, boolean) is
    'Rebuilds path/detailed_path/pause geometry for one trail from its trail_stream points (same expressions as close_stale_trails). Refuses unless the trail has >= 2 points; never deletes points unless delete_points => true.';

comment on function public.rebuild_null_path_trails(boolean) is
    'Rebuilds every closed trail that has no path but still has trail_stream points. Runs as a dry_run by default — pass dry_run => false to apply.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Usage after a point-in-time restore (or for any future occurrence):
--
--   select * from public.rebuild_null_path_trails();          -- preview
--   select * from public.rebuild_null_path_trails(false);      -- apply
--
-- Then, once the geometry is confirmed on the map, the leftover stream rows for
-- those closed trails are redundant. This cleanup is intentionally left
-- commented out — run it only after verifying the rebuild:
--
--   delete from public.trail_stream ts
--   using public.trails tr
--   where ts.trail_id = tr.id
--     and tr.end_time is not null
--     and tr.path is not null;
-- ─────────────────────────────────────────────────────────────────────────────
