-- default_palette_variant_vivid
-- Applied through the Supabase MCP; text copied from the recorded migration.

alter table public.user_settings alter column marker_palette_variant set default 'v2';
