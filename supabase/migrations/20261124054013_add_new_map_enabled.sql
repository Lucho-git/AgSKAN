-- Per-user switch: the account menu's Map button opens the new map viewer
-- (/account/map-preview) instead of the current one. Off by default.
alter table public.user_settings
  add column if not exists new_map_enabled boolean not null default false;

comment on column public.user_settings.new_map_enabled is
  'Open the new map viewer from the Map button (opt-in preview). Default off.';
