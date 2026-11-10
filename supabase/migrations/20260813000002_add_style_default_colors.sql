-- Per-style default marker colours, stored as a JSON map:
--   {"circle-fill": "blue", "icon-only": "black", ...}
-- Used when a marker has no explicit colour set (marker_color = "default").
alter table public.user_settings
  add column if not exists style_default_colors jsonb not null default '{}'::jsonb;
