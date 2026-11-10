-- close_stale_trails_points_budget
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Add a per-run points budget so each cron tick stays short. Replaces the
-- 3-argument signature: drop it first, otherwise create-or-replace would
-- only add an overload and 3-arg calls would become ambiguous.
drop function if exists public.close_stale_trails(interval, int, boolean);

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

            if v_pts >= 2 then
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

            v_result := public.close_trail_fast(v_trail.id, v_end, v_simple, v_detailed);

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
    'Closes open trails idle longer than max_idle (default 4 hours). Skips vehicles whose state is fresh and trailing. Batched with a points budget, logged, per-trail error isolation. Use dry_run => true to preview.';

revoke all on function public.close_stale_trails(interval, int, boolean, int) from public;
revoke all on function public.close_stale_trails(interval, int, boolean, int) from anon, authenticated;
grant execute on function public.close_stale_trails(interval, int, boolean, int) to service_role;
