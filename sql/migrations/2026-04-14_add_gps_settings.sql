-- Migration: add GPS-related settings to user_settings
-- Adds: enable_full_1hz, show_gps_popups

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS enable_full_1hz boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_gps_popups boolean NOT NULL DEFAULT false;

-- Optionally: backfill existing rows if needed (uncomment to run)
-- UPDATE public.user_settings SET enable_full_1hz = false WHERE enable_full_1hz IS NULL;
-- UPDATE public.user_settings SET show_gps_popups = false WHERE show_gps_popups IS NULL;

-- Grant select/update to authenticated role if you require DB-level permissions
-- GRANT SELECT, UPDATE ON public.user_settings TO authenticated;
