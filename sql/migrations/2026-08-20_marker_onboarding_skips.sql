-- First-run marker onboarding (2026-08-20): "Not now" on the intro dismisses
-- it WITHOUT marking it done, so it comes back on the next map load. This
-- counter tracks those dismissals; after 3 (marker_onboarding_skips >= 3)
-- the flag is set done and it stops. Reset by
-- userSettingsApi.resetMarkerOnboarding() (the dev "Reset first-run prompt"
-- button zeroes both this and marker_onboarding_done).
alter table public.user_settings
  add column if not exists marker_onboarding_skips integer not null default 0;
