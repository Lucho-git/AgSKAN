-- fix_farm_id_to_text
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE public.agworld_fields ALTER COLUMN farm_id TYPE text;
