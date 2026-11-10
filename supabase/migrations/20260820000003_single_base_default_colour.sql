-- The "Marker default colours" system now has ONE concept: an "All markers"
-- base colour + per-type overrides. The old single/custom MODE is obsolete
-- (markerDefaultColorMode is ignored; the UI always writes 'single').
--
-- marker_default_color can now be:
--   'default' — the style's original neutral default (STYLE_DEFAULT_COLORS);
--               markers with no colour set fall back to it. NEW DEFAULT.
--   'random'  — every marker with no colour set gets a stable random colour.
--   <colour>  — every marker with no colour set uses that colour.
-- Per-type overrides (marker_type_default_colors) always win over the base.
alter table public.user_settings
  alter column marker_default_color set default 'default';

-- 'blue' was the old DB/store fallback and reads as "never chosen". In the
-- new model it would turn every uncoloured marker blue, so reset those rows
-- to the original neutral default ('blue' is still pickable in the UI).
update public.user_settings
  set marker_default_color = 'default'
  where marker_default_color = 'blue';

-- The mode is no longer used; normalise it for tidiness.
update public.user_settings
  set marker_default_color_mode = 'single'
  where marker_default_color_mode is distinct from 'single';
