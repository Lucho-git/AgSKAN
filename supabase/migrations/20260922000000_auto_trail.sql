-- ============================================================================
-- Auto trail (experimental) - per-paddock trail recording
-- ============================================================================
-- Auto trail watches the vehicle position client-side and records one trail
-- per field visit:
--   * entering a field (after a short dwell)  -> open a trail (source 'auto')
--   * leaving the field (after a longer dwell) -> close it
--   * between fields                           -> optional 'auto_travel' trail
--
-- Column semantics:
--   trails.source    'manual' (default, HUD button) | 'auto' (in-field) |
--                    'auto_travel' (between-field plumbing, hidden in the UI)
--   trails.field_id  the field a trail belongs to (null for manual + travel)
--
-- 'auto_travel' rows are excluded from all team-facing queries/rendering
-- (map loads, realtime handlers, overlays, summaries) - kept purely for
-- debugging / future visualisation.
-- ============================================================================

alter table public.trails add column if not exists field_id uuid;
alter table public.trails add column if not exists source text not null default 'manual';

alter table public.trails
    add constraint trails_field_id_fkey
    foreign key (field_id) references public.fields(field_id) on delete set null;

alter table public.trails
    add constraint trails_source_check
    check (source in ('manual', 'auto', 'auto_travel'));

create index if not exists trails_field_idx
    on public.trails (field_id, start_time desc);

-- Per-account setting (Profile -> Quick Settings) for the experimental mode.
alter table public.user_settings
    add column if not exists auto_trail_enabled boolean not null default false;
