-- update_close_stale_trails_pauses.sql
-- Pause-aware server-side auto-close: close_stale_trails now splits the built
-- geometry at `trail_pauses` windows (MULTILINESTRING), matching the client's
-- close-time split, so a cron-closed paused trail renders with a gap instead
-- of a connector line. Trails without pauses keep the legacy single
-- LINESTRING / LINESTRING M shapes (byte-identical behaviour).
--
-- Same rule as the client: the break lands between the last pre-pause point
-- and the first post-resume point (segment number = pauses strictly before
-- the point's timestamp). Segments with a single point are dropped (cannot
-- form a line), so some trails may close with NULL paths when nothing usable
-- remains — identical to a zero-point close.
--
-- Safe to apply any time (function replacement only). Requires trail_pauses
-- to exist (add_trail_pauses.sql).

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
    v_trail    record;
    v_pts      int;
    v_last_ts  timestamptz;
    v_detailed text;
    v_simple   text;
    v_end      timestamptz;
    v_result   jsonb;
    v_metrics  jsonb;
    v_err      text;
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
               -- idle long enough (fall back to start_time when there are no points)
               and coalesce(
                       (select max(ts.timestamp)
                          from public.trail_stream ts
                         where ts.trail_id = tr.id),
                       tr.start_time
                   ) < now() - max_idle
               -- never touch a vehicle whose state is fresh and says it is trailing
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
            -- Points budget keeps each run short (cron statement timeouts);
            -- a trail is processed while the points processed BEFORE it are
            -- under budget. Always processes at least the first candidate.
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

        -- No points -> close at start_time (honest zero-duration trail)
        v_end := coalesce(v_last_ts, v_trail.start_time, now());

        if dry_run then
            return query
                select v_trail.id, v_trail.vehicle_id, v_last_ts, v_pts, false, null::text;
            continue;
        end if;

        begin
            v_detailed := null;
            v_simple   := null;

            -- Build the same two path formats the client produces on stop:
            --   detailed   : LINESTRING M — lon lat epoch-millis
            --   simplified : LINESTRING — Douglas-Peucker tolerance 0.000005 degrees
            if v_pts >= 2 then
                if exists (select 1 from public.trail_pauses tp where tp.trail_id = v_trail.id) then
                    -- Pause-aware: one part per work segment; ST_Multi keeps a
                    -- uniform MULTILINESTRING even if only one part survives.
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
                               ), 4326) as p2
                          from public.trail_stream ts
                         where ts.trail_id = v_trail.id
                    ),
                    assigned as (
                        select p.timestamp, p.pm, p.p2,
                               (select count(*)
                                  from public.trail_pauses tp
                                 where tp.trail_id = v_trail.id
                                   and tp.paused_at < p.timestamp) as seg_no
                          from pts p
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

            v_result := public.close_trail_fast(v_trail.id, v_end, v_simple, v_detailed);

            if coalesce((v_result->>'success')::boolean, false) then
                -- Fill in distance/hectares/overlap like the app does after close
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
            -- Isolate per-trail failures so the rest of the batch still runs
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
    'Closes open trails idle longer than max_idle (default 4 hours). Skips vehicles whose state is fresh and trailing. Splits geometry at trail_pauses windows (MULTILINESTRING) when pauses exist. Batched with a points budget, logged, per-trail error isolation. Use dry_run => true to preview.';

-- Maintenance function: server-side callers only (cron / service role)
revoke all on function public.close_stale_trails(interval, int, boolean, int) from public;
revoke all on function public.close_stale_trails(interval, int, boolean, int) from anon, authenticated;
grant execute on function public.close_stale_trails(interval, int, boolean, int) to service_role;
