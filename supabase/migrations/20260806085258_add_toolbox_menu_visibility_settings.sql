-- add_toolbox_menu_visibility_settings
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Per-user toggles for which toolbox menus are visible.
-- Default ON: these are standard tools; users can hide them to declutter.
alter table public.user_settings
  add column if not exists satellite_menu_enabled boolean not null default true,
  add column if not exists measure_menu_enabled boolean not null default true,
  add column if not exists flash_menu_enabled boolean not null default true,
  add column if not exists rock_picking_menu_enabled boolean not null default true;

comment on column public.user_settings.satellite_menu_enabled is
  'Show the Satellite menu in the map toolbox.';
comment on column public.user_settings.measure_menu_enabled is
  'Show the Measure menu in the map toolbox.';
comment on column public.user_settings.flash_menu_enabled is
  'Show the Flash Signal menu in the map toolbox.';
comment on column public.user_settings.rock_picking_menu_enabled is
  'Show the Rock Picking menu in the map toolbox.';

notify pgrst, 'reload schema';
