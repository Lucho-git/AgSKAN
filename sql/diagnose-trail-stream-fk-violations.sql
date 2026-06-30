-- =============================================================================
-- FK VIOLATION DIAGNOSTIC: trail_stream.trail_id → trails.id
-- 
-- Error: insert or update on table "trail_stream" violates foreign key 
-- constraint "trail_stream_trail_id_fkey"
-- 
-- Root cause: The background_sync RPC guard checks:
--   IF NOT EXISTS (SELECT 1 FROM trails WHERE id = ? AND end_time IS NOT NULL)
-- This is BACKWARDS. When a trail is completely deleted (not just closed),
-- NOT EXISTS returns true and the INSERT fires against a missing FK.
-- 
-- Fix: Change guard to IF EXISTS (... AND end_time IS NULL) — only insert
-- when the trail actually exists and is still open.
-- =============================================================================

-- 1. How many orphaned trail_stream rows exist RIGHT NOW?
-- Count points whose trail_id doesn't exist in the trails table.
SELECT 
    ts.trail_id,
    ts.operation_id,
    COUNT(*) AS orphaned_points,
    MIN(ts.timestamp) AS first_point,
    MAX(ts.timestamp) AS last_point
FROM trail_stream ts
LEFT JOIN trails t ON t.id = ts.trail_id
WHERE t.id IS NULL
GROUP BY ts.trail_id, ts.operation_id
ORDER BY orphaned_points DESC;

-- 2. Who are the operations these orphaned points belong to?
SELECT 
    ts.trail_id,
    ts.operation_id,
    op.name AS operation_name,
    op.master_map_id,
    COUNT(*) AS point_count,
    MIN(ts.timestamp) AS first_point,
    MAX(ts.timestamp) AS last_point
FROM trail_stream ts
LEFT JOIN trails t ON t.id = ts.trail_id
LEFT JOIN operations op ON op.id = ts.operation_id
WHERE t.id IS NULL
GROUP BY ts.trail_id, ts.operation_id, op.name, op.master_map_id
ORDER BY point_count DESC;

-- 3. Check if these trail IDs ever existed (may have been deleted)
SELECT id, vehicle_id, start_time, end_time, operation_id
FROM trails 
WHERE id IN (
    'af439be6-fefe-436c-b962-3b4ea9c97b0b',
    '7cb35dea-0856-41c2-b345-14c5c1e2aac1',
    'd8e23d3e-bea8-4a6d-9107-2db3b7a8ef51',
    '568f8eb2-3db5-49fa-b98a-d76a686045ae',
    'f2a0e997-298b-463a-bba9-2e5896b6284b'
);

-- 4. Which vehicles are currently marked as trailing, and what open trails
--    do they actually have? This helps identify clients whose native sync
--    may still be configured with a stale trail_id.
--    Note: vehicle_state has is_trailing (boolean) but no trail_id column.
--    The stale trail_ids live in the native plugin's HTTP template on-device.
SELECT 
    vs.vehicle_id,
    vs.is_trailing,
    vs.last_update,
    vs.master_map_id,
    t.id AS current_open_trail_id,
    t.start_time AS trail_started,
    EXTRACT(EPOCH FROM (now() - t.start_time))/60 AS trail_age_minutes
FROM vehicle_state vs
LEFT JOIN trails t ON t.vehicle_id = vs.vehicle_id AND t.end_time IS NULL
WHERE vs.is_trailing = true
ORDER BY vs.last_update DESC;

-- 5. What orphaned trail_ids are still actively being hit? 
--    Look at trail_stream points created in the last 24h with missing FK.
SELECT 
    ts.trail_id,
    COUNT(*) AS recent_orphaned_points,
    MAX(ts.timestamp) AS last_orphan_insert
FROM trail_stream ts
LEFT JOIN trails t ON t.id = ts.trail_id
WHERE t.id IS NULL
  AND ts.timestamp > now() - interval '24 hours'
GROUP BY ts.trail_id
ORDER BY last_orphan_insert DESC;

-- 6. Overall health: how many total trail_stream rows have valid FK?
SELECT 
    COUNT(*) AS total_trail_stream_rows,
    COUNT(*) FILTER (WHERE t.id IS NOT NULL) AS valid_fk,
    COUNT(*) FILTER (WHERE t.id IS NULL) AS orphaned,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE t.id IS NULL) / NULLIF(COUNT(*), 0), 
        2
    ) AS orphaned_pct
FROM trail_stream ts
LEFT JOIN trails t ON t.id = ts.trail_id;

-- 7. Clean up all orphaned rows (UNCOMMENT TO RUN):
-- DELETE FROM trail_stream
-- WHERE id IN (
--     SELECT ts.id FROM trail_stream ts
--     LEFT JOIN trails t ON t.id = ts.trail_id
--     WHERE t.id IS NULL
-- );
