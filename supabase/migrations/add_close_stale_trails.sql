-- ============================================================================
-- Server-side auto-close for stale / interrupted trails
-- ============================================================================
-- Safety net for trails that never got closed because the recording device
-- died, crashed, or lost connectivity mid-session. Without this, an open
-- trail (end_time IS NULL):
--   * is drawn as a live "active trail" on every other user's map
--     (otherActiveTrailStore trusts end_time IS NULL), and
--   * never self-heals, because device-side auto-close requires that same
--     device to re-open the app, and viewer-side checks only close extra
--     duplicates.
--
-- How it works
--   * "Idle" = no new trail_stream point for `max_idle` (default 4 hours).
--     Trails with no stream points fall back to start_time.
--   * Safety guard: a trail is skipped if its vehicle's vehicle_state was
--     updated within `max_idle` AND is_trailing = true (a live session).
--     A vehicle whose state itself has gone silent (crashed device with
--     is_trailing stuck true) is NOT protected — that is the exact case
--     this job exists to clean up.
--   * Closing mirrors the client stop-trail flow: build path + detailed path
--     (LINESTRING M, epoch-millis measures; simplified path via Douglas-
--     Peucker 0.000005 deg) from trail_stream, call close_trail_fast
--     (stores paths, generates spray records from the stream, deletes the
--     stream), then calculate_trail_metrics (hectares/distance/overlap).
--   * Every action is logged to trail_autoclose_log; per-trail exceptions
--     are isolated so one bad trail cannot stop the batch.
--   * Re-runnable: closed trails have end_time and drop out of selection.
--     If the operator's device later performs a real close with its full
--     local path, close_trail_fast simply overwrites end_time/path (no
--     duplicate spray records — the generation input stream is already
--     empty by then).
--
-- Scheduling lives in schedule_close_stale_trails.sql (kept separate so the
-- function can be dry-run before the job goes live).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.trail_autoclose_log (
    id          bigint generated always as identity primary key,
    trail_id    uuid not null,
    vehicle_id  uuid,
    last_point  timestamptz,
    point_count int,
    closed      boolean not null default false,
    error       text,
    created_at  timestamptz not null default now()
);

comment on table public.trail_autoclose_log is
    'Audit log for close_stale_trails() — server-side auto-close of interrupted trails';

create index if not exists trail_autoclose_log_trail_id_idx
    on public.trail_autoclose_log (trail_id);
create index if not exists trail_autoclose_log_created_at_idx
    on public.trail_autoclose_log (created_at desc);

-- Server-side only: RLS on with no policies. cron/postgres bypasses RLS.
alter table public.trail_autoclose_log enable row level security;
revoke all on public.trail_autoclose_log from anon, authenticated;
grant  all on public.trail_autoclose_log to service_role;

-- ---------------------------------------------------------------------------
-- close_stale_trails()
-- ---------------------------------------------------------------------------
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
    'Closes open trails idle longer than max_idle (default 4 hours). Skips vehicles whose state is fresh and trailing. Batched with a points budget, logged, per-trail error isolation. Use dry_run => true to preview.';

-- Maintenance function: server-side callers only (cron / service role)
revoke all on function public.close_stale_trails(interval, int, boolean, int) from public;
revoke all on function public.close_stale_trails(interval, int, boolean, int) from anon, authenticated;
grant execute on function public.close_stale_trails(interval, int, boolean, int) to service_role;
