-- ============================================================================
-- Schedule the stale-trail auto-close safety net (pg_cron)
-- ============================================================================
-- close_stale_trails() lives in add_close_stale_trails.sql.
-- It closes open trails with no stream activity for more than 4 hours,
-- while protecting vehicles whose state is fresh and still trailing.
--
-- Every 30 minutes; each run closes at most 25 trails OR ~60k points,
-- whichever comes first, so a huge backlog drains gradually and each run
-- stays comfortably under busy statement limits. Re-running this statement
-- updates the existing job (pg_cron named schedule).
-- ============================================================================

select cron.schedule(
    'close-stale-trails',
    '*/30 * * * *',
    $cron$select public.close_stale_trails('4 hours', 25, false, 60000);$cron$
);
