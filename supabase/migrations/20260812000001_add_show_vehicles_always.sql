-- Add show_vehicles_always setting to user_settings
-- ON = the map shows offscreen tracking dots at the map edge for every
-- vehicle that has moved within the last 3 minutes (with its icon + heading).
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS show_vehicles_always boolean NOT NULL DEFAULT false;
