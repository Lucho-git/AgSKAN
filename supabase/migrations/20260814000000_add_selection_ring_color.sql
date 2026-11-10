-- Add a selection ring colour setting to user_settings.
-- The selection highlight (ring/glow around the selected marker) is one of:
--   'blue'   - fixed blue highlight
--   'white'  - fixed white highlight
--   'marker' - uses the selected marker's own colour (default)
alter table public.user_settings
  add column if not exists selection_ring_color text not null default 'marker';
