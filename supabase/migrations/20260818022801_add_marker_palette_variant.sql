-- add_marker_palette_variant
-- Applied through the Supabase MCP; text copied from the recorded migration.

alter table public.user_settings add column if not exists marker_palette_variant text not null default 'v1';
