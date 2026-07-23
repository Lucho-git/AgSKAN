-- Generate agworld records directly from trails + agworld field boundaries
-- Same algorithm as generate_spray_records() but using agworld_fields
CREATE OR REPLACE FUNCTION public.generate_agworld_records(
  trail_id_param uuid,
  account_id_param text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_trail RECORD;
    v_master_map_id uuid; v_vehicle_id uuid; v_operation_id uuid;
    v_trail_width numeric; v_vehicle_marker jsonb; v_operator_name text; v_operator_id uuid;
    v_record_count int := 0;
    v_trail_bbox geometry;
    v_vehicle_type text;
    v_swath_width numeric;
    v_trail_color text;
    v_min_island_points int := 4;
    v_min_island_distance_m numeric := 20;
    v_merge_gap_seconds int := 120;
BEGIN
    -- Read from trails as master source
    SELECT id, vehicle_id, operation_id, trail_width, trail_color,
           vehicle_marker, operator_name, operator_id,
           start_time, end_time
    INTO v_trail FROM trails WHERE id = trail_id_param;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trail not found');
    END IF;
    v_vehicle_id := v_trail.vehicle_id; v_operation_id := v_trail.operation_id;
    v_trail_width := COALESCE(v_trail.trail_width, 3);
    v_trail_color := COALESCE(v_trail.trail_color, NULL);
    v_vehicle_marker := v_trail.vehicle_marker;
    v_operator_name := v_trail.operator_name;
    v_operator_id := v_trail.operator_id;

    SELECT master_map_id INTO v_master_map_id FROM operations WHERE id = v_operation_id;
    IF v_master_map_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Operation has no master_map_id');
    END IF;

    -- Fallback for legacy trails
    IF v_vehicle_marker IS NULL THEN
        SELECT vehicle_marker INTO v_vehicle_marker FROM vehicle_state WHERE vehicle_id = v_vehicle_id;
    END IF;
    IF v_operator_name IS NULL THEN
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
    END IF;
    IF v_trail_color IS NULL AND v_vehicle_marker IS NOT NULL THEN
        v_trail_color := v_vehicle_marker->>'bodyColor';
    END IF;

    v_vehicle_type := v_vehicle_marker->>'type';
    v_swath_width := (v_vehicle_marker->>'swath')::numeric;

    -- Compute trail bounding box for pre-filtering agworld fields
    SELECT ST_Envelope(ST_Collect(coordinate::geometry)) INTO v_trail_bbox
    FROM trail_stream WHERE trail_id = trail_id_param;

    -- Temp table with points and row numbers
    CREATE TEMP TABLE aw_point_map (
        ts timestamptz, coord geometry, agworld_field_id text, rn int
    ) ON COMMIT DROP;

    INSERT INTO aw_point_map (ts, coord, agworld_field_id, rn)
    SELECT timestamp, coordinate::geometry, NULL,
           ROW_NUMBER() OVER (ORDER BY timestamp)
    FROM trail_stream WHERE trail_id = trail_id_param;

    -- bbox pre-filter + spatial index against agworld_fields
    UPDATE aw_point_map apm
    SET agworld_field_id = sub.agworld_field_id
    FROM (
        SELECT apm2.rn, af.id AS agworld_field_id
        FROM aw_point_map apm2
        JOIN agworld_fields af ON af.map_id = v_master_map_id
            AND af.account_id = account_id_param
            AND af.boundary IS NOT NULL
            AND af.boundary && v_trail_bbox
            AND ST_Intersects(af.boundary::geometry, v_trail_bbox)
            AND ST_Contains(af.boundary::geometry, apm2.coord)
    ) sub
    WHERE apm.rn = sub.rn;

    -- Island detection + gap merging (same logic as spray_records)
    WITH island_marks AS (
        SELECT *, LAG(agworld_field_id) OVER (ORDER BY rn) AS prev_field_id
        FROM aw_point_map
    ),
    raw_islands AS (
        SELECT ts, coord, rn, agworld_field_id,
            SUM(CASE WHEN agworld_field_id IS DISTINCT FROM prev_field_id THEN 1 ELSE 0 END)
                OVER (ORDER BY rn ROWS UNBOUNDED PRECEDING) AS raw_island
        FROM island_marks WHERE agworld_field_id IS NOT NULL
    ),
    island_bounds AS (
        SELECT agworld_field_id, raw_island,
            MIN(ts) AS entry_ts, MAX(ts) AS exit_ts
        FROM raw_islands GROUP BY agworld_field_id, raw_island
    ),
    island_gaps AS (
        SELECT *,
            EXTRACT(EPOCH FROM (
                LEAD(entry_ts) OVER (PARTITION BY agworld_field_id ORDER BY entry_ts) - exit_ts
            )) AS gap_seconds
        FROM island_bounds
    ),
    merge_map AS (
        SELECT agworld_field_id, raw_island,
            SUM(CASE WHEN gap_seconds IS NULL OR gap_seconds > v_merge_gap_seconds THEN 1 ELSE 0 END)
                OVER (PARTITION BY agworld_field_id ORDER BY entry_ts ROWS UNBOUNDED PRECEDING) AS merge_grp
        FROM island_gaps
    ),
    merged_islands AS (
        SELECT ri.ts, ri.coord, ri.rn, ri.agworld_field_id, mm.merge_grp
        FROM raw_islands ri
        JOIN merge_map mm ON mm.agworld_field_id = ri.agworld_field_id AND mm.raw_island = ri.raw_island
    ),
    field_intervals AS (
        SELECT agworld_field_id, merge_grp,
            MIN(ts) AS entry_time, MAX(ts) AS exit_time,
            EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts)))::int AS duration_seconds,
            ST_Length(ST_MakeLine(coord::geometry ORDER BY rn)::geography) / 1000 AS distance_km,
            COUNT(*) AS point_count,
            ST_MakeLine(coord::geometry ORDER BY rn) AS path_geom
        FROM merged_islands
        GROUP BY agworld_field_id, merge_grp
        HAVING COUNT(*) >= v_min_island_points
           AND ST_Length(ST_MakeLine(coord::geometry ORDER BY rn)::geography) >= v_min_island_distance_m
    )
    INSERT INTO agworld_records (
        account_id, agworld_field_id, agworld_field_name, agworld_boundary,
        master_map_id, trail_id, operation_id, vehicle_id,
        operator_id, operator_name, operator_confirmed,
        start_time, end_time, duration_seconds,
        field_path, area_hectares, distance_km, point_count,
        vehicle_type, swath_width,
        trail_width, trail_color, vehicle_marker,
        gen_method, status,
        created_at, updated_at
    )
    SELECT
        account_id_param,
        fi.agworld_field_id,
        af.name,
        af.boundary,
        v_master_map_id,
        trail_id_param,
        v_operation_id,
        v_vehicle_id,
        v_operator_id,
        v_operator_name,
        false,
        fi.entry_time,
        fi.exit_time,
        fi.duration_seconds,
        fi.path_geom,
        ROUND((fi.distance_km * v_trail_width * 1000 / 10000)::numeric, 4),
        ROUND(fi.distance_km::numeric, 4),
        fi.point_count,
        v_vehicle_type,
        v_swath_width,
        v_trail_width,
        v_trail_color,
        v_vehicle_marker,
        'agworld_direct',
        'generated',
        now(),
        now()
    FROM field_intervals fi
    JOIN agworld_fields af ON af.id = fi.agworld_field_id;

    GET DIAGNOSTICS v_record_count = ROW_COUNT;

    DROP TABLE aw_point_map;

    RETURN jsonb_build_object(
        'success', true,
        'records_generated', v_record_count
    );
END;
$$;
