-- add_agworld_fields
-- Applied through the Supabase MCP; text copied from the recorded migration.

CREATE TABLE IF NOT EXISTS public.agworld_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  agworld_field_name text NOT NULL,
  name text NOT NULL,
  area numeric NOT NULL,
  boundary geometry(Geometry,4326),
  map_id uuid,
  farm_id uuid,
  properties jsonb,
  polygon_areas jsonb,
  icon text DEFAULT 'ð¾',
  color text DEFAULT 'default',
  field_type text DEFAULT 'agworld',
  name_source text,
  geometry_source text,
  category text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agworld_fields_account ON public.agworld_fields(account_id);
CREATE INDEX IF NOT EXISTS idx_agworld_fields_map ON public.agworld_fields(map_id);
