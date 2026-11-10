-- fix_duplicate_finder_exclude_deleted
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
  WITH field_pairs AS (
    SELECT 
      f1.field_id AS a_id, f1.name AS a_name, 
      ST_Area(f1.boundary::geography) / 10000 AS a_ha,
      fa1.name AS a_farm,
      f2.field_id AS b_id, f2.name AS b_name,
      ST_Area(f2.boundary::geography) / 10000 AS b_ha,
      fb1.name AS b_farm,
      CASE 
        WHEN ST_IsValid(f1.boundary) AND ST_IsValid(f2.boundary) THEN
          ST_Area(ST_Intersection(
            ST_MakeValid(f1.boundary), ST_MakeValid(f2.boundary)
          )::geography) / 10000
        ELSE 0
      END AS overlap
    FROM fields f1
    JOIN fields f2 ON f1.field_id < f2.field_id
    LEFT JOIN farms fa1 ON fa1.id = f1.farm_id
    LEFT JOIN farms fb1 ON fb1.id = f2.farm_id
    WHERE f1.map_id = p_map_id
      AND f2.map_id = p_map_id
      AND f1.boundary IS NOT NULL
      AND f2.boundary IS NOT NULL
      AND f1.deleted_at IS NULL
      AND f2.deleted_at IS NULL
  )
  SELECT 
    a_id, a_name, ROUND(a_ha::numeric, 2), a_farm,
    b_id, b_name, ROUND(b_ha::numeric, 2), b_farm,
    ROUND(overlap::numeric, 2),
    ROUND((overlap / NULLIF(a_ha, 0) * 100)::numeric, 1),
    ROUND((overlap / NULLIF(b_ha, 0) * 100)::numeric, 1)
  FROM field_pairs
  WHERE overlap > 0
    AND (overlap / NULLIF(a_ha, 0) > 0.5 OR overlap / NULLIF(b_ha, 0) > 0.5)
  ORDER BY overlap DESC;
$$;
