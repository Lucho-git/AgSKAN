-- create_agworld_accounts
-- Applied through the Supabase MCP; text copied from the recorded migration.


CREATE TABLE IF NOT EXISTS agworld_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  api_key text NOT NULL,
  instance text NOT NULL DEFAULT 'au',
  grower_id text DEFAULT '',
  linked_map_id text,
  linked_profile_label text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: users can only see their own accounts
ALTER TABLE agworld_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own agworld accounts"
  ON agworld_accounts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
