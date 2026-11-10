-- add_weather_menu_enabled_setting
-- Applied through the Supabase MCP; text copied from the recorded migration.

alter table user_settings add column weather_menu_enabled boolean not null default false;
