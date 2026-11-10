-- simplify_backfill_rpc_list_mode
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Get a list of trail IDs that need backfill (don't have spray records yet)
-- Returns just the IDs so the frontend can call generate_spray_records_from_path
-- one at a time to avoid timeouts.
CREATE OR REPLACE FUNCTION public.get_backfill_candidates(
  p_count int DEFAULT 10
)
RETURNS TABLE (trail_id uuid)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT t.id
  FROM trails t
  JOIN operations o ON o.id = t.operation_id
  WHERE t.end_time IS NOT NULL
    AND t.path IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM spray_records sr WHERE sr.trail_id = t.id)
  ORDER BY t.start_time DESC
  LIMIT p_count;
$$;

-- Simplified batch that processes ONE trail and immediately returns
CREATE OR REPLACE FUNCTION public.backfill_one_trail(p_trail_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_trail RECORD;
BEGIN
  SELECT t.id, t.vehicle_id, t.operation_id, COALESCE(t.trail_width, 3) AS tw,
         t.start_time, t.end_time,
         COALESCE(t.detailed_path, t.path) AS path_geom
  INTO v_trail
  FROM trails t
  WHERE t.id = p_trail_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trail not found');
  END IF;

  RETURN generate_spray_records_from_path(
    v_trail.id, v_trail.vehicle_id, v_trail.operation_id,
    v_trail.tw, v_trail.start_time, v_trail.end_time, v_trail.path_geom
  );
END;
$function$;
