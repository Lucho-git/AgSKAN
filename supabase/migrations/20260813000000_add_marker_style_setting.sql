-- Add a global marker style (tint mode) setting to user_settings.
-- The style selected here is applied to EVERY marker on the map.
alter table public.user_settings
  add column if not exists marker_style text not null default 'original';
