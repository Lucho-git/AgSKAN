-- Add overlay_placement_menu_enabled setting to user_settings.
-- When ON, newly placed (unconfirmed) markers open the overlay-style
-- MarkerPlacementPanel instead of the classic bottom MarkerEditPanel.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS overlay_placement_menu_enabled boolean NOT NULL DEFAULT false;
