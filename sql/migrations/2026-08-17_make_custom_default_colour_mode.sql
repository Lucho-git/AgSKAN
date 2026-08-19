-- Make "custom" (per marker type, with preselected colours) the default
-- marker default-colour mode. The single colour choice (with Random as a
-- swatch option) is the other mode.
-- Legacy values:
--   'per-type' -> 'custom' (same thing, renamed)
--   'random'   -> 'single' + marker_default_color = 'random' (random is now
--                  a colour choice, not a mode)
--   'single'   -> 'custom' (make custom the default for everyone)
alter table public.user_settings
  alter column marker_default_color_mode set default 'custom';

update public.user_settings
  set marker_default_color_mode = 'custom'
  where marker_default_color_mode = 'per-type';

update public.user_settings
  set marker_default_color_mode = 'single',
      marker_default_color = 'random'
  where marker_default_color_mode = 'random';

update public.user_settings
  set marker_default_color_mode = 'custom'
  where marker_default_color_mode = 'single';
