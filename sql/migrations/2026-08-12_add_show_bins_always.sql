-- Add show_bins_always setting to user_settings
-- ON = the map shows offscreen tracking circles for every silo bin (with its
-- fill bar + colour), so a farmer can see at a glance where all bins are.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS show_bins_always boolean NOT NULL DEFAULT false;
