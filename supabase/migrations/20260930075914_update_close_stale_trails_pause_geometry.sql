-- update_close_stale_trails_pause_geometry.sql
-- close_stale_trails: build the paused "ant line" geometry as well as the work
-- geometry so a cron-closed trail matches a device-closed trail.
--
-- With recording continuing while paused, the stream can contain points on
-- BOTH sides: work points (solid trail) and pause points (dotted connector).
-- Pause points are excluded from the work parts (they would otherwise glue
-- the transfer drive onto the end of a work segment) and collected per pause
-- window into the pause geometry instead. Trails without pauses keep the
-- legacy single LINESTRING / LINESTRING M behaviour byte-identical.
--
-- Same rule as the client partition: a stream point is a pause point when
-- `paused_at < timestamp < resumed_at` (resumed_at NULL = still paused, use
-- +infinity). Parts with a single point are dropped (cannot form a line).
--
-- Safe to apply any time (function replacement only). Requires:
--   trail_pauses (add_trail_pauses.sql), pause columns (add_trail_pause_paths.sql),
--   close_trail_fast with pause params (update_close_trail_fast_pause_geometry.sql).

create or replace function public.close_stale_trails(
    max_idle   interval default '4 hours',
    batch_size int      default 25,
    dry_run    boolean  default false,
    max_points int      default 60000
)
returns table (
    trail_id    uuid,
    vehicle_id  uuid,
    last_point  timestamptz,
    point_count int,
    closed      boolean,
    error       text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_trail        record;
    v_pts          int;
    v_last_ts      timestamptz;
    v_detailed     text;
    v_simple       text;
    v_pause_detailed text;
    v_pause_simple text;
    v_end          timestamptz;
    v_result       jsonb;
    v_metrics      jsonb;
    v_err          text;
begin
    for v_trail in
        with candidates as (
            select tr.id,
                   tr.vehicle_id,
                   tr.start_time,
                   (select max(ts.timestamp)
                      from public.trail_stream ts
                     where ts.trail_id = tr.id) as last_ts,
                   (select count(*)
                      from public.trail_stream ts
                     where ts.trail_id = tr.id) as pts,
                   coalesce(
                       (select max(ts.timestamp)
                          from public.trail_stream ts
                         where ts.trail_id = tr.id),
                       tr.start_time
                   ) as sort_key
              from public.trails tr
             where tr.end_time is null
               and coalesce(
                       (select max(ts.timestamp)
                          from public.trail_stream ts
                         where ts.trail_id = tr.id),
                       tr.start_time
                   ) < now() - max_idle
               and not exists (
                       select 1
                         from public.vehicle_state vs
                        where vs.vehicle_id = tr.vehicle_id
                          and vs.is_trailing = true
                          and vs.last_update > now() - max_idle
                   )
             order by sort_key asc
             limit batch_size
        ),
        budgeted as (
            select c.*,
                   coalesce(
                       sum(c.pts) over (
                           order by c.sort_key asc
                           rows between unbounded preceding and 1 preceding
                       ), 0) as pts_before
              from candidates c
        )
        select b.id, b.vehicle_id, b.start_time, b.last_ts, b.pts
          from budgeted b
         where b.pts_before < max_points
         order by b.sort_key asc
    loop
        v_pts     := v_trail.pts;
        v_last_ts := v_trail.last_ts;

        v_end := coalesce(v_last_ts, v_trail.start_time, now());

        if dry_run then
            return query
                select v_trail.id, v_trail.vehicle_id, v_last_ts, v_pts, false, null::text;
            continue;
        end if;

        begin
            v_detailed := null;
            v_simple   := null;
            v_pause_detailed := null;
            v_pause_simple := null;

            if v_pts >= 2 then
                if exists (select 1 from public.trail_pauses tp where tp.trail_id = v_trail.id) then
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
                                   where tp.trail_id = v_trail.id
                                     and ts.timestamp > tp.paused_at
                                     and ts.timestamp < coalesce(tp.resumed_at, 'infinity'::timestamptz)
                               ) as is_pause
                          from public.trail_stream ts
                         where ts.trail_id = v_trail.id
                    ),
                    work_pts as (
                        select * from pts where not is_pause
                    ),
                    assigned as (
                        select p.timestamp, p.pm, p.p2,
                               (select count(*)
                                  from public.trail_pauses tp
                                 where tp.trail_id = v_trail.id
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
                         where tp.trail_id = v_trail.id
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
                else
                    select
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
                     where ts.trail_id = v_trail.id;
                end if;
            end if;

            v_result := public.close_trail_fast(v_trail.id, v_end, v_simple, v_detailed, v_pause_simple, v_pause_detailed);

            if coalesce((v_result->>'success')::boolean, false) then
                v_metrics := public.calculate_trail_metrics(v_trail.id);

                insert into public.trail_autoclose_log
                    (trail_id, vehicle_id, last_point, point_count, closed, error)
                values
                    (v_trail.id, v_trail.vehicle_id, v_last_ts, v_pts, true, null);

                return query
                    select v_trail.id, v_trail.vehicle_id, v_last_ts, v_pts, true, null::text;
            else
                v_err := coalesce(v_result->>'error', 'close_trail_fast returned success=false');

                insert into public.trail_autoclose_log
                    (trail_id, vehicle_id, last_point, point_count, closed, error)
                values
                    (v_trail.id, v_trail.vehicle_id, v_last_ts, v_pts, false, v_err);

                return query
                    select v_trail.id, v_trail.vehicle_id, v_last_ts, v_pts, false, v_err;
            end if;
        exception when others then
            v_err := sqlerrm;

            insert into public.trail_autoclose_log
                (trail_id, vehicle_id, last_point, point_count, closed, error)
            values
                (v_trail.id, v_trail.vehicle_id, v_last_ts, v_pts, false, v_err);

            return query
                select v_trail.id, v_trail.vehicle_id, v_last_ts, v_pts, false, v_err;
        end;
    end loop;
end;
$function$;

comment on function public.close_stale_trails(interval, int, boolean, int) is
    'Closes open trails idle longer than max_idle (default 4 hours). Skips vehicles whose state is fresh and trailing. Splits geometry at trail_pauses windows: work parts (solid) + pause parts (dotted connector). Batched with a points budget, logged, per-trail error isolation. Use dry_run => true to preview.';
