-- Save per-user map layer visibility preferences.
-- Run this in Supabase SQL Editor or through your migration flow.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS layer_visibility jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.user_settings
SET layer_visibility = '{}'::jsonb
WHERE layer_visibility IS NULL;

COMMENT ON COLUMN public.user_settings.layer_visibility IS
  'Per-user map layer visibility preferences for the map toolbox layer menu.';

-- Refresh PostgREST/Supabase schema cache so API writes can see the new column immediately.
NOTIFY pgrst, 'reload schema';