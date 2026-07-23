-- Updated backfill functions: read vehicle/operator from trails (master source)
-- instead of doing fresh lookups against vehicle_state and profiles.
-- Legacy trails without these columns still fall back to fresh lookups.

-- ── backfill_one_trail ──
-- Now reads trail_color, vehicle_marker, operator_name, operator_id from trails
-- and passes them to generate_spray_records_from_path.
CREATE OR REPLACE FUNCTION public.backfill_one_trail(p_trail_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trail RECORD;
BEGIN
  SELECT t.id, t.vehicle_id, t.operation_id,
         COALESCE(t.trail_width, 3) AS tw,
         t.start_time, t.end_time,
         COALESCE(t.detailed_path, t.path) AS path_geom,
         t.trail_color, t.vehicle_marker,
         t.operator_name, t.operator_id
  INTO v_trail
  FROM trails t
  WHERE t.id = p_trail_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trail not found');
  END IF;

  RETURN generate_spray_records_from_path(
    v_trail.id, v_trail.vehicle_id, v_trail.operation_id,
    v_trail.tw, v_trail.start_time, v_trail.end_time, v_trail.path_geom,
    v_trail.vehicle_marker, v_trail.operator_name,
    v_trail.operator_id, v_trail.trail_color
  );
END;
$$;

-- ── generate_spray_records_from_path ──
-- Now accepts optional p_vehicle_marker, p_operator_name, p_operator_id, p_trail_color.
-- Uses trail-snapshotted values when provided; falls back to fresh lookups for legacy.
-- Also now inserts trail_width, trail_color, vehicle_marker into spray_records.
-- DROP old 7-param version first to avoid duplicate signatures.
DROP FUNCTION IF EXISTS public.generate_spray_records_from_path(uuid, uuid, uuid, numeric, timestamptz, timestamptz, geography);

CREATE OR REPLACE FUNCTION public.generate_spray_records_from_path(
  p_trail_id uuid, p_vehicle_id uuid, p_operation_id uuid,
  p_trail_width numeric, p_start_time timestamp with time zone,
  p_end_time timestamp with time zone, p_path geography,
  p_vehicle_marker jsonb DEFAULT NULL,
  p_operator_name text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_trail_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_master_map_id uuid; v_vehicle_marker jsonb; v_operator_name text; v_operator_id uuid;
  v_record_count int := 0; v_num_points int;
  v_path_bbox geometry; v_path_2d geometry;
  v_edge_dist_m numeric := 25.0;
  v_minor_pct_threshold numeric := 2;
  v_minor_area_ratio numeric := 0.02;
  v_merge_gap_seconds int := 120;
  v_min_island_points int := 4;
  v_total_trail_dist_m numeric;
  v_trail_color text;
  v_swath_width numeric;
  v_vehicle_type text;
BEGIN
  SELECT master_map_id INTO v_master_map_id FROM operations WHERE id = p_operation_id;
  IF v_master_map_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No master_map_id'); END IF;

  -- Use trail-snapshotted values if provided, otherwise fall back to fresh lookups (legacy)
  v_vehicle_marker := p_vehicle_marker;
  IF v_vehicle_marker IS NULL THEN
    SELECT vehicle_marker INTO v_vehicle_marker FROM vehicle_state WHERE vehicle_id = p_vehicle_id;
  END IF;

  v_operator_name := p_operator_name;
  v_operator_id := p_operator_id;
  IF v_operator_name IS NULL THEN
    SELECT mo.id, mo.name INTO v_operator_id, v_operator_name
    FROM public.operator_sessions os
    JOIN public.map_operators mo ON mo.id = os.operator_id
    WHERE os.account_id = p_vehicle_id
      AND os.map_id = v_master_map_id
      AND os.ended_at IS NULL
    LIMIT 1;
    IF v_operator_name IS NULL THEN
      SELECT full_name INTO v_operator_name FROM profiles WHERE id = p_vehicle_id;
    END IF;
  END IF;

  v_trail_color := p_trail_color;
  IF v_trail_color IS NULL AND v_vehicle_marker IS NOT NULL THEN
    v_trail_color := v_vehicle_marker->>'bodyColor';
  END IF;

  v_vehicle_type := v_vehicle_marker->>'type';
  v_swath_width := (v_vehicle_marker->>'swath')::numeric;

  v_path_2d := ST_Force2D(p_path::geometry);
  v_num_points := ST_NumPoints(v_path_2d);
  IF v_num_points < 2 THEN RETURN jsonb_build_object('success', false, 'error', 'Path has fewer than 2 points'); END IF;
  v_path_bbox := ST_Envelope(v_path_2d);
  v_total_trail_dist_m := ST_Length(p_path);

  WITH point_series AS (
    SELECT idx, p_start_time + ((idx - 1)::numeric / (v_num_points - 1)) * (p_end_time - p_start_time) AS ts,
      ST_SetSRID(ST_PointN(v_path_2d, idx), 4326)::geometry AS coord FROM generate_series(1, v_num_points) AS idx
  ),
  relevant_fields AS (
    SELECT field_id, name, COALESCE(boundary_solid, boundary)::geometry AS boundary,
      ST_Area(COALESCE(boundary_solid, boundary)::geography) / 10000 AS field_ha
    FROM fields WHERE map_id = v_master_map_id AND boundary IS NOT NULL
      AND ST_Intersects(ST_Envelope(boundary::geometry), v_path_bbox)
  ),
  assigned AS (
    SELECT ps.idx, ps.ts, ps.coord, rf.field_id
    FROM point_series ps
    LEFT JOIN relevant_fields rf ON ST_Contains(rf.boundary, ps.coord)
  ),
  with_islands AS (
    SELECT *, CASE WHEN field_id IS DISTINCT FROM LAG(field_id) OVER (ORDER BY idx)
      THEN 1 ELSE 0 END AS new_island
    FROM assigned WHERE field_id IS NOT NULL
  ),
  raw_islands AS (
    SELECT *, SUM(new_island) OVER (ORDER BY idx ROWS UNBOUNDED PRECEDING) AS raw_isl
    FROM with_islands
  ),
  island_gaps AS (
    SELECT field_id, raw_isl, MIN(ts) AS entry_ts, MAX(ts) AS exit_ts,
      COUNT(*) AS pts
    FROM raw_islands GROUP BY field_id, raw_isl
  ),
  island_gaps2 AS (
    SELECT *, EXTRACT(EPOCH FROM (LEAD(entry_ts) OVER (PARTITION BY field_id ORDER BY entry_ts) - exit_ts)) AS gap_s
    FROM island_gaps
  ),
  merge_map AS (
    SELECT field_id, raw_isl,
      SUM(CASE WHEN gap_s IS NULL OR gap_s > v_merge_gap_seconds THEN 1 ELSE 0 END)
        OVER (PARTITION BY field_id ORDER BY entry_ts ROWS UNBOUNDED PRECEDING) AS mg
    FROM island_gaps2
  ),
  merged AS (
    SELECT ri.idx, ri.ts, ri.coord, ri.field_id, mm.mg AS grp
    FROM raw_islands ri JOIN merge_map mm ON mm.field_id = ri.field_id AND mm.raw_isl = ri.raw_isl
  ),
  reassigned AS (
    SELECT m.ts, m.coord, m.field_id, m.grp,
      LAG(m.grp) OVER (ORDER BY m.idx) AS prev_grp,
      LAG(m.field_id) OVER (ORDER BY m.idx) AS prev_fid,
      LEAD(m.grp) OVER (ORDER BY m.idx) AS next_grp,
      LEAD(m.field_id) OVER (ORDER BY m.idx) AS next_fid,
      ROW_NUMBER() OVER (ORDER BY m.idx) AS timestamp
    FROM merged m
  ),
  filtered AS (
    SELECT * FROM reassigned
    WHERE NOT (grp != prev_grp AND grp != next_grp
      AND field_id != prev_fid AND field_id != next_fid
      AND field_id IS NOT NULL AND prev_fid IS NOT NULL AND next_fid IS NOT NULL)
  ),
  field_intervals AS (
    SELECT field_id, grp,
      MIN(ts) AS entry_time, MAX(ts) AS exit_time,
      COUNT(*) AS point_count,
      ST_Length(ST_MakeLine(coord::geometry ORDER BY timestamp)::geography) / 1000 AS distance_km,
      jsonb_agg(jsonb_build_object('start', MIN(ts), 'end', MAX(ts),
        'path', ST_AsGeoJSON(ST_MakeLine(coord::geometry ORDER BY timestamp))::jsonb)) AS intervals,
      jsonb_agg(jsonb_build_object('start', MIN(ts), 'end', MAX(ts),
        'path', ST_AsGeoJSON(ST_MakeLine(coord::geometry ORDER BY timestamp))::jsonb)) AS interval_paths,
      COUNT(DISTINCT grp) AS island_id
    FROM filtered GROUP BY field_id, grp
    HAVING COUNT(*) >= v_min_island_points
  ),
  field_summary AS (
    SELECT fi.field_id, MIN(fi.entry_time) AS start_time, MAX(fi.exit_time) AS end_time,
      EXTRACT(EPOCH FROM (MAX(fi.exit_time) - MIN(fi.entry_time)))::int AS duration_seconds,
      SUM(fi.distance_km) AS distance_km, SUM(fi.point_count) AS point_count,
      jsonb_agg(fi.intervals) AS intervals, jsonb_agg(fi.interval_paths) AS interval_paths
    FROM field_intervals fi GROUP BY fi.field_id
  ),
  diagnostics AS (
    SELECT fs.field_id, COUNT(DISTINCT fi.grp) AS raw_isl,
      COUNT(DISTINCT fi.grp) AS merged_isl,
      fs.field_id AS dom_field_id, fs.point_count AS total_pts, fs.point_count AS field_pts,
      fs.distance_km AS dom_dist_m_val, fs.distance_km AS this_dist_m,
      false AS is_edge_noise,
      (SELECT rf.field_ha FROM relevant_fields rf WHERE rf.field_id = fs.field_id) AS field_ha
    FROM field_summary fs
    LEFT JOIN field_intervals fi ON fi.field_id = fs.field_id
    GROUP BY fs.field_id
  )
  INSERT INTO spray_records (
    trail_id, field_id, master_map_id, operation_id, vehicle_id,
    operator_id, operator_name, operator_confirmed,
    start_time, end_time, duration_seconds,
    field_path, area_hectares, distance_km, point_count,
    vehicle_type, swath_width, intervals, interval_paths,
    trail_width, trail_color, vehicle_marker,
    gen_dominant_field_id, gen_pct_of_dominant, gen_area_ratio, gen_pct_of_trail_area, gen_pct_of_field,
    gen_max_dist_to_dominant_m, gen_edge_noise, gen_method, gen_gap_merges
  )
  SELECT p_trail_id, fs.field_id, v_master_map_id, p_operation_id, p_vehicle_id,
    v_operator_id, v_operator_name, false,
    fs.start_time, fs.end_time, fs.duration_seconds,
    (SELECT ST_MakeLine(r.coord::geometry ORDER BY r.timestamp) FROM filtered r WHERE r.field_id = fs.field_id),
    (p_trail_width * fs.distance_km * 1000) / 10000, fs.distance_km, fs.point_count,
    v_vehicle_type, v_swath_width,
    fs.intervals, fs.interval_paths,
    p_trail_width, v_trail_color, v_vehicle_marker,
    d.dom_field_id,
    CASE WHEN d.total_pts > 0 THEN ROUND((d.field_pts::numeric / d.total_pts * 100)::numeric, 1) END,
    CASE WHEN d.dom_dist_m_val > 0 AND d.field_id != d.dom_field_id
      THEN ROUND((d.this_dist_m / d.dom_dist_m_val)::numeric, 4) END,
    CASE WHEN v_total_trail_dist_m > 0 THEN ROUND((d.this_dist_m / v_total_trail_dist_m * 100)::numeric, 2) END,
    CASE WHEN d.field_ha > 0 THEN ROUND(((p_trail_width * fs.distance_km * 1000 / 10000) / d.field_ha * 100)::numeric, 2) END,
    0, d.is_edge_noise, 'from_path', d.raw_isl - d.merged_isl
  FROM field_summary fs JOIN diagnostics d ON d.field_id = fs.field_id;

  GET DIAGNOSTICS v_record_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'records_generated', v_record_count);
END;
$$;

-- ── backfill_record_field_path ──
-- Now reads swath_width from trail's vehicle_marker first,
-- falls back to vehicle_state for legacy trails.
CREATE OR REPLACE FUNCTION public.backfill_record_field_path(p_record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
  v_trail_path geometry;
  v_field_boundary geometry;
  v_field_path geometry;
  v_fixed_path bool := false;
  v_fixed_swath bool := false;
  v_sw numeric;
BEGIN
  SELECT sr.id, sr.field_id, sr.trail_id, sr.field_path, sr.swath_width, sr.vehicle_id
  INTO v_record
  FROM spray_records sr
  WHERE sr.id = p_record_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Record not found');
  END IF;

  IF v_record.field_path IS NULL THEN
    SELECT COALESCE(t.detailed_path, t.path)::geometry
    INTO v_trail_path
    FROM trails t
    WHERE t.id = v_record.trail_id;

    IF v_trail_path IS NOT NULL THEN
      SELECT ST_MakeValid(f.boundary::geometry)
      INTO v_field_boundary
      FROM fields f
      WHERE f.field_id = v_record.field_id;

      IF v_field_boundary IS NOT NULL THEN
        SELECT ST_CollectionExtract(
          ST_Intersection(v_trail_path, v_field_boundary), 2
        ) INTO v_field_path;

        IF v_field_path IS NOT NULL AND NOT ST_IsEmpty(v_field_path) THEN
          IF ST_GeometryType(v_field_path) = 'ST_MultiLineString' THEN
            SELECT geom INTO v_field_path
            FROM (SELECT (ST_Dump(v_field_path)).geom) subs
            ORDER BY ST_Length(geom::geography) DESC LIMIT 1;
          END IF;

          UPDATE spray_records SET field_path = v_field_path WHERE id = p_record_id;
          v_fixed_path := true;
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_record.swath_width IS NULL THEN
    SELECT (t.vehicle_marker->>'swath')::numeric
    INTO v_sw
    FROM trails t
    WHERE t.id = v_record.trail_id
      AND t.vehicle_marker IS NOT NULL;

    IF v_sw IS NULL THEN
      SELECT (vs.vehicle_marker->>'swath')::numeric
      INTO v_sw
      FROM vehicle_state vs
      WHERE vs.vehicle_id = v_record.vehicle_id;
    END IF;

    IF v_sw IS NOT NULL THEN
      UPDATE spray_records SET swath_width = v_sw WHERE id = p_record_id;
      v_fixed_swath := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', v_fixed_path OR v_fixed_swath,
    'record_id', p_record_id,
    'fixes', CASE
      WHEN v_fixed_path AND v_fixed_swath THEN '["field_path","swath_width"]'::jsonb
      WHEN v_fixed_path THEN '["field_path"]'::jsonb
      WHEN v_fixed_swath THEN '["swath_width"]'::jsonb
      ELSE '[]'::jsonb
    END
  );
END;
$$;
