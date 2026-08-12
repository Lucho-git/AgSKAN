-- Flip the show_vehicles_always default to ON: new accounts + existing
-- accounts with no explicit value should have vehicle edge tracking enabled.
-- (Existing saved "off" preferences are left untouched.)
ALTER TABLE public.user_settings
  ALTER COLUMN show_vehicles_always SET DEFAULT true;

UPDATE public.user_settings
  SET show_vehicles_always = true
  WHERE show_vehicles_always IS NULL;
