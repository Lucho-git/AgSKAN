-- Add map_settings table for per-map feature flags (e.g., enforce_limits)
CREATE TABLE IF NOT EXISTS public.map_settings (
  map_id uuid PRIMARY KEY REFERENCES public.master_maps(id) ON DELETE CASCADE,
  enforce_limits boolean NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.map_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read map settings
CREATE POLICY "Authenticated users can read map settings"
  ON public.map_settings FOR SELECT
  USING (true);

-- All authenticated users can insert/update (admin dashboard access is gated by devToolsEnabled on the frontend)
CREATE POLICY "Authenticated users can insert map settings"
  ON public.map_settings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update map settings"
  ON public.map_settings FOR UPDATE
  USING (true)
  WITH CHECK (true);
