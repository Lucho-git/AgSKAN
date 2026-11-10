-- fix_agworld_fields_id_type
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE public.agworld_fields DROP CONSTRAINT IF EXISTS agworld_fields_account_field_unique;
ALTER TABLE public.agworld_fields ADD CONSTRAINT agworld_fields_account_field_ref_unique UNIQUE (account_id, agworld_field_ref);
