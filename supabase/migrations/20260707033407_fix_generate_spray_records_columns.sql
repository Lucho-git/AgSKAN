-- fix_generate_spray_records_columns
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Fix generate_spray_records: trail_stream uses "timestamp" not "ts", and spray_records needs master_map_id
CREATE OR REPLACE FUNCTION public.generate_spray_records(trail_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_trail RECORD;
    v_master_map_id uuid; v_vehicle_id uuid; v_operation_id uuid;
    v_trail_width numeric; v_vehicle_marker jsonb; v_operator_name text; v_operator_id uuid;
    v_record_count int := 0;
    v_edge_dist_m numeric := 25.0;
    v_minor_pct_threshold numeric := 0.05;
    v_minor_area_threshold numeric := 0.01;
    v_merge_gap_seconds int := 60;
    v_cur_point RECORD;
    v_cur_field_id uuid := NULL;
    v_found_field_id uuid;
    v_found_field_name text;
    v_trail_bbox geometry;
    v_records jsonb := '[]'::jsonb;
    v_vehicle_type text;
BEGIN
    SELECT id, vehicle_id, operation_id, trail_width, start_time, end_time
    INTO v_trail FROM trails WHERE id = trail_id_param;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trail not found');
    END IF;
    v_vehicle_id := v_trail.vehicle_id; v_operation_id := v_trail.operation_id;
    v_trail_width := COALESCE(v_trail.trail_width, 3);
    SELECT master_map_id INTO v_master_map_id FROM operations WHERE id = v_operation_id;
    IF v_master_map_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Operation has no master_map_id');
    END IF;
    SELECT vehicle_marker INTO v_vehicle_marker FROM vehicle_state WHERE vehicle_id = v_vehicle_id;

    -- Look up operator from operator_sessions (active session for this account on this map)
    -- Falls back to profiles.full_name if no operator session exists
    SELECT mo.id, mo.name INTO v_operator_id, v_operator_name
    FROM public.operator_sessions os
    JOIN public.map_operators mo ON mo.id = os.operator_id
    WHERE os.account_id = v_vehicle_id
      AND os.map_id = v_master_map_id
      AND os.ended_at IS NULL
    LIMIT 1;

    IF v_operator_name IS NULL THEN
        SELECT full_name INTO v_operator_name FROM profiles WHERE id = v_vehicle_id;
    END IF;

    v_vehicle_type := v_vehicle_marker->>'type';

    SELECT ST_Envelope(ST_Collect(coordinate::geometry)) INTO v_trail_bbox
    FROM trail_stream WHERE trail_id = trail_id_param;

    CREATE TEMP TABLE point_field_map (
        ts timestamptz, coord geometry, field_id uuid
    ) ON COMMIT DROP;

    -- Copy trail_stream points (column is "timestamp", not "ts")
    INSERT INTO point_field_map (ts, coord, field_id)
    SELECT timestamp, coordinate::geometry, NULL
    FROM trail_stream WHERE trail_id = trail_id_param;

    -- Assign fields using ST_Contains
    UPDATE point_field_map pfm
    SET field_id = sub.field_id
    FROM (
        SELECT pfm2.ts, f.field_id
        FROM point_field_map pfm2
        CROSS JOIN fields f
        WHERE f.map_id = v_master_map_id
          AND ST_Contains(f.boundary::geometry, pfm2.coord)
    ) sub
    WHERE pfm.ts = sub.ts;

    -- Build spray records per field
    INSERT INTO spray_records (
        trail_id, field_id, master_map_id, operation_id, vehicle_id,
        start_time, end_time, duration_seconds,
        area_hectares, distance_km, point_count,
        vehicle_type, operator_id, operator_name, operator_confirmed,
        created_at, updated_at
    )
    SELECT
        trail_id_param,
        pfm.field_id,
        v_master_map_id,
        v_operation_id,
        v_vehicle_id,
        MIN(pfm.ts),
        MAX(pfm.ts),
        EXTRACT(EPOCH FROM (MAX(pfm.ts) - MIN(pfm.ts))),
        0,
        0,
        COUNT(*),
        v_vehicle_type,
        v_operator_id,
        v_operator_name,
        false,
        now(),
        now()
    FROM point_field_map pfm
    WHERE pfm.field_id IS NOT NULL
    GROUP BY pfm.field_id;

    GET DIAGNOSTICS v_record_count = ROW_COUNT;

    -- Build records JSON for return
    SELECT jsonb_agg(jsonb_build_object(
        'field_id', field_id,
        'field_name', (SELECT name FROM fields WHERE field_id = sr.field_id),
        'start_time', start_time,
        'end_time', end_time,
        'duration_seconds', duration_seconds,
        'area_hectares', area_hectares,
        'distance_km', distance_km,
        'point_count', point_count,
        'vehicle_type', vehicle_type,
        'operator_name', operator_name,
        'operator_id', operator_id
    )) INTO v_records
    FROM spray_records sr
    WHERE sr.trail_id = trail_id_param;

    DROP TABLE point_field_map;

    RETURN jsonb_build_object(
        'success', true,
        'records_generated', v_record_count,
        'records', COALESCE(v_records, '[]'::jsonb)
    );
END;
$$;
