-- ============================================================================
-- Fix trails that can never be closed: statement timeouts on large trails
--
-- Symptom (Gowrie Farms harvest operation, 2026-10-27/28):
--   "Error processing trail <id>: canceling statement due to statement timeout"
--   on map load - that trail blocks the others from rendering, then they load.
--
-- Root causes fixed here
-- ----------------------------------------------------------------------------
-- 1. generate_spray_records filled a temp table (point_field_map) with no
--    statistics, so the planner compared every trail point against every field
--    on the map (~1.8M ST_Contains) instead of the handful of fields inside the
--    trail bbox. Measured on a 19,109-point trail: 19.2 s total, of which
--    18.6 s was that single UPDATE. The `authenticated` role has
--    statement_timeout = 8 s, so close_trail_fast caught the cancel and
--    returned success=false with the raw timeout message.
--    Fix: ANALYZE the temp table. Same trail now measures ~0.45 s (43x).
--
-- 2. close_stale_trails skipped *every* open trail of a vehicle that was
--    currently trailing. During harvest the machines trail all day, so nothing
--    closed their previous trails and they accumulated (7 open trails in one
--    operation, two of them 15k-19k points). The client then tried to close
--    them all on map load - and hit cause 1.
--    Fix: when a vehicle is trailing, only its newest open trail is protected;
--    older abandoned ones are still closed.
--
-- Safe to re-run: both blocks are idempotent (they no-op when already patched).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. generate_spray_records: give the planner statistics for point_field_map
-- ---------------------------------------------------------------------------
do $patch$
declare
  d text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generate_spray_records';

  if d is null then
    raise exception 'generate_spray_records not found';
  end if;

  if position('ANALYZE point_field_map' in d) = 0 then
    d := replace(d,
      E'    UPDATE point_field_map pfm\n',
      E'    -- Without statistics the planner compares every point against every field\n    -- on the map (~1.8M ST_Contains) instead of the handful in the trail bbox.\n    ANALYZE point_field_map;\n\n    UPDATE point_field_map pfm\n');
    execute d;
    raise notice 'generate_spray_records patched';
  else
    raise notice 'generate_spray_records already patched';
  end if;
end $patch$;

-- ---------------------------------------------------------------------------
-- 2. close_stale_trails: keep closing older trails of an actively trailing van
-- ---------------------------------------------------------------------------
do $patch$
declare
  d text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'close_stale_trails';

  if d is null then
    raise exception 'close_stale_trails not found';
  end if;

  if position('tr2.start_time desc' in d) = 0 then
    d := replace(d,
      'and vs.last_update > now() - max_idle',
      E'and vs.last_update > now() - max_idle\n                          -- Only protect the trail the vehicle is actually recording;\n                          -- older abandoned trails still need closing.\n                          and tr.id = (select tr2.id from public.trails tr2\n                                        where tr2.vehicle_id = tr.vehicle_id\n                                          and tr2.end_time is null\n                                        order by tr2.start_time desc limit 1)');
    execute d;
    raise notice 'close_stale_trails patched';
  else
    raise notice 'close_stale_trails already patched';
  end if;
end $patch$;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- Both should return true:
--   select position('ANALYZE point_field_map' in pg_get_functiondef('public.generate_spray_records(uuid)'::regprocedure)) > 0;
--   select position('tr2.start_time desc' in pg_get_functiondef('public.close_stale_trails(interval,integer,boolean,integer)'::regprocedure)) > 0;
--
-- Which stale trails would the maintenance job close right now?
--   select * from public.close_stale_trails('4 hours', 25, true, 60000);
--
-- Close them for real (also runs every 30 min via pg_cron):
--   select * from public.close_stale_trails('4 hours', 25, false, 60000);