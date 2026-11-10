-- batch_backfill_spray_records
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Batch backfill spray records for closed trails using their path geometry.
-- Only processes trails that don't already have spray records.
CREATE OR REPLACE FUNCTION public.batch_backfill_spray_records(
  p_days_back int DEFAULT 30,
  p_limit int DEFAULT 50,
  p_force_regen boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_trail RECORD;
  v_count int := 0;
  v_processed int := 0;
  v_cutoff timestamptz;
  v_result jsonb;
BEGIN
  v_cutoff := NOW() - (p_days_back || ' days')::interval;

  -- Delete existing records if force_regen
  IF p_force_regen THEN
    DELETE FROM spray_records sr
    USING trails t
    JOIN operations o ON o.id = t.operation_id
    WHERE sr.trail_id = t.id
      AND t.start_time >= v_cutoff
      AND t.path IS NOT NULL;
    RETURN jsonb_build_object('success', true, 'deleted_existing', true);
  END IF;

  -- Process trails that don't have spray records yet
  FOR v_trail IN (
    SELECT t.id, t.vehicle_id, t.operation_id, COALESCE(t.trail_width, 3) AS tw,
           t.start_time, t.end_time,
           COALESCE(t.detailed_path, t.path) AS path_geom
    FROM trails t
    JOIN operations o ON o.id = t.operation_id
    WHERE t.end_time IS NOT NULL
      AND t.path IS NOT NULL
      AND t.start_time >= v_cutoff
      AND NOT EXISTS (SELECT 1 FROM spray_records sr WHERE sr.trail_id = t.id)
    LIMIT p_limit
  ) LOOP
    v_processed := v_processed + 1;
    BEGIN
      v_result := generate_spray_records_from_path(
        v_trail.id, v_trail.vehicle_id, v_trail.operation_id,
        v_trail.tw, v_trail.start_time, v_trail.end_time, v_trail.path_geom
      );
      IF (v_result->>'success')::boolean THEN
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Skip individual failures, continue with next trail
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'records_generated', v_count
  );
END;
$function$;
