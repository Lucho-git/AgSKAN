-- add_road_overlays_enabled_setting
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Per-user toggle for the experimental "Road Overlays" toolbox menu.
-- Default OFF: it's a custom tool not everyone uses.
alter table public.user_settings
  add column if not exists road_overlays_enabled boolean not null default false;

comment on column public.user_settings.road_overlays_enabled is
  'When true, show the Road Overlays (KMZ) menu in the map toolbox.';

notify pgrst, 'reload schema';
