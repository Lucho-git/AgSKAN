-- add_trail_pauses.sql
-- Trail pause breaks — event table.
--
-- One row per pause event on a trail. Recording stops on pause and resumes
-- later, so the stored geometry has a point gap; these rows mark where that
-- gap should remain a BREAK (drawn as separate parts, no connector line)
-- instead of being stitched back together at close time.
--
-- Size: ~80 bytes per pause row (pauses are rare events — negligible vs the
-- per-point trail payloads). Written on pause, resumed_at filled on resume.
--
-- Access model: mirrors trails / trail_stream (RLS disabled — access is
-- scoped at the API/query layer like the rest of the trail family).
--
-- Safe to apply any time (CREATE TABLE + index only, no rewrites).

CREATE TABLE IF NOT EXISTS public.trail_pauses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trail_id uuid NOT NULL REFERENCES public.trails(id) ON DELETE CASCADE,
    paused_at timestamptz NOT NULL,
    resumed_at timestamptz,
    latitude double precision,
    longitude double precision,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trail_pauses_trail_idx
    ON public.trail_pauses (trail_id, paused_at);

COMMENT ON TABLE public.trail_pauses IS
    'Pause events within a trail: geometry splits between paused_at and resumed_at are rendered as separate parts (no connector).';
