-- fix_dedup_in_find_duplicates
-- Applied through the Supabase MCP; text copied from the recorded migration.

CREATE OR REPLACE FUNCTION public.find_duplicate_fields(p_map_id uuid)
RETURNS TABLE(
  field_a_id uuid, field_a_name text, field_a_area_ha numeric, field_a_farm text,
  field_b_id uuid, field_b_name text, field_b_area_ha numeric, field_b_farm text,
  overlap_ha numeric, overlap_pct_a numeric, overlap_pct_b numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH raw_pairs AS (
    SELECT 
      f1.field_id AS id1, f1.name AS name1, ST_Area(f1.boundary::geography)/10000 AS ha1, fa1.name AS farm1,
      f2.field_id AS id2, f2.name AS name2, ST_Area(f2.boundary::geography)/10000 AS ha2, fb1.name AS farm2,
      CASE WHEN ST_IsValid(f1.boundary) AND ST_IsValid(f2.boundary) THEN
        ST_Area(ST_Intersection(ST_MakeValid(f1.boundary), ST_MakeValid(f2.boundary))::geography)/10000
      ELSE 0 END AS overlap
    FROM fields f1
    JOIN fields f2 ON f1.field_id < f2.field_id
    LEFT JOIN farms fa1 ON fa1.id = f1.farm_id
    LEFT JOIN farms fb1 ON fb1.id = f2.farm_id
    WHERE f1.map_id = p_map_id AND f2.map_id = p_map_id
      AND f1.boundary IS NOT NULL AND f2.boundary IS NOT NULL
      AND f1.deleted_at IS NULL AND f2.deleted_at IS NULL
  ),
  -- Sort each pair so (farm_a, name_a) <= (farm_b, name_b) consistently
  sorted_pairs AS (
    SELECT 
      CASE WHEN COALESCE(farm1,'') <= COALESCE(farm2,'') THEN id1 ELSE id2 END AS a_id,
      CASE WHEN COALESCE(farm1,'') <= COALESCE(farm2,'') THEN name1 ELSE name2 END AS a_name,
      CASE WHEN COALESCE(farm1,'') <= COALESCE(farm2,'') THEN ha1 ELSE ha2 END AS a_ha,
      CASE WHEN COALESCE(farm1,'') <= COALESCE(farm2,'') THEN farm1 ELSE farm2 END AS a_farm,
      CASE WHEN COALESCE(farm1,'') <= COALESCE(farm2,'') THEN id2 ELSE id1 END AS b_id,
      CASE WHEN COALESCE(farm1,'') <= COALESCE(farm2,'') THEN name2 ELSE name1 END AS b_name,
      CASE WHEN COALESCE(farm1,'') <= COALESCE(farm2,'') THEN ha2 ELSE ha1 END AS b_ha,
      CASE WHEN COALESCE(farm1,'') <= COALESCE(farm2,'') THEN farm2 ELSE farm1 END AS b_farm,
      overlap
    FROM raw_pairs
    WHERE overlap > 0
  )
  SELECT 
    a_id, a_name, ROUND(a_ha::numeric, 2), a_farm,
    b_id, b_name, ROUND(b_ha::numeric, 2), b_farm,
    ROUND(overlap::numeric, 2),
    ROUND((overlap / NULLIF(a_ha, 0) * 100)::numeric, 1),
    ROUND((overlap / NULLIF(b_ha, 0) * 100)::numeric, 1)
  FROM sorted_pairs
  WHERE overlap / NULLIF(a_ha, 0) > 0.5 OR overlap / NULLIF(b_ha, 0) > 0.5
  ORDER BY overlap DESC;
$$;
