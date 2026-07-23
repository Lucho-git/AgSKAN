-- Add vehicle_marker snapshot + trail dimensions to spray_records
-- Preserves the full vehicle config at record generation time
-- Keeps trail_width and trail_color for backwards compatibility

-- ── spray_records ──
ALTER TABLE public.spray_records 
  ADD COLUMN IF NOT EXISTS trail_width numeric,
  ADD COLUMN IF NOT EXISTS trail_color text,
  ADD COLUMN IF NOT EXISTS vehicle_marker jsonb;

-- ── agworld_records (mirrors spray_records structure) ──
ALTER TABLE public.agworld_records 
  ADD COLUMN IF NOT EXISTS trail_width numeric,
  ADD COLUMN IF NOT EXISTS trail_color text,
  ADD COLUMN IF NOT EXISTS vehicle_marker jsonb;
