-- scope_backfill_to_master_map
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Scoped version: get backfill candidates for a specific master map
DROP FUNCTION IF EXISTS public.get_backfill_candidates(int);
CREATE OR REPLACE FUNCTION public.get_backfill_candidates(
  p_count int DEFAULT 10,
  p_master_map_id uuid DEFAULT NULL
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
    AND (p_master_map_id IS NULL OR o.master_map_id = p_master_map_id)
    AND NOT EXISTS (SELECT 1 FROM spray_records sr WHERE sr.trail_id = t.id)
  ORDER BY t.start_time DESC
  LIMIT p_count;
$$;
