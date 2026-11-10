-- update_generate_spray_records_with_intervals
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Updated generate_spray_records with contiguous segment (interval) detection.
-- Uses the "gaps and islands" technique to split trail_stream points within
-- each field into contiguous visits. Each visit = one interval.
-- The spray record aggregates all intervals, and stores them in the intervals column.

CREATE OR REPLACE FUNCTION generate_spray_records(trail_id_param uuid)
RETURNS jsonb AS $$
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
    -- Get trail info
    SELECT id, vehicle_id, operation_id, trail_width, start_time, end_time
    INTO v_trail
    FROM trails WHERE id = trail_id_param;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trail not found');
    END IF;

    v_vehicle_id := v_trail.vehicle_id;
    v_operation_id := v_trail.operation_id;
    v_trail_width := COALESCE(v_trail.trail_width, 3);

    -- Get master_map_id from the operation
    SELECT master_map_id INTO v_master_map_id
    FROM operations WHERE id = v_operation_id;

    IF v_master_map_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Operation has no master_map_id');
    END IF;

    -- Get vehicle marker info for vehicle_type and swath
    SELECT vehicle_marker INTO v_vehicle_marker
    FROM vehicle_state WHERE vehicle_id = v_vehicle_id;

    -- Get operator name from profiles
    SELECT full_name INTO v_operator_name
    FROM profiles WHERE id = v_vehicle_id;

    -- Step 1: Find all trail_stream points and mark which field(s) they're inside.
    -- Step 2: Use gaps-and-islands to detect contiguous segments per field.
    -- Step 3: Aggregate intervals per field and insert spray records.
    WITH point_fields AS (
        -- For each trail_stream point, find which field it's in
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
    island_marks AS (
        -- Detect island boundaries: a new island starts when the field changes
        -- OR when there's a time gap (previous point was in a different field or no point)
        SELECT 
            *,
            LAG(field_id) OVER (ORDER BY timestamp) AS prev_field_id
        FROM point_fields
    ),
    islands AS (
        -- Assign an island ID: increments whenever field_id changes from previous
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
        -- Aggregate each island into an interval
        SELECT
            field_id,
            field_name,
            MIN(timestamp) AS entry_time,
            MAX(timestamp) AS exit_time,
            EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp)))::int AS duration_seconds,
            ST_Length(ST_MakeLine(coordinate ORDER BY timestamp)::geography) / 1000 AS distance_km,
            COUNT(*) AS point_count,
            island_id
        FROM islands
        GROUP BY field_id, field_name, island_id
        HAVING COUNT(*) >= 1
    ),
    field_summary AS (
        -- Aggregate all intervals per field into a single spray record
        SELECT
            field_id,
            field_name,
            MIN(entry_time) AS start_time,
            MAX(exit_time) AS end_time,
            SUM(duration_seconds)::int AS duration_seconds,
            SUM(distance_km) AS distance_km,
            SUM(point_count)::int AS point_count,
            -- Build intervals JSON array
            jsonb_agg(jsonb_build_object(
                'entry_time', entry_time,
                'exit_time', exit_time,
                'duration_seconds', duration_seconds,
                'distance_km', distance_km,
                'point_count', point_count
            ) ORDER BY entry_time) AS intervals
        FROM field_intervals
        GROUP BY field_id, field_name
        HAVING SUM(point_count) >= 2
    )
    INSERT INTO spray_records (
        trail_id, field_id, master_map_id, operation_id, vehicle_id,
        operator_id, operator_name, operator_confirmed,
        start_time, end_time, duration_seconds,
        field_path, area_hectares, distance_km, point_count,
        vehicle_type, swath_width, intervals
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
        -- Rebuild the full field path from all points in this field
        (
            SELECT ST_MakeLine(ts.coordinate ORDER BY ts.timestamp)
            FROM trail_stream ts
            WHERE ts.trail_id = trail_id_param
              AND ST_Contains(
                (SELECT boundary FROM fields WHERE field_id = fs.field_id),
                ts.coordinate
              )
        ),
        -- Area = trail_width × total distance / 10000
        (v_trail_width * fs.distance_km * 1000) / 10000,
        fs.distance_km,
        fs.point_count,
        v_vehicle_marker->>'type',
        (v_vehicle_marker->>'swath')::numeric,
        fs.intervals
    FROM field_summary fs;

    GET DIAGNOSTICS v_record_count = ROW_COUNT;

    -- Return the created records for the confirmation popup
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
        'intervals', sr.intervals
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION generate_spray_records(uuid) TO authenticated;
