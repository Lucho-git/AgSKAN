-- ============================================================================
-- Admin global farm map: every farm (master map) placed on one map, with its
-- team, vehicles and content counts, plus simplified field boundaries.
-- Only callers with user_settings.dev_tools_enabled get through — the same
-- gate admin_dashboard_query() uses. Safe to re-run.
--
-- TEST / DUPLICATE MAPS
-- Test maps often carry the same boundaries as a real client's farm, so
-- showing everything would stack the same paddocks on top of each other and
-- double-count hectares. Each map is therefore classified:
--   * manual   — an admin flagged it (admin_map_flags); always wins, both ways
--   * internal — owned by an AgSKAN staff/tester account (dev tools or admin
--                flag on the owner, or an @agskan.com / @skanfarming.com email)
--   * name     — the map name contains "test", "testing" or "demo"
--   * duplicate — at least half of its fields sit on the same spot as fields
--                of another map that outranks it (real before test, then more
--                members, more recent activity, more fields, older), or it has
--                no members and copies a map already presumed to be a test.
-- The client hides is_test maps by default and can show them on request.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_map_flags (
    master_map_id uuid PRIMARY KEY REFERENCES public.master_maps(id) ON DELETE CASCADE,
    is_test       boolean NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    uuid
);

ALTER TABLE public.admin_map_flags ENABLE ROW LEVEL SECURITY;
-- No RLS policies on purpose: access only through the SECURITY DEFINER
-- functions below.

