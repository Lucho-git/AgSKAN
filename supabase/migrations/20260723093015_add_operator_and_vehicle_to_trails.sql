-- Add operator and vehicle info to trails table
-- Mirrors spray_records so trails can be filtered by operator
-- and preserve the full vehicle config at trail creation time

ALTER TABLE public.trails 
  ADD COLUMN IF NOT EXISTS operator_name text,
  ADD COLUMN IF NOT EXISTS operator_id uuid,
  ADD COLUMN IF NOT EXISTS vehicle_marker jsonb;

COMMENT ON COLUMN public.trails.operator_name IS 'Operator name at trail creation (from operator_sessions → map_operators)';
COMMENT ON COLUMN public.trails.operator_id IS 'Operator UUID at trail creation';
COMMENT ON COLUMN public.trails.vehicle_marker IS 'Full vehicle_state.vehicle_marker snapshot at trail creation';
