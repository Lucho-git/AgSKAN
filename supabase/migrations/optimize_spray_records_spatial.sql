-- Add GiST spatial index on fields.boundary for spray record generation
CREATE INDEX IF NOT EXISTS idx_fields_boundary_gist
  ON public.fields USING gist (boundary);

-- Diagnostic columns for spray record generation analysis
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS gen_dominant_field_id uuid;
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS gen_pct_of_dominant numeric;
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS gen_area_ratio numeric;
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS gen_max_dist_to_dominant_m numeric;
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS gen_edge_noise boolean;
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS gen_method text;
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS gen_gap_merges int;

-- Optimized generate_spray_records: uses bbox pre-filter + spatial index
-- instead of CROSS JOIN + ST_Contains which does 1.3M+ unchecked checks
CREATE OR REPLACE FUNCTION public.generate_spray_records(trail_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_trail RECORD;
    v_master_map_id uuid; v_vehicle_id uuid; v_operation_id uuid;
    v_trail_width numeric; v_vehicle_marker jsonb; v_operator_name text; v_operator_id uuid;
    v_record_count int := 0;
    v_trail_bbox geometry;
    v_records jsonb := '[]'::jsonb;
    v_vehicle_type text;
    v_swath_width numeric;
    -- Island quality thresholds
    v_min_island_points int := 4;          -- ignore < 4 pts (border flicker)
    v_min_island_distance_m numeric := 20; -- ignore < 20m path (edge clip)
    v_merge_gap_seconds int := 120;  -- merge same-field visits separated by < 2 min
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

    -- Look up operator from operator_sessions
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
    v_swath_width := (v_vehicle_marker->>'swath')::numeric;

    -- Compute trail bounding box ONCE for pre-filtering fields
    SELECT ST_Envelope(ST_Collect(coordinate::geometry)) INTO v_trail_bbox
    FROM trail_stream WHERE trail_id = trail_id_param;

    -- Temp table with points and row numbers
    CREATE TEMP TABLE point_field_map (
        ts timestamptz, coord geometry, field_id uuid, rn int
    ) ON COMMIT DROP;

    INSERT INTO point_field_map (ts, coord, field_id, rn)
    SELECT timestamp, coordinate::geometry, NULL,
           ROW_NUMBER() OVER (ORDER BY timestamp)
    FROM trail_stream WHERE trail_id = trail_id_param;

    -- ── OPTIMIZED: bbox pre-filter + spatial index ──
    -- Only check fields whose boundary intersects the trail's bounding box,
    -- then do ST_Contains on that drastically reduced set.
    UPDATE point_field_map pfm
    SET field_id = sub.field_id
    FROM (
        SELECT pfm2.rn, f.field_id
        FROM point_field_map pfm2
        JOIN fields f ON f.map_id = v_master_map_id
            AND f.boundary && v_trail_bbox              -- bbox pre-filter (indexed)
            AND ST_Intersects(f.boundary, v_trail_bbox) -- precise intersect (indexed)
            AND ST_Contains(f.boundary::geometry, pfm2.coord)
    ) sub
    WHERE pfm.rn = sub.rn;

    -- Build spray records with island detection + gap merging
    WITH island_marks AS (
        SELECT *, LAG(field_id) OVER (ORDER BY rn) AS prev_field_id
        FROM point_field_map
    ),
    raw_islands AS (
        SELECT ts, coord, rn, field_id,
            SUM(CASE WHEN field_id IS DISTINCT FROM prev_field_id THEN 1 ELSE 0 END)
                OVER (ORDER BY rn ROWS UNBOUNDED PRECEDING) AS raw_island
        FROM island_marks WHERE field_id IS NOT NULL
    ),
    island_bounds AS (
        SELECT field_id, raw_island,
            MIN(ts) AS entry_ts, MAX(ts) AS exit_ts
        FROM raw_islands GROUP BY field_id, raw_island
    ),
    island_gaps AS (
        SELECT *,
            EXTRACT(EPOCH FROM (
                LEAD(entry_ts) OVER (PARTITION BY field_id ORDER BY entry_ts) - exit_ts
            )) AS gap_seconds
        FROM island_bounds
    ),
    merge_map AS (
        SELECT field_id, raw_island,
            SUM(CASE WHEN gap_seconds IS NULL OR gap_seconds > v_merge_gap_seconds THEN 1 ELSE 0 END)
                OVER (PARTITION BY field_id ORDER BY entry_ts ROWS UNBOUNDED PRECEDING) AS merge_grp
        FROM island_gaps
    ),
    merged_islands AS (
        SELECT ri.ts, ri.coord, ri.rn, ri.field_id, mm.merge_grp
        FROM raw_islands ri
        JOIN merge_map mm ON mm.field_id = ri.field_id AND mm.raw_island = ri.raw_island
    ),
    field_intervals AS (
        SELECT field_id, merge_grp,
            MIN(ts) AS entry_time, MAX(ts) AS exit_time,
            EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts)))::int AS duration_seconds,
            ST_Length(ST_MakeLine(coord::geometry ORDER BY rn)::geography) / 1000 AS distance_km,
            COUNT(*) AS point_count,
            ST_MakeLine(coord::geometry ORDER BY rn) AS path_geom
        FROM merged_islands
        GROUP BY field_id, merge_grp
        HAVING COUNT(*) >= v_min_island_points
           AND ST_Length(ST_MakeLine(coord::geometry ORDER BY rn)::geography) >= v_min_island_distance_m
           AND (ST_Length(ST_MakeLine(coord::geometry ORDER BY rn)::geography) * v_trail_width / 10000) >= v_min_island_area_ha
    )
    INSERT INTO spray_records (
        trail_id, field_id, master_map_id, operation_id, vehicle_id,
        start_time, end_time, duration_seconds,
        field_path, area_hectares, distance_km, point_count,
        vehicle_type, swath_width, operator_id, operator_name, operator_confirmed,
        created_at, updated_at
    )
    SELECT
        trail_id_param,
        fi.field_id,
        v_master_map_id,
        v_operation_id,
        v_vehicle_id,
        fi.entry_time,
        fi.exit_time,
        fi.duration_seconds,
        fi.path_geom,
        ROUND((fi.distance_km * v_trail_width * 1000 / 10000)::numeric, 4),
        ROUND(fi.distance_km::numeric, 4),
        fi.point_count,
        v_vehicle_type,
        v_swath_width,
        v_operator_id,
        v_operator_name,
        false,
        now(),
        now()
    FROM field_intervals fi;

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
