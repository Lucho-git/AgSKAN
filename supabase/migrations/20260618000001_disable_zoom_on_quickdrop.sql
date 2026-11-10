-- Change zoom_to_location_markers default to false and backfill existing rows
ALTER TABLE public.user_settings
  ALTER COLUMN zoom_to_location_markers SET DEFAULT false;

UPDATE public.user_settings
  SET zoom_to_location_markers = false
  WHERE zoom_to_location_markers = true;
