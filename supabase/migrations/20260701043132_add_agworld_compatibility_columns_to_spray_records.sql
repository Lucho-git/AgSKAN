-- add_agworld_compatibility_columns_to_spray_records
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Add nullable columns for Agworld compatibility.
-- All are nullable so existing records are unaffected.

-- Activity categorization (derived from operation name or vehicle type)
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS activity_type text;

-- Workflow status: auto_created → confirmed → synced_to_agworld
-- Replaces the boolean operator_confirmed with a richer state.
-- operator_confirmed stays for backward compat (true when status='confirmed' or 'synced_to_agworld')
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS status text DEFAULT 'auto_created';

-- Crop & variety (populated from Agworld import or manual entry)
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS crop text;
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS variety text;

-- Spray volume & rate (from Agworld or manual entry)
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS total_volume_l numeric;
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS application_rate numeric;

-- Cost tracking (from Agworld import)
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS total_cost numeric;

-- Operations data (separate from chem_mix — e.g. "Boomspray application")
-- Matches Agworld's Operations section
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS operations_data jsonb DEFAULT '[]'::jsonb;

-- Plan link (for Agworld plan association)
ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS plan_id text;

-- Index for status-based filtering
CREATE INDEX IF NOT EXISTS idx_spray_records_status ON spray_records(status);

-- Index for operation-based filtering/sorting
CREATE INDEX IF NOT EXISTS idx_spray_records_operation ON spray_records(operation_id, start_time DESC);
