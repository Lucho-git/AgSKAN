-- add_agworld_records_unique
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE public.agworld_records 
ADD CONSTRAINT agworld_records_trail_field_unique 
UNIQUE (trail_id, agworld_field_id)
