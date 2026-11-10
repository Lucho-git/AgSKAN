-- add_interval_paths_to_spray_records
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Store per-visit LineString paths so we can render gaps between
-- re-entries without needing trail_stream (which is deleted on close).
-- Format: [{ "path_geojson": {...}, "entry_time": "...", "exit_time": "..." }, ...]
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS interval_paths jsonb DEFAULT '[]'::jsonb;
