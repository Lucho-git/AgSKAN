-- fix_generate_spray_records_returning
-- Applied through the Supabase MCP; text copied from the recorded migration.

CREATE OR REPLACE FUNCTION public.generate_spray_records(trail_id_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_trail RECORD;
    v_master_map_id uuid; v_vehicle_id uuid; v_operation_id uuid;
    v_trail_width numeric; v_vehicle_marker jsonb; v_operator_name text;
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
    SELECT full_name INTO v_operator_name FROM profiles WHERE id = v_vehicle_id;

    SELECT ST_Envelope(ST_Collect(coordinate::geometry)) INTO v_trail_bbox
    FROM trail_stream WHERE trail_id = trail_id_param;

    CREATE TEMP TABLE point_field_map (
        ts timestamptz, coord geometry, field_id uuid, field_name text
    ) ON COMMIT DROP;

    FOR v_cur_point IN
        SELECT ts.timestamp, ts.coordinate::geometry AS coord
        FROM trail_stream ts
        WHERE ts.trail_id = trail_id_param
        ORDER BY ts.timestamp
    LOOP
        v_found_field_id := NULL;
        v_found_field_name := NULL;

        IF v_cur_field_id IS NOT NULL THEN
            SELECT f.field_id, f.name INTO v_found_field_id, v_found_field_name
            FROM fields f
            WHERE f.field_id = v_cur_field_id
              AND ST_Contains(COALESCE(f.boundary_solid, f.boundary)::geometry, v_cur_point.coord);
        END IF;

        IF v_found_field_id IS NULL THEN
            SELECT f.field_id, f.name INTO v_found_field_id, v_found_field_name
            FROM fields f
            WHERE f.map_id = v_master_map_id
              AND f.boundary IS NOT NULL
              AND ST_Intersects(ST_Envelope(COALESCE(f.boundary_solid, f.boundary)::geometry), v_trail_bbox)
              AND ST_Contains(COALESCE(f.boundary_solid, f.boundary)::geometry, v_cur_point.coord)
            LIMIT 1;
        END IF;

        IF v_found_field_id IS NOT NULL THEN
            v_cur_field_id := v_found_field_id;
            INSERT INTO point_field_map (ts, coord, field_id, field_name)
            VALUES (v_cur_point.timestamp, v_cur_point.coord, v_found_field_id, v_found_field_name);
        END IF;
    END LOOP;

    WITH point_fields AS (
        SELECT ts AS timestamp, coord AS coordinate, field_id, field_name FROM point_field_map
    ),
    field_counts AS (
        SELECT field_id, field_name, COUNT(*) AS cnt FROM point_fields GROUP BY field_id, field_name
    ),
    total_count AS (SELECT SUM(cnt) AS total FROM field_counts),
    dominant_field AS (SELECT fc.field_id, fc.field_name FROM field_counts fc ORDER BY fc.cnt DESC LIMIT 1),
    minor_candidates AS (
        SELECT fc.field_id, fc.field_name, fc.cnt FROM field_counts fc, total_count tc
        WHERE fc.cnt < tc.total * v_minor_pct_threshold
    ),
    minor_with_area AS (
        SELECT mc.*,
            (v_trail_width * (
                SELECT COALESCE(ST_Length(ST_MakeLine(pf.coordinate ORDER BY pf.timestamp)::geography)/1000, 0)
                FROM point_fields pf WHERE pf.field_id = mc.field_id
            ) * 1000) / 10000 AS est_area_ha,
            MAX(ST_Distance(pf.coordinate::geography,
                (SELECT COALESCE(f.boundary_solid, f.boundary)::geometry::geography FROM fields f WHERE f.field_id = df.field_id)
            )) AS max_dist_m
        FROM minor_candidates mc
        JOIN point_fields pf ON pf.field_id = mc.field_id
        CROSS JOIN dominant_field df
        GROUP BY mc.field_id, mc.field_name, mc.cnt
    ),
    edge_noise_fields AS (
        SELECT mwa.field_id FROM minor_with_area mwa
        CROSS JOIN (
            SELECT (v_trail_width * (
                SELECT COALESCE(ST_Length(ST_MakeLine(pf2.coordinate ORDER BY pf2.timestamp)::geography)/1000, 0)
                FROM point_fields pf2 WHERE pf2.field_id = (SELECT field_id FROM dominant_field)
            ) * 1000) / 10000 AS dom_area_ha
        ) dom
        WHERE mwa.max_dist_m < v_edge_dist_m
           OR (mwa.est_area_ha IS NOT NULL AND dom.dom_area_ha > 0
               AND mwa.est_area_ha / dom.dom_area_ha < v_minor_area_threshold)
    ),
    reassigned AS (
        SELECT pf.timestamp, pf.coordinate,
            CASE WHEN enf.field_id IS NOT NULL THEN df.field_id ELSE pf.field_id END AS field_id,
            CASE WHEN enf.field_id IS NOT NULL THEN df.field_name ELSE pf.field_name END AS field_name
        FROM point_fields pf
        LEFT JOIN edge_noise_fields enf ON pf.field_id = enf.field_id
        CROSS JOIN dominant_field df
    ),
    island_marks AS (
        SELECT *, LAG(field_id) OVER (ORDER BY timestamp) AS prev_field_id FROM reassigned
    ),
    islands AS (
        SELECT timestamp, coordinate, field_id, field_name,
            SUM(CASE WHEN field_id = prev_field_id THEN 0 ELSE 1 END)
                OVER (ORDER BY timestamp ROWS UNBOUNDED PRECEDING) AS island_id
        FROM island_marks
    ),
    field_intervals AS (
        SELECT field_id, field_name,
            MIN(timestamp) AS entry_time, MAX(timestamp) AS exit_time,
            EXTRACT(EPOCH FROM (MAX(timestamp)-MIN(timestamp)))::int AS dur,
            ST_Length(ST_MakeLine(coordinate::geometry ORDER BY timestamp)::geography)/1000 AS dist_km,
            COUNT(*) AS pc, island_id,
            ST_AsGeoJSON(ST_MakeLine(coordinate::geometry ORDER BY timestamp)) AS path_geojson
        FROM islands GROUP BY field_id, field_name, island_id
    ),
    merged AS (
        SELECT field_id, field_name, entry_time, exit_time, dur, dist_km, pc, path_geojson,
            SUM(gap_flag) OVER (PARTITION BY field_id ORDER BY entry_time) AS merge_group
        FROM (
            SELECT *, CASE
                WHEN EXTRACT(EPOCH FROM (entry_time - LAG(exit_time)
                    OVER (PARTITION BY field_id ORDER BY entry_time))) > v_merge_gap_seconds
                  OR LAG(exit_time) OVER (PARTITION BY field_id ORDER BY entry_time) IS NULL
                THEN 1 ELSE 0 END AS gap_flag
            FROM field_intervals
        ) gaps
    ),
    field_summary AS (
        SELECT field_id, field_name, merge_group,
            MIN(entry_time) AS start_time, MAX(exit_time) AS end_time,
            SUM(dur)::int AS duration_seconds, SUM(dist_km) AS distance_km,
            SUM(pc)::int AS point_count,
            jsonb_agg(jsonb_build_object(
                'entry_time', entry_time, 'exit_time', exit_time,
                'duration_seconds', dur, 'distance_km', dist_km,
                'area_hectares', (v_trail_width * dist_km * 1000)/10000,
                'point_count', pc
            ) ORDER BY entry_time) AS intervals,
            jsonb_agg(jsonb_build_object(
                'entry_time', entry_time, 'exit_time', exit_time,
                'path_geojson', path_geojson::json,
                'area_hectares', (v_trail_width * dist_km * 1000)/10000,
                'distance_km', dist_km
            ) ORDER BY entry_time) AS interval_paths
        FROM merged
        GROUP BY field_id, field_name, merge_group
        HAVING SUM(pc) >= 2
    )
    INSERT INTO spray_records (
        trail_id, field_id, master_map_id, operation_id, vehicle_id,
        operator_id, operator_name, operator_confirmed,
        start_time, end_time, duration_seconds,
        field_path, area_hectares, distance_km, point_count,
        vehicle_type, swath_width, intervals, interval_paths
    )
    SELECT trail_id_param, fs.field_id, v_master_map_id, v_operation_id, v_vehicle_id,
        v_vehicle_id, v_operator_name, false,
        fs.start_time, fs.end_time, fs.duration_seconds,
        (SELECT ST_MakeLine(r.coordinate::geometry ORDER BY r.timestamp)
         FROM reassigned r WHERE r.field_id = fs.field_id),
        (v_trail_width * fs.distance_km * 1000)/10000, fs.distance_km, fs.point_count,
        v_vehicle_marker->>'type', (v_vehicle_marker->>'swath')::numeric,
        fs.intervals, fs.interval_paths
    FROM field_summary fs;

    GET DIAGNOSTICS v_record_count = ROW_COUNT;
    DROP TABLE IF EXISTS point_field_map;

    -- Build records array by querying the just-inserted rows
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'field_id', field_id,
        'start_time', start_time, 'end_time', end_time,
        'duration_seconds', duration_seconds,
        'area_hectares', area_hectares, 'distance_km', distance_km,
        'intervals', intervals,
        'operator_name', operator_name
    ) ORDER BY start_time), '[]'::jsonb) INTO v_records
    FROM spray_records WHERE trail_id = trail_id_param;

    RETURN jsonb_build_object('success', true, 'records_generated', v_record_count, 'records', v_records);
END;
$function$;
