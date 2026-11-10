-- create_spray_records_table_and_rpc
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- =============================================================================
-- SPRAY RECORDS: Track field-level activity from trails
-- =============================================================================
-- One trail crossing N fields → N spray records.
-- Auto-generated from trail_stream points ∩ field boundaries via PostGIS.
-- =============================================================================

CREATE TABLE spray_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links
    trail_id uuid NOT NULL REFERENCES trails(id) ON DELETE CASCADE,
    field_id uuid NOT NULL REFERENCES fields(field_id) ON DELETE CASCADE,
    master_map_id uuid,                    -- denormalized for fast farm-level filtering
    operation_id uuid,                     -- denormalized from trail
    vehicle_id uuid,                       -- the auth UID who was driving

    -- Operator (prefilled from auth, user-confirmable in popup)
    operator_id uuid,                      -- defaults to vehicle_id
    operator_name text,                    -- denormalized from profiles.full_name
    operator_confirmed boolean DEFAULT false,

    -- Timing (auto-computed from trail_stream points within field)
    start_time timestamptz,                -- first trail_stream point inside field
    end_time timestamptz,                  -- last trail_stream point inside field
    duration_seconds int,

    -- Coverage (auto-computed via PostGIS)
    field_path geometry(LineString, 4326), -- portion of trail within this field
    area_hectares numeric,                 -- trail_width × distance / 10000
    distance_km numeric,                   -- ST_Length of field_path
    point_count int,                       -- trail_stream points in this field

    -- Vehicle info (denormalized from vehicle_state at close time)
    vehicle_type text,                     -- 'SelfPropelledBoomspray', 'TowBetweenSeeder', etc.
    swath_width numeric,                   -- from vehicle_marker.swath

    -- Future fields (nullable for MVP)
    weather_data jsonb,                    -- later: weather API at close time
    chem_mix jsonb,                        -- later: imported from Agworld
    agworld_job_id text,                   -- later: link to Agworld job

    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for "show me all spray records for this field, chronologically"
CREATE INDEX idx_spray_records_field_time ON spray_records(field_id, start_time DESC);

-- Index for "show me all spray records for this farm"
CREATE INDEX idx_spray_records_master_map ON spray_records(master_map_id, start_time DESC);

-- Index for "show me all spray records for this trail"
CREATE INDEX idx_spray_records_trail ON spray_records(trail_id);

-- Index for "show me all spray records by this operator"
CREATE INDEX idx_spray_records_operator ON spray_records(operator_id, start_time DESC);

-- Enable RLS
ALTER TABLE spray_records ENABLE ROW LEVEL SECURITY;

-- Policy: users can see records on master maps they have access to
-- (same pattern as other tables — authenticated users see their farm's records)
CREATE POLICY "spray_records_select_authenticated" ON spray_records
    FOR SELECT TO authenticated
    USING (master_map_id IN (
        SELECT master_map_id FROM profiles WHERE id = auth.uid()
    ));

-- Policy: users can insert records for their own vehicle
CREATE POLICY "spray_records_insert_authenticated" ON spray_records
    FOR INSERT TO authenticated
    WITH CHECK (vehicle_id = auth.uid());

-- Policy: users can update records on their farm (e.g., confirm operator)
CREATE POLICY "spray_records_update_authenticated" ON spray_records
    FOR UPDATE TO authenticated
    USING (master_map_id IN (
        SELECT master_map_id FROM profiles WHERE id = auth.uid()
    ))
    WITH CHECK (master_map_id IN (
        SELECT master_map_id FROM profiles WHERE id = auth.uid()
    ));

-- Grant access
GRANT SELECT, INSERT, UPDATE ON spray_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON spray_records TO service_role;

-- =============================================================================
-- generate_spray_records(trail_id) RPC
-- =============================================================================
-- Called after a trail is closed. Uses trail_stream points (which are still
-- present before close_trail_fast deletes them) to:
--   1. Find all fields that the trail intersected
--   2. For each field, compute timing, path, distance, and area
--   3. Insert spray_records
--   4. Return the created records for the confirmation popup
-- =============================================================================

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
        v_vehicle_id,                           -- operator defaults to driver
        v_operator_name,
        false,                                  -- not yet confirmed
        MIN(ts.timestamp),                      -- first point in field
        MAX(ts.timestamp),                      -- last point in field
        EXTRACT(EPOCH FROM (MAX(ts.timestamp) - MIN(ts.timestamp)))::int,
        ST_MakeLine(ts.coordinate ORDER BY ts.timestamp),  -- path within field
        -- Area = trail_width × distance / 10000 (same approach as calculate_trail_metrics)
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
    HAVING COUNT(*) >= 2  -- need at least 2 points to form a line
    RETURNING
        id, field_id, start_time, end_time, duration_seconds,
        area_hectares, distance_km, point_count;

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
