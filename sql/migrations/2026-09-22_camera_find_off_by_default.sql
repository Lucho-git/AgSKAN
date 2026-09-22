-- 2026-09-22: Camera find on quick drop / touch hold OFF by default.
-- Both auto-zoom behaviours are optional and now default to off for every
-- account (new rows via the column defaults, existing rows via backfill).
-- Mirrors the app-side defaults (userSettingsStore + settings fallbacks).

ALTER TABLE public.user_settings
  ALTER COLUMN zoom_to_location_markers SET DEFAULT false;

ALTER TABLE public.user_settings
  ALTER COLUMN zoom_to_placed_markers SET DEFAULT false;

UPDATE public.user_settings
  SET zoom_to_location_markers = false
  WHERE zoom_to_location_markers = true;

UPDATE public.user_settings
  SET zoom_to_placed_markers = false
  WHERE zoom_to_placed_markers = true;
