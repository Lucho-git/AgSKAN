-- 2026-09-22: Deprecate the marker/placement menu style options.
-- The app now always uses the on-map overlay menus (MarkerOverlayPanel /
-- MarkerPlacementPanel); the classic bottom MarkerEditPanel was removed.
-- Draw area / draw line keep their bottom-bar styling inside the drawing panel.
--
-- Safe to drop: the columns only ever stored this choice, defaults were true
-- (overlay menus) for every row, and no code reads/writes them anymore.

ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS overlay_marker_menu_enabled;

ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS overlay_placement_menu_enabled;
