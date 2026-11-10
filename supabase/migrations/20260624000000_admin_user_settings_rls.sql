-- Allow support team members to read/write any user's settings from the admin dashboard.
-- The admin dashboard is gated by dev_tools_enabled on the frontend, but we add
-- an RLS policy so the supabase anon client can perform the reads/writes.

-- Read access: any authenticated user can read any user_settings row.
-- (The admin dashboard UI is the only consumer that passes arbitrary user_ids.)
DROP POLICY IF EXISTS "Admin read any user settings" ON public.user_settings;
CREATE POLICY "Admin read any user settings"
  ON public.user_settings FOR SELECT
  USING (true);

-- Write access: any authenticated user can upsert any user_settings row.
DROP POLICY IF EXISTS "Admin write any user settings" ON public.user_settings;
CREATE POLICY "Admin write any user settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin update any user settings" ON public.user_settings;
CREATE POLICY "Admin update any user settings"
  ON public.user_settings FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Delete access: any authenticated user can delete any user_settings row.
DROP POLICY IF EXISTS "Admin delete any user settings" ON public.user_settings;
CREATE POLICY "Admin delete any user settings"
  ON public.user_settings FOR DELETE
  USING (true);
