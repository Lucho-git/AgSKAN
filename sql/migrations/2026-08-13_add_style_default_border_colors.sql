-- Per-style default BORDER marker colours, stored as a JSON map:
--   {"original": "black", ...}
-- Separate from style_default_colors (the fill). Used for the ring/rim of a
-- marker that has no explicit colour set. Absent keys = border matches the
-- marker's fill colour.
alter table public.user_settings
  add column if not exists style_default_border_colors jsonb not null default '{}'::jsonb;
