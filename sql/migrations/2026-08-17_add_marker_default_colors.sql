-- Marker default colours: how a marker with no colour set gets its colour.
--   marker_default_color_mode: 'single' (one colour for all) | 'random' |
--     'per-type' (a set colour for each marker type).
--   marker_default_color: the single colour used in 'single' mode (and the
--     fallback for a type with no specific colour in 'per-type' mode).
--   marker_type_default_colors: {iconClass: colourKey} per-type overrides.
alter table public.user_settings
  add column if not exists marker_default_color_mode text not null default 'single';
alter table public.user_settings
  add column if not exists marker_default_color text not null default 'blue';
alter table public.user_settings
  add column if not exists marker_type_default_colors jsonb not null default '{}'::jsonb;

-- The "Icon only" translucency default is now 30% (was 50%): update the
-- column default and move existing users who are still on the old default.
alter table public.user_settings
  alter column icon_glass_opacity set default 0.3;
update public.user_settings
  set icon_glass_opacity = 0.3
  where icon_glass_opacity = 0.5;
