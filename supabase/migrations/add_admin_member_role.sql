-- ============================================================================
-- Admin dashboard: include each connected member's ACCOUNT TYPE (profiles.role:
-- manager / operator / viewer) in admin_dashboard_query, so the admin page can
-- display and change it. Applies on top of the current live definition.
-- Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_dashboard_query()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    WITH map_vehicle_stats AS (
        SELECT
            p.master_map_id,
            COUNT(*)::int AS connected_vehicles,
            COUNT(*) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM vehicle_state vs
                    WHERE vs.vehicle_id = p.id
                      AND vs.master_map_id = p.master_map_id
                      AND vs.last_update > NOW() - INTERVAL '24 hours'
                )
            )::int AS vehicles_active_24h,
            COUNT(*) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM vehicle_state vs
                    WHERE vs.vehicle_id = p.id
                      AND vs.master_map_id = p.master_map_id
                      AND vs.last_update > NOW() - INTERVAL '7 days'
                )
            )::int AS vehicles_active_7d,
            COUNT(*) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM vehicle_state vs
                    WHERE vs.vehicle_id = p.id
                      AND vs.master_map_id = p.master_map_id
                      AND vs.last_update > NOW() - INTERVAL '30 days'
                )
            )::int AS vehicles_active_30d,
            MAX(vs_latest.last_update) AS latest_vehicle_update
        FROM profiles p
        LEFT JOIN vehicle_state vs_latest
            ON vs_latest.vehicle_id = p.id
            AND vs_latest.master_map_id = p.master_map_id
        WHERE p.master_map_id IS NOT NULL
        GROUP BY p.master_map_id
    ),
    map_member_stats AS (
        SELECT
            p.master_map_id,
            COUNT(*)              AS total_members,
            MAX(p.last_sign_in)   AS latest_member_sign_in,
            COUNT(*) FILTER (WHERE p.last_sign_in > NOW() - INTERVAL '7 days')   AS members_active_7d,
            COUNT(*) FILTER (WHERE p.last_sign_in > NOW() - INTERVAL '30 days')  AS members_active_30d
        FROM profiles p
        WHERE p.master_map_id IS NOT NULL
        GROUP BY p.master_map_id
    ),
    map_members_detail AS (
        SELECT
            p.master_map_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'full_name', p.full_name,
                    'email', p.email,
                    'last_sign_in', p.last_sign_in,
                    'last_location_update', vs.last_update,
                    'is_owner', (p.id = mm.master_user_id),
                    'role', p.role,
                    'map_role', p.map_role
                ) ORDER BY (p.id = mm.master_user_id) DESC, p.last_sign_in DESC NULLS LAST
            ) AS members
        FROM profiles p
        JOIN master_maps mm ON mm.id = p.master_map_id
        LEFT JOIN vehicle_state vs ON vs.vehicle_id = p.id
        WHERE p.master_map_id IS NOT NULL
        GROUP BY p.master_map_id
    ),
    dashboard_rows AS (
        SELECT
            p.id                                          AS owner_id,
            p.full_name                                   AS owner_name,
            p.email                                       AS owner_email,
            p.mobile                                      AS owner_phone,
            p.company_name,
            p.last_sign_in                                AS owner_last_sign_in,
            p.created_at                                  AS owner_created_at,

            mm.id                                         AS master_map_id,
            mm.map_name,
            mm.created_at                                 AS map_created_at,

            COALESCE(us.subscription, 'FREE')             AS subscription,
            COALESCE(us.subscription_status, 'free')      AS subscription_status,
            COALESCE(us.current_seats, 1)                 AS allowed_seats,
            us.payment_interval,
            us.next_billing_date,
            COALESCE(us.founder, false)                   AS founder,

            COALESCE(mvs.connected_vehicles, 0)           AS connected_vehicles,
            COALESCE(mms.total_members, 0)                AS total_members,
            GREATEST(COALESCE(mvs.connected_vehicles, 0) - COALESCE(us.current_seats, 1), 0) AS seats_over_limit,
            CASE
                WHEN COALESCE(mvs.connected_vehicles, 0) > COALESCE(us.current_seats, 1) THEN 'EXCEEDING'
                WHEN COALESCE(mvs.connected_vehicles, 0) = COALESCE(us.current_seats, 1) THEN 'AT_LIMIT'
                ELSE 'OK'
            END                                           AS seat_status,

            mvs.latest_vehicle_update,
            COALESCE(mvs.vehicles_active_24h, 0)          AS vehicles_active_24h,
            COALESCE(mvs.vehicles_active_7d, 0)           AS vehicles_active_7d,
            COALESCE(mvs.vehicles_active_30d, 0)          AS vehicles_active_30d,

            mms.latest_member_sign_in,
            COALESCE(mms.members_active_7d, 0)            AS members_active_7d,
            COALESCE(mms.members_active_30d, 0)           AS members_active_30d,

            COALESCE(mmd.members, '[]'::jsonb)            AS members,

            EXISTS (
                SELECT 1 FROM vehicle_state vs
                WHERE vs.vehicle_id = p.id
                  AND vs.master_map_id = mm.id
            )                                             AS owner_connected
        FROM profiles p
            JOIN master_maps mm             ON mm.master_user_id = p.id
            LEFT JOIN user_subscriptions us ON us.user_id = p.id
            LEFT JOIN map_vehicle_stats mvs ON mvs.master_map_id = mm.id
            LEFT JOIN map_member_stats  mms ON mms.master_map_id = mm.id
            LEFT JOIN map_members_detail mmd ON mmd.master_map_id = mm.id
        WHERE COALESCE(mvs.connected_vehicles, 0) > 0
           OR COALESCE(mms.total_members, 0) > 0
        ORDER BY
            CASE WHEN COALESCE(mvs.connected_vehicles, 0) > COALESCE(us.current_seats, 1)
                 THEN 0 ELSE 1 END,
            COALESCE(mvs.connected_vehicles, 0) DESC,
            COALESCE(mms.total_members, 0) DESC
    )
    SELECT jsonb_agg(to_jsonb(d)) INTO result FROM dashboard_rows d;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$function$
