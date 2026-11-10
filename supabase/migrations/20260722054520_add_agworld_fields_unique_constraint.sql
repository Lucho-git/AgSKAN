-- add_agworld_fields_unique_constraint
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE public.agworld_fields ADD CONSTRAINT agworld_fields_account_field_unique UNIQUE (account_id, field_id);