-- ── Farms ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_global_map_farms()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    caller_id uuid;
    is_dev boolean;
    result jsonb;
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

    WITH fbase AS (
        SELECT f.map_id, f.area,
               (ST_XMin(f.boundary) + ST_XMax(f.boundary)) / 2 AS cx,
               (ST_YMin(f.boundary) + ST_YMax(f.boundary)) / 2 AS cy,
               ST_XMin(f.boundary) AS x0, ST_YMin(f.boundary) AS y0,
               ST_XMax(f.boundary) AS x1, ST_YMax(f.boundary) AS y1
        FROM fields f
        WHERE f.boundary IS NOT NULL AND NOT ST_IsEmpty(f.boundary)
    ),
    fstats AS (
        -- Median field centre, so one stray paddock doesn't drag the farm away.
        SELECT map_id,
               COUNT(*)::int AS field_count,
               COALESCE(SUM(area), 0)::numeric AS hectares,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY cx) AS lng,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY cy) AS lat,
               MIN(x0) AS x0, MIN(y0) AS y0, MAX(x1) AS x1, MAX(y1) AS y1
        FROM fbase
        GROUP BY map_id
    ),
    -- Field "signature": its centre snapped to a ~100 m grid.
    sig AS (
        SELECT DISTINCT map_id, round(cx::numeric, 3) AS sx, round(cy::numeric, 3) AS sy
        FROM fbase
    ),
    sigcount AS (
        SELECT map_id, COUNT(*)::int AS n FROM sig GROUP BY map_id
    ),
    mem AS (
        SELECT p.master_map_id,
               COUNT(*)::int AS members,
               MAX(p.last_sign_in) AS last_sign_in,
               jsonb_agg(
                   jsonb_build_object(
                       'id', p.id,
                       'name', p.full_name,
                       'role', p.role,
                       'map_role', p.map_role,
                       'is_owner', (p.id = mm.master_user_id),
                       'last_sign_in', p.last_sign_in
                   ) ORDER BY (p.id = mm.master_user_id) DESC, p.last_sign_in DESC NULLS LAST
               ) AS members_detail
        FROM profiles p
        JOIN master_maps mm ON mm.id = p.master_map_id
        GROUP BY p.master_map_id
    ),
    veh AS (
        -- Vehicles of the members currently on the map (same rule as the
        -- dashboard's seat count).
        SELECT vs.master_map_id,
               MAX(vs.last_update) AS last_update,
               COUNT(*) FILTER (WHERE vs.last_update > now() - interval '24 hours')::int AS active_24h,
               COUNT(*) FILTER (WHERE vs.last_update > now() - interval '7 days')::int AS active_7d,
               AVG(vs.coordinates[0]) FILTER (WHERE vs.coordinates IS NOT NULL) AS lng,
               AVG(vs.coordinates[1]) FILTER (WHERE vs.coordinates IS NOT NULL) AS lat,
               jsonb_agg(
                   jsonb_build_object(
                       'id', vs.vehicle_id,
                       'name', p.full_name,
                       'type', vs.vehicle_marker->>'type',
                       'color', COALESCE(vs.vehicle_marker->>'bodyColor', vs.vehicle_marker->>'color'),
                       'last_update', vs.last_update,
                       'lng', vs.coordinates[0],
                       'lat', vs.coordinates[1],
                       'recording', (vs.is_trailing IS TRUE AND vs.last_update > now() - interval '15 minutes')
                   ) ORDER BY vs.last_update DESC NULLS LAST
               ) AS vehicles_detail
        FROM vehicle_state vs
        JOIN profiles p ON p.id = vs.vehicle_id AND p.master_map_id = vs.master_map_id
        GROUP BY vs.master_map_id
    ),
    trl AS (
        SELECT op.master_map_id, COUNT(*)::int AS trail_count
        FROM trails t
        JOIN operations op ON op.id = t.operation_id
        WHERE t.source IS DISTINCT FROM 'auto_travel'
        GROUP BY op.master_map_id
    ),
    mrk AS (
        SELECT mk.master_map_id, COUNT(*)::int AS marker_count
        FROM map_markers mk
        WHERE mk.deleted IS NOT TRUE
        GROUP BY mk.master_map_id
    ),
    base AS (
        SELECT mm.id, mm.map_name, mm.created_at,
               p.full_name AS owner_name, p.email AS owner_email, p.company_name,
               COALESCE(sub.subscription, 'FREE') AS subscription,
               COALESCE(sub.subscription_status, 'free') AS subscription_status,
               COALESCE(m.members, 0) AS members,
               COALESCE(fs.field_count, 0) AS field_count,
               GREATEST(v.last_update, m.last_sign_in) AS last_activity,
               fl.is_test AS manual,
               (us.dev_tools_enabled IS TRUE OR us.is_admin IS TRUE
                OR COALESCE(p.email, '') ~* '@(agskan\.com|skanfarming\.com)$') AS internal_owner,
               (COALESCE(mm.map_name, '') ~* '\m(test|testing|demo)\M') AS test_name
        FROM master_maps mm
        LEFT JOIN profiles p ON p.id = mm.master_user_id
        LEFT JOIN user_settings us ON us.user_id = mm.master_user_id
        LEFT JOIN user_subscriptions sub ON sub.user_id = mm.master_user_id
        LEFT JOIN mem m ON m.master_map_id = mm.id
        LEFT JOIN veh v ON v.master_map_id = mm.id
        LEFT JOIN fstats fs ON fs.map_id = mm.id
        LEFT JOIN admin_map_flags fl ON fl.master_map_id = mm.id
        WHERE COALESCE(m.members, 0) > 0 OR COALESCE(fs.field_count, 0) > 0
    ),
    ranked AS (
        SELECT b.*,
               COALESCE(b.manual, b.internal_owner OR b.test_name) AS presumed_test,
               row_number() OVER (
                   ORDER BY COALESCE(b.manual, b.internal_owner OR b.test_name) ASC,
                            b.members DESC,
                            b.last_activity DESC NULLS LAST,
                            b.field_count DESC,
                            b.created_at ASC,
                            b.id
               ) AS rk
        FROM base b
    ),
    pairs AS (
        SELECT a.map_id AS m, b.map_id AS other, COUNT(*)::int AS n
        FROM sig a
        JOIN sig b ON a.sx = b.sx AND a.sy = b.sy AND a.map_id <> b.map_id
        GROUP BY a.map_id, b.map_id
    ),
    dup AS (
        -- Name the real farm as the original where there is one, rather than
        -- another test copy of it.
        SELECT DISTINCT ON (pr.m) pr.m, pr.other, ro.map_name AS other_name, pr.n
        FROM pairs pr
        JOIN ranked rm ON rm.id = pr.m
        JOIN ranked ro ON ro.id = pr.other
        JOIN sigcount sc ON sc.map_id = pr.m
        WHERE pr.n >= 0.5 * sc.n
          AND rm.manual IS DISTINCT FROM false
          AND (ro.rk < rm.rk OR (ro.presumed_test AND rm.members = 0))
        ORDER BY pr.m, ro.presumed_test ASC, pr.n DESC, ro.rk ASC
    ),
    farms AS (
        SELECT
            r.id, r.map_name, r.created_at,
            r.owner_name, r.owner_email, r.company_name,
            r.subscription,
            (r.subscription <> 'FREE' AND r.subscription_status <> 'free') AS paid,
            r.members AS member_count,
            COALESCE(m.members_detail, '[]'::jsonb) AS members,
            COALESCE(v.vehicles_detail, '[]'::jsonb) AS vehicles,
            COALESCE(v.active_24h, 0) AS vehicles_active_24h,
            COALESCE(v.active_7d, 0) AS vehicles_active_7d,
            v.last_update AS latest_vehicle_update,
            r.last_activity,
            r.field_count,
            COALESCE(fs.hectares, 0) AS hectares,
            COALESCE(t.trail_count, 0) AS trail_count,
            COALESCE(k.marker_count, 0) AS marker_count,
            COALESCE(fs.lng, v.lng) AS lng,
            COALESCE(fs.lat, v.lat) AS lat,
            CASE WHEN fs.lng IS NOT NULL THEN 'fields'
                 WHEN v.lng IS NOT NULL THEN 'vehicles' END AS located_by,
            CASE WHEN fs.lng IS NOT NULL
                 THEN jsonb_build_array(fs.x0, fs.y0, fs.x1, fs.y1) END AS bbox,
            r.manual AS manual_flag,
            COALESCE(r.manual, r.internal_owner OR r.test_name OR d.m IS NOT NULL) AS is_test,
            to_jsonb(array_remove(ARRAY[
                CASE WHEN r.manual IS TRUE THEN 'manual' END,
                CASE WHEN r.internal_owner THEN 'internal' END,
                CASE WHEN r.test_name THEN 'name' END,
                CASE WHEN d.m IS NOT NULL THEN 'duplicate' END
            ], NULL)) AS test_reasons,
            CASE WHEN d.m IS NOT NULL
                 THEN jsonb_build_object('id', d.other, 'name', d.other_name, 'shared_fields', d.n) END AS duplicate_of
        FROM ranked r
        LEFT JOIN mem m ON m.master_map_id = r.id
        LEFT JOIN veh v ON v.master_map_id = r.id
        LEFT JOIN fstats fs ON fs.map_id = r.id
        LEFT JOIN trl t ON t.master_map_id = r.id
        LEFT JOIN mrk k ON k.master_map_id = r.id
        LEFT JOIN dup d ON d.m = r.id
    )
    SELECT jsonb_agg(to_jsonb(f) ORDER BY f.hectares DESC, f.member_count DESC)
    INTO result
    FROM farms f;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_global_map_farms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_global_map_farms() TO authenticated;

-- ── Field boundaries (simplified, paged) ────────────────────────────────────
-- ~10 m simplification and 5-decimal coordinates cut the payload by ~10x.
-- Paged so each call stays well inside the 8 s statement timeout.
CREATE OR REPLACE FUNCTION public.admin_global_map_fields(p_offset int DEFAULT 0, p_limit int DEFAULT 1500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
    caller_id uuid;
    is_dev boolean;
    result jsonb;
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

    SELECT jsonb_agg(jsonb_build_object('m', s.map_id, 'n', s.name, 'a', s.area, 'g', ST_AsGeoJSON(s.geom, 5)::jsonb))
    INTO result
    FROM (
        SELECT f.map_id, f.name, f.area,
               ST_CollectionExtract(ST_SimplifyPreserveTopology(f.boundary, 0.0001), 3) AS geom
        FROM fields f
        WHERE f.boundary IS NOT NULL
        ORDER BY f.field_id
        OFFSET GREATEST(p_offset, 0)
        LIMIT LEAST(GREATEST(p_limit, 1), 3000)
    ) s
    WHERE s.geom IS NOT NULL AND NOT ST_IsEmpty(s.geom);

    RETURN COALESCE(result, '[]'::jsonb);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_global_map_fields(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_global_map_fields(int, int) TO authenticated;

-- ── Manual test flag: true = test map, false = real client, null = automatic ─
CREATE OR REPLACE FUNCTION public.admin_set_map_test_flag(p_master_map_id uuid, p_is_test boolean)
 RETURNS void
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

    IF p_master_map_id IS NULL THEN
        RAISE EXCEPTION 'Missing map id';
    END IF;

    IF p_is_test IS NULL THEN
        DELETE FROM admin_map_flags WHERE master_map_id = p_master_map_id;
    ELSE
        INSERT INTO admin_map_flags (master_map_id, is_test, updated_at, updated_by)
        VALUES (p_master_map_id, p_is_test, now(), caller_id)
        ON CONFLICT (master_map_id)
        DO UPDATE SET is_test = EXCLUDED.is_test, updated_at = now(), updated_by = caller_id;
    END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_set_map_test_flag(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_map_test_flag(uuid, boolean) TO authenticated;
