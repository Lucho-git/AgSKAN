-- 2026-08-20: Change default marker/placement menu style to the ON-MAP panel,
-- and default "Camera find on touch hold" to None (no auto-zoom), for ALL
-- existing users (backfill) and new users (column default).
--
-- Marker menu style + placement menu style: bottom panel (false) → on-map
-- panel (true).
ALTER TABLE public.user_settings
  ALTER COLUMN overlay_marker_menu_enabled SET DEFAULT true,
  ALTER COLUMN overlay_placement_menu_enabled SET DEFAULT true;

UPDATE public.user_settings
SET overlay_marker_menu_enabled = true,
    overlay_placement_menu_enabled = true;

-- Camera find on touch hold (zoom to placed markers): zoom (true) → None
-- (false).
ALTER TABLE public.user_settings
  ALTER COLUMN zoom_to_placed_markers SET DEFAULT false;

UPDATE public.user_settings
SET zoom_to_placed_markers = false;
