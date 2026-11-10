-- add_spray_confirm_setting
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS spray_confirm_enabled boolean DEFAULT false;
