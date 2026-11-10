-- Add auto_confirm_markers setting to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS auto_confirm_markers boolean NOT NULL DEFAULT false;
