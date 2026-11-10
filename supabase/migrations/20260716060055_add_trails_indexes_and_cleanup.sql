-- Add indexes to trails table to fix query timeouts
-- The slowest query pattern: WHERE operation_id = X AND end_time IS NOT NULL ORDER BY start_time
CREATE INDEX IF NOT EXISTS idx_trails_operation_end_start
  ON public.trails (operation_id, end_time, start_time);

-- Open trail lookup by vehicle: WHERE vehicle_id = X AND end_time IS NULL
CREATE INDEX IF NOT EXISTS idx_trails_vehicle_end
  ON public.trails (vehicle_id, end_time);

-- Drop duplicate indexes on trail_stream (the unique constraint already covers (trail_id, timestamp))
DROP INDEX IF EXISTS public.idx_trail_stream_trail_timestamp;
DROP INDEX IF EXISTS public.idx_trail_stream_trail_id_timestamp;
