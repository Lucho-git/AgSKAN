-- fix_agworld_accounts_user_id
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE agworld_accounts ALTER COLUMN user_id SET DEFAULT auth.uid();
