-- optimize_generate_spray_records_from_path
-- Applied through the Supabase MCP; text copied from the recorded migration.

CREATE OR REPLACE FUNCTION public.generate_spray_records_from_path(
  p_trail_id uuid,
  p_vehicle_id uuid,
  p_operation_id uuid,
  p_trail_width numeric,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_path geography
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_master_map_id uuid;
  v_vehicle_marker jsonb;
  v_operator_name text;
  v_record_count int := 0;
  v_num_points int;
  v_sample_step int := 1;
  v_path_bbox geometry;
BEGIN
  SELECT master_map_id INTO v_master_map_id
  FROM operations WHERE id = p_operation_id;

  IF v_master_map_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No master_map_id');
  END IF;

  SELECT vehicle_marker INTO v_vehicle_marker
  FROM vehicle_state WHERE vehicle_id = p_vehicle_id;

  SELECT full_name INTO v_operator_name
  FROM profiles WHERE id = p_vehicle_id;

  v_num_points := ST_NumPoints(p_path::geometry);
  IF v_num_points < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Path has fewer than 2 points');
  END IF;

  -- Sample for very long paths (keep max ~500 points to avoid timeout)
  IF v_num_points > 500 THEN
    v_sample_step := CEIL(v_num_points::numeric / 500);
  END IF;

  -- Get path bbox for fast field lookup
  v_path_bbox := ST_Envelope(p_path::geometry);

  -- Reconstruct timestamped points from the LineString geometry
  -- by distributing timestamps evenly between start_time and end
  WITH point_series AS (
    SELECT
      idx,
      p_start_time + ((idx - 1)::numeric / (v_num_points - 1)) * (p_end_time - p_start_time) AS ts,
      ST_PointN(p_path::geometry, idx) AS coord
    FROM generate_series(1, v_num_points, v_sample_step) AS idx
  ),
  -- Only join against fields whose bbox overlaps the path bbox
  relevant_fields AS (
    SELECT field_id, name, COALESCE(boundary_solid, boundary) AS boundary
    FROM fields
    WHERE map_id = v_master_map_id
      AND boundary IS NOT NULL
      AND ST_Intersects(ST_Envelope(boundary), v_path_bbox)
  ),
  point_fields AS (
    SELECT
      ps.ts AS timestamp,
      ps.coord,
      f.field_id,
      f.name AS field_name
    FROM point_series ps
    JOIN relevant_fields f ON ST_Contains(f.boundary, ps.coord)
  ),
  field_counts AS (
    SELECT field_id, field_name, COUNT(*) AS cnt
    FROM point_fields
    GROUP BY field_id, field_name
  ),
  total_count AS (
    SELECT SUM(cnt) AS total FROM field_counts
  ),
  dominant_field AS (
    SELECT fc.field_id, fc.field_name
    FROM field_counts fc
    ORDER BY fc.cnt DESC
    LIMIT 1
  ),
  minor_candidates AS (
    SELECT fc.field_id
    FROM field_counts fc, total_count tc
    WHERE fc.cnt < tc.total * 0.05
  ),
  minor_assessment AS (
    SELECT
      mc.field_id AS minor_field_id,
      MAX(ST_Distance(
        pf.coord::geography,
        (SELECT boundary FROM relevant_fields WHERE field_id = df.field_id)::geography
      )) AS max_dist_m
    FROM minor_candidates mc
    JOIN point_fields pf ON pf.field_id = mc.field_id
    CROSS JOIN dominant_field df
    GROUP BY mc.field_id
  ),
  edge_noise_fields AS (
    SELECT minor_field_id
    FROM minor_assessment
    WHERE max_dist_m < 10.0
  ),
  reassigned AS (
    SELECT
      pf.timestamp,
      pf.coord,
      CASE
        WHEN enf.minor_field_id IS NOT NULL THEN df.field_id
        ELSE pf.field_id
      END AS field_id,
      CASE
        WHEN enf.minor_field_id IS NOT NULL THEN df.field_name
        ELSE pf.field_name
      END AS field_name
    FROM point_fields pf
    LEFT JOIN edge_noise_fields enf ON pf.field_id = enf.minor_field_id
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
      coord,
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
      ST_Length(ST_MakeLine(coord ORDER BY timestamp)::geography) / 1000 AS distance_km,
      COUNT(*) AS point_count,
      island_id,
      ST_AsGeoJSON(ST_MakeLine(coord ORDER BY timestamp)) AS path_geojson
    FROM islands
    GROUP BY field_id, field_name, island_id
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
        'area_hectares', (p_trail_width * distance_km * 1000) / 10000,
        'point_count', point_count
      ) ORDER BY entry_time) AS intervals,
      jsonb_agg(jsonb_build_object(
        'entry_time', entry_time,
        'exit_time', exit_time,
        'path_geojson', path_geojson::json,
        'area_hectares', (p_trail_width * distance_km * 1000) / 10000,
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
    p_trail_id,
    fs.field_id,
    v_master_map_id,
    p_operation_id,
    p_vehicle_id,
    p_vehicle_id,
    v_operator_name,
    false,
    fs.start_time,
    fs.end_time,
    fs.duration_seconds,
    (
      SELECT ST_MakeLine(r.coord ORDER BY r.timestamp)
      FROM reassigned r
      WHERE r.field_id = fs.field_id
    ),
    (p_trail_width * fs.distance_km * 1000) / 10000,
    fs.distance_km,
    fs.point_count,
    v_vehicle_marker->>'type',
    (v_vehicle_marker->>'swath')::numeric,
    fs.intervals,
    fs.interval_paths
  FROM field_summary fs;

  GET DIAGNOSTICS v_record_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'records_generated', v_record_count);
END;
$function$;
