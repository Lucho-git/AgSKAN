-- fix_generate_spray_records_returning_clause
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Fix: remove RETURNING clause from INSERT (was causing "no destination for result data")
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

    -- Find all fields on this master map that have trail_stream points within them,
    -- and create a spray record for each field.
    -- We use trail_stream (not the trail path) because we need per-field timing.
    INSERT INTO spray_records (
        trail_id, field_id, master_map_id, operation_id, vehicle_id,
        operator_id, operator_name, operator_confirmed,
        start_time, end_time, duration_seconds,
        field_path, area_hectares, distance_km, point_count,
        vehicle_type, swath_width
    )
    SELECT
        trail_id_param,
        f.field_id,
        v_master_map_id,
        v_operation_id,
        v_vehicle_id,
        v_vehicle_id,
        v_operator_name,
        false,
        MIN(ts.timestamp),
        MAX(ts.timestamp),
        EXTRACT(EPOCH FROM (MAX(ts.timestamp) - MIN(ts.timestamp)))::int,
        ST_MakeLine(ts.coordinate ORDER BY ts.timestamp),
        (v_trail_width * ST_Length(ST_MakeLine(ts.coordinate ORDER BY ts.timestamp)::geography)) / 10000,
        ST_Length(ST_MakeLine(ts.coordinate ORDER BY ts.timestamp)::geography) / 1000,
        COUNT(*),
        v_vehicle_marker->>'type',
        (v_vehicle_marker->>'swath')::numeric
    FROM trail_stream ts
    JOIN fields f ON f.map_id = v_master_map_id
    WHERE ts.trail_id = trail_id_param
      AND ST_Contains(f.boundary, ts.coordinate)
    GROUP BY f.field_id
    HAVING COUNT(*) >= 2;

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
        'operator_confirmed', sr.operator_confirmed
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
