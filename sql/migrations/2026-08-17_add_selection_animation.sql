-- Add a selection animation setting to user_settings.
-- The selected-marker animation is independent of the marker style:
--   ''             - follow the style's default animation (default)
--   'ring-breathe' - tight ring + glow, gentle breathe
--   'soft-spring'  - spring size pop, then ring breathe
--   'size-pop'     - tight ring hugging the icon + grow to 1.3x
--   'subtle-neon'  - thin glow ring, slow pulse
--   'bounce'       - disc fill + pop, then keep bouncing
alter table public.user_settings
  add column if not exists selection_animation text not null default '';
