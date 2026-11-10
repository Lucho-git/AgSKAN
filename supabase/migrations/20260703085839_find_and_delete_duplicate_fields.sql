-- find_and_delete_duplicate_fields
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Find duplicate fields: pairs where one covers >50% of the other
CREATE OR REPLACE FUNCTION public.find_duplicate_fields(p_map_id uuid)
RETURNS TABLE(
  field_a_id uuid, field_a_name text, field_a_area_ha numeric,
  field_b_id uuid, field_b_name text, field_b_area_ha numeric,
  overlap_ha numeric, overlap_pct_a numeric, overlap_pct_b numeric
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH field_pairs AS (
    SELECT 
      f1.field_id AS a_id, f1.name AS a_name, 
      ST_Area(f1.boundary::geography) / 10000 AS a_ha,
      f2.field_id AS b_id, f2.name AS b_name,
      ST_Area(f2.boundary::geography) / 10000 AS b_ha,
      CASE 
        WHEN ST_IsValid(f1.boundary) AND ST_IsValid(f2.boundary) THEN
          ST_Area(ST_Intersection(
            ST_MakeValid(f1.boundary), ST_MakeValid(f2.boundary)
          )::geography) / 10000
        ELSE 0
      END AS overlap
    FROM fields f1
    JOIN fields f2 ON f1.field_id < f2.field_id
    WHERE f1.map_id = p_map_id
      AND f2.map_id = p_map_id
      AND f1.boundary IS NOT NULL
      AND f2.boundary IS NOT NULL
  )
  SELECT 
    a_id, a_name, ROUND(a_ha::numeric, 2),
    b_id, b_name, ROUND(b_ha::numeric, 2),
    ROUND(overlap::numeric, 2),
    ROUND((overlap / NULLIF(a_ha, 0) * 100)::numeric, 1),
    ROUND((overlap / NULLIF(b_ha, 0) * 100)::numeric, 1)
  FROM field_pairs
  WHERE overlap > 0
    AND (overlap / NULLIF(a_ha, 0) > 0.5 OR overlap / NULLIF(b_ha, 0) > 0.5)
  ORDER BY overlap DESC;
$$;

-- Delete a field and optionally reassign its spray records to another field
CREATE OR REPLACE FUNCTION public.delete_duplicate_field(
  p_delete_field_id uuid,
  p_keep_field_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_reassigned int := 0;
BEGIN
  -- If a keep field is specified, reassign spray records
  IF p_keep_field_id IS NOT NULL THEN
    UPDATE spray_records 
    SET field_id = p_keep_field_id
    WHERE field_id = p_delete_field_id;
    GET DIAGNOSTICS v_reassigned = ROW_COUNT;
  END IF;

  -- Delete the duplicate field (cascade will handle references)
  DELETE FROM fields WHERE field_id = p_delete_field_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_field', p_delete_field_id,
    'reassigned_records', v_reassigned
  );
END;
$function$;
