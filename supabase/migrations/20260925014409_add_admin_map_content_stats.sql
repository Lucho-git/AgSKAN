-- ============================================================================
-- Admin dashboard: per-map content stats — mapped fields + combined hectares,
-- trails recorded, and markers placed — shown in the "Map & Plan" card and the
-- table-row size badge. Only callers with user_settings.dev_tools_enabled get
-- through — the same gate admin_dashboard_query() uses. Safe to re-run.
--
-- NOTE: supersedes the earlier admin_map_field_stats() (fields only), which is
-- dropped below — CREATE OR REPLACE can't change a function's return type.
-- Trail/marker exclusions mirror what the app itself lists: auto travel
-- segments (source = 'auto_travel') don't count as recorded trails, and
-- soft-deleted markers (deleted = true) don't count as placed.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_map_field_stats();

CREATE OR REPLACE FUNCTION public.admin_map_content_stats()
 RETURNS TABLE(master_map_id uuid, field_count int, field_hectares numeric, trail_count int, marker_count int)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    caller_id uuid;
    is_dev boolean;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT dev_tools_enabled INTO is_dev
    FROM user_settings
    WHERE user_id = caller_id;

    IF is_dev IS NOT TRUE THEN
        RAISE EXCEPTION 'Forbidden - developer mode not enabled';
    END IF;

    RETURN QUERY
    SELECT
        mm.id,
        COALESCE(f.field_count, 0),
        COALESCE(f.field_hectares, 0),
        COALESCE(t.trail_count, 0),
        COALESCE(m.marker_count, 0)
    FROM master_maps mm
    LEFT JOIN (
        SELECT fld.map_id, COUNT(*)::int AS field_count,
               COALESCE(SUM(fld.area), 0)::numeric AS field_hectares
        FROM fields fld
        GROUP BY fld.map_id
    ) f ON f.map_id = mm.id
    LEFT JOIN (
        SELECT op.master_map_id, COUNT(*)::int AS trail_count
        FROM trails t
        JOIN operations op ON op.id = t.operation_id
        WHERE t.source IS DISTINCT FROM 'auto_travel'
        GROUP BY op.master_map_id
    ) t ON t.master_map_id = mm.id
    LEFT JOIN (
        SELECT mk.master_map_id, COUNT(*)::int AS marker_count
        FROM map_markers mk
        WHERE mk.deleted IS NOT TRUE
        GROUP BY mk.master_map_id
    ) m ON m.master_map_id = mm.id;
END;
$fn$;

-- New functions default to EXECUTE for PUBLIC — lock that down.
REVOKE ALL ON FUNCTION public.admin_map_content_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_map_content_stats() TO authenticated;
