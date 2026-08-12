-- Add overlay_marker_menu_enabled setting to user_settings.
-- When ON, all (non-silo) markers use the new on-map overlay marker menu
-- (MarkerOverlayPanel); when OFF, they use the classic MarkerEditPanel.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS overlay_marker_menu_enabled boolean NOT NULL DEFAULT false;
