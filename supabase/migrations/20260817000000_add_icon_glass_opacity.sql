-- Add a single "Icon only glass" opacity setting to user_settings.
-- Controls how strong the translucent disc behind an "Icon only light/dark"
-- marker is (0 = invisible, 1 = solid). Defaults to 0.5 (midway) - replaces
-- the old baked-in per-variant alphas (dark 0.55 / light 0.38).
alter table public.user_settings
  add column if not exists icon_glass_opacity double precision not null default 0.5;
