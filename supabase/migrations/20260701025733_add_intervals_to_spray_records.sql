-- add_intervals_to_spray_records
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Add intervals column to spray_records for storing per-visit segments
-- Each interval = {entry_time, exit_time, duration_seconds, distance_km, point_count}
-- If a vehicle exits and re-enters a field, there will be multiple intervals.
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS intervals jsonb DEFAULT '[]'::jsonb;
