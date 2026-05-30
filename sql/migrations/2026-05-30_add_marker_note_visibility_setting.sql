-- Store per-marker note label visibility inside existing marker_data JSONB.
-- Missing note_label_visible values are treated as true by the app, so this backfill is optional.
UPDATE public.map_markers
SET marker_data = jsonb_set(
  jsonb_set(
    marker_data,
    '{properties}',
    COALESCE(marker_data->'properties', '{}'::jsonb),
    true
  ),
  '{properties,note_label_visible}',
  'true'::jsonb,
  true
)
WHERE marker_data IS NOT NULL
  AND marker_data #> '{properties,note_label_visible}' IS NULL;