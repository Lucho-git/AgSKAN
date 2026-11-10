-- add_weather_source_setting
-- Applied through the Supabase MCP; text copied from the recorded migration.

alter table user_settings add column weather_source jsonb;
