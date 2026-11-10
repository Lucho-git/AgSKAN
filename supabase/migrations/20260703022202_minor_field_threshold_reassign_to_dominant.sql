-- minor_field_threshold_reassign_to_dominant
-- Applied through the Supabase MCP; text copied from the recorded migration.


CREATE OR REPLACE FUNCTION public.generate_spray_records(trail_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_trail RECORD;
    v_master_map_id uuid;
    v_vehicle_id uuid;
    v_operation_id uuid;
    v_trail_width numeric;
    v_vehicle_marker jsonb;
    v_operator_name text;
    v_record_count int := 0;
    v_records jsonb := '[]'::jsonb;
BEGIN
    SELECT id, vehicle_id, operation_id, trail_width, start_time, end_time
    INTO v_trail
    FROM trails WHERE id = trail_id_param;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trail not found');
    END IF;

    v_vehicle_id := v_trail.vehicle_id;
    v_operation_id := v_trail.operation_id;
    v_trail_width := COALESCE(v_trail.trail_width, 3);

    SELECT master_map_id INTO v_master_map_id
    FROM operations WHERE id = v_operation_id;

    IF v_master_map_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Operation has no master_map_id');
    END IF;

    SELECT vehicle_marker INTO v_vehicle_marker
    FROM vehicle_state WHERE vehicle_id = v_vehicle_id;

    SELECT full_name INTO v_operator_name
    FROM profiles WHERE id = v_vehicle_id;

    WITH point_fields AS (
        SELECT
            ts.timestamp,
            ts.coordinate,
            f.field_id,
            f.name AS field_name
        FROM trail_stream ts
        JOIN fields f ON f.map_id = v_master_map_id
        WHERE ts.trail_id = trail_id_param
          AND ST_Contains(f.boundary, ts.coordinate)
    ),
    -- Count points per field to identify dominant vs minor fields
    field_counts AS (
        SELECT field_id, field_name, COUNT(*) AS cnt
        FROM point_fields
        GROUP BY field_id, field_name
    ),
    total_count AS (
        SELECT SUM(cnt) AS total FROM field_counts
    ),
    -- Minor fields: less than 5% of total trail points (edge noise)
    minor_fields AS (
        SELECT fc.field_id
        FROM field_counts fc, total_count tc
        WHERE fc.cnt < tc.total * 0.05
    ),
    -- Dominant field: the one with the most points
    dominant_field AS (
        SELECT fc.field_id, fc.field_name
        FROM field_counts fc
        ORDER BY fc.cnt DESC
        LIMIT 1
    ),
    -- Reassign minor field points to dominant field so edge incursions
    -- stay with the primary field instead of creating spurious records
    reassigned AS (
        SELECT
            pf.timestamp,
            pf.coordinate,
            CASE
                WHEN mf.field_id IS NOT NULL AND df.field_id IS NOT NULL THEN df.field_id
                ELSE pf.field_id
            END AS field_id,
            CASE
                WHEN mf.field_id IS NOT NULL AND df.field_id IS NOT NULL THEN df.field_name
                ELSE pf.field_name
            END AS field_name
        FROM point_fields pf
        LEFT JOIN minor_fields mf ON pf.field_id = mf.field_id
        CROSS JOIN dominant_field df
    ),
    island_marks AS (
        SELECT *,
            LAG(field_id) OVER (ORDER BY timestamp) AS prev_field_id
        FROM reassigned
    ),
    islands AS (
        SELECT
            timestamp,
            coordinate,
            field_id,
            field_name,
            SUM(CASE WHEN field_id = prev_field_id THEN 0 ELSE 1 END)
                OVER (ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS island_id
        FROM island_marks
    ),
    field_intervals AS (
        SELECT
            field_id,
            field_name,
            MIN(timestamp) AS entry_time,
            MAX(timestamp) AS exit_time,
            EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp)))::int AS duration_seconds,
            ST_Length(ST_MakeLine(coordinate ORDER BY timestamp)::geography) / 1000 AS distance_km,
            COUNT(*) AS point_count,
            island_id,
            ST_AsGeoJSON(ST_MakeLine(coordinate ORDER BY timestamp)) AS path_geojson
        FROM islands
        GROUP BY field_id, field_name, island_id
        HAVING COUNT(*) >= 1
    ),
    field_summary AS (
        SELECT
            field_id,
            field_name,
            MIN(entry_time) AS start_time,
            MAX(exit_time) AS end_time,
            SUM(duration_seconds)::int AS duration_seconds,
            SUM(distance_km) AS distance_km,
            SUM(point_count)::int AS point_count,
            jsonb_agg(jsonb_build_object(
                'entry_time', entry_time,
                'exit_time', exit_time,
                'duration_seconds', duration_seconds,
                'distance_km', distance_km,
                'area_hectares', (v_trail_width * distance_km * 1000) / 10000,
                'point_count', point_count
            ) ORDER BY entry_time) AS intervals,
            jsonb_agg(jsonb_build_object(
                'entry_time', entry_time,
                'exit_time', exit_time,
                'path_geojson', path_geojson::json,
                'area_hectares', (v_trail_width * distance_km * 1000) / 10000,
                'distance_km', distance_km
            ) ORDER BY entry_time) AS interval_paths
        FROM field_intervals
        GROUP BY field_id, field_name
        HAVING SUM(point_count) >= 2
    )
    INSERT INTO spray_records (
        trail_id, field_id, master_map_id, operation_id, vehicle_id,
        operator_id, operator_name, operator_confirmed,
        start_time, end_time, duration_seconds,
        field_path, area_hectares, distance_km, point_count,
        vehicle_type, swath_width, intervals, interval_paths
    )
    SELECT
        trail_id_param,
        fs.field_id,
        v_master_map_id,
        v_operation_id,
        v_vehicle_id,
        v_vehicle_id,
        v_operator_name,
        false,
        fs.start_time,
        fs.end_time,
        fs.duration_seconds,
        -- Build field_path from reassigned points (includes edge points
        -- that were reassigned from minor fields to the dominant field)
        (
            SELECT ST_MakeLine(r.coordinate ORDER BY r.timestamp)
            FROM reassigned r
            WHERE r.field_id = fs.field_id
        ),
        (v_trail_width * fs.distance_km * 1000) / 10000,
        fs.distance_km,
        fs.point_count,
        v_vehicle_marker->>'type',
        (v_vehicle_marker->>'swath')::numeric,
        fs.intervals,
        fs.interval_paths
    FROM field_summary fs;

    GET DIAGNOSTICS v_record_count = ROW_COUNT;

    SELECT jsonb_agg(jsonb_build_object(
        'id', sr.id,
        'field_id', sr.field_id,
        'field_name', f.name,
        'start_time', sr.start_time,
        'end_time', sr.end_time,
        'duration_seconds', sr.duration_seconds,
        'area_hectares', sr.area_hectares,
        'distance_km', sr.distance_km,
        'point_count', sr.point_count,
        'vehicle_type', sr.vehicle_type,
        'operator_name', sr.operator_name,
        'operator_confirmed', sr.operator_confirmed,
        'intervals', sr.intervals,
        'interval_paths', sr.interval_paths
    )) INTO v_records
    FROM spray_records sr
    JOIN fields f ON f.field_id = sr.field_id
    WHERE sr.trail_id = trail_id_param;

    RETURN jsonb_build_object(
        'success', true,
        'trail_id', trail_id_param,
        'record_count', v_record_count,
        'records', COALESCE(v_records, '[]'::jsonb)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'trail_id', trail_id_param
    );
END;
$function$;
