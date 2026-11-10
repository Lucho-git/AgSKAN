-- create_agworld_activities
-- Applied through the Supabase MCP; text copied from the recorded migration.


-- Agworld activity data synced from Agworld API
CREATE TABLE IF NOT EXISTS agworld_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL,
  agworld_id text NOT NULL,
  agworld_type text NOT NULL CHECK (agworld_type IN ('actual', 'work_order', 'plan')),
  field_boundary_id text,
  field_id text,
  data jsonb NOT NULL,
  status text,
  name text,
  started_at timestamptz,
  completed_at timestamptz,
  due_date timestamptz,
  planned_date timestamptz,
  updated_at_agworld timestamptz,
  synced_at timestamptz DEFAULT now(),
  CONSTRAINT uq_agworld_activity UNIQUE (account_id, agworld_id, agworld_type)
);

CREATE INDEX IF NOT EXISTS idx_agworld_activities_account ON agworld_activities (account_id);
CREATE INDEX IF NOT EXISTS idx_agworld_activities_boundary ON agworld_activities (field_boundary_id);
CREATE INDEX IF NOT EXISTS idx_agworld_activities_type ON agworld_activities (agworld_type);

-- Track last sync time per field
ALTER TABLE agworld_fields ADD COLUMN IF NOT EXISTS last_activity_sync_at timestamptz;
