-- First-run marker onboarding (2026-08-20): the map shows a
-- style → colours popup ONCE (fresh account or after this update). This
-- flag is persisted by userSettingsApi.setMarkerOnboardingDone() when the
-- user completes (or dismisses) the flow, so it never shows again.
alter table public.user_settings
  add column if not exists marker_onboarding_done boolean not null default false;
