-- backfill_legacy_marker_icon_classes
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Backfill removed/renamed marker icon classes to their current equivalents.
-- The old classes no longer exist in the picker and (for the fiver_* ones)
-- no longer have PNG/glyph art. Counts at time of writing:
--   custom-svg-fiver_rabbit    (80) -> custom-svg-fiver2_rabbit
--   custom-svg-fiver_kangaroo  (1)  -> custom-svg-fiver2_kangaroo
--   custom-svg-fiver_crossing  (1)  -> custom-svg-fiver2_crossing
--   custom-svg-undefined       (2)  -> default
-- NOTE: custom-svg-kangaroo (427) is NOT touched — its art was restored.
update map_markers
set marker_data = jsonb_set(marker_data, '{properties,icon}', '"custom-svg-fiver2_rabbit"'::jsonb, false),
    updated_at = now()
where marker_data->'properties'->>'icon' = 'custom-svg-fiver_rabbit';

update map_markers
set marker_data = jsonb_set(marker_data, '{properties,icon}', '"custom-svg-fiver2_kangaroo"'::jsonb, false),
    updated_at = now()
where marker_data->'properties'->>'icon' = 'custom-svg-fiver_kangaroo';

update map_markers
set marker_data = jsonb_set(marker_data, '{properties,icon}', '"custom-svg-fiver2_crossing"'::jsonb, false),
    updated_at = now()
where marker_data->'properties'->>'icon' = 'custom-svg-fiver_crossing';

update map_markers
set marker_data = jsonb_set(marker_data, '{properties,icon}', '"default"'::jsonb, false),
    updated_at = now()
where marker_data->'properties'->>'icon' = 'custom-svg-undefined';
