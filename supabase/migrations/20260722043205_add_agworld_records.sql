-- add_agworld_records
-- Applied through the Supabase MCP; text copied from the recorded migration.

CREATE TABLE IF NOT EXISTS public.agworld_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  agworld_field_id text NOT NULL,
  agworld_field_name text,
  agworld_boundary jsonb,
  master_map_id uuid,
  trail_id uuid,
  operation_id uuid,
  vehicle_id uuid,
  operator_name text,
  field_path jsonb,
  area_hectares numeric,
  distance_km numeric,
  point_count integer,
  start_time timestamptz,
  end_time timestamptz,
  duration_seconds integer,
  activity_type text,
  status text DEFAULT 'pending',
  crop text,
  variety text,
  total_volume_l numeric,
  application_rate numeric,
  chem_mix jsonb,
  weather_data jsonb,
  gen_pct_of_field numeric,
  gen_pct_of_trail numeric,
  gen_method text,
  agworld_actual_id text,
  agworld_field_crop_id text,
  agworld_plan_id text,
  enriched boolean DEFAULT false,
  enriched_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agworld_records_account ON public.agworld_records(account_id);
CREATE INDEX IF NOT EXISTS idx_agworld_records_field ON public.agworld_records(agworld_field_id);
CREATE INDEX IF NOT EXISTS idx_agworld_records_trail ON public.agworld_records(trail_id);
CREATE INDEX IF NOT EXISTS idx_agworld_records_status ON public.agworld_records(status);
