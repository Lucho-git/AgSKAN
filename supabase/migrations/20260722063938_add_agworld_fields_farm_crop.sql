-- add_agworld_fields_farm_crop
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE public.agworld_fields ADD COLUMN IF NOT EXISTS farm_id text;
ALTER TABLE public.agworld_fields ADD COLUMN IF NOT EXISTS farm_name text;
ALTER TABLE public.agworld_fields ADD COLUMN IF NOT EXISTS crop_type text;
ALTER TABLE public.agworld_fields ADD COLUMN IF NOT EXISTS crop_variety text;
ALTER TABLE public.agworld_fields ADD COLUMN IF NOT EXISTS crop_year integer;
