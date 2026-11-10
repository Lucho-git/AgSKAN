-- ============================================================================
-- Chaser rail visibility — per-chaser "show on the side rail" preference
-- ============================================================================
-- Chaser buttons on the map's quick-action rail are per-viewer and OFF by
-- default: the rail starts clean and each operator switches on the chasers
-- they want to keep an eye on. The choice belongs to the viewer (not the
-- machine's owner), so it lives in user_settings as a { vehicleId: true } map
-- — same shape as layer_visibility — instead of on the marker/vehicle row.
--
-- This also removes the short-lived chaser_loads.show_on_rail column that an
-- earlier pass added before the preference moved to per-viewer storage.
-- ============================================================================

alter table public.user_settings
    add column if not exists chaser_rail_visibility jsonb not null default '{}'::jsonb;

comment on column public.user_settings.chaser_rail_visibility is
    'Per-viewer map of chaser operator id → show that chaser''s button on the map quick-action rail. Missing = off.';

alter table public.chaser_loads
    drop column if exists show_on_rail;
