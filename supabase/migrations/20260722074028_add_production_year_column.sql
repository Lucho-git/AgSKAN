-- add_production_year_column
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE public.agworld_fields ADD COLUMN IF NOT EXISTS production_year integer;
ALTER TABLE public.agworld_fields DROP CONSTRAINT IF EXISTS agworld_fields_account_field_ref_unique;
-- New unique: one row per account + agworld field + production year
ALTER TABLE public.agworld_fields ADD CONSTRAINT agworld_fields_account_field_year_unique UNIQUE (account_id, agworld_field_ref, production_year);
