-- add_trail_pause_paths.sql
-- Storage for the paused transfer stretch ("ant line" connector).
--
-- Recording now continues while paused (movement-gated on the client), and
-- the close partition routes those points here instead of dropping the
-- connector: `pause_path` (2D display) + `pause_detailed_path` (M = epoch ms),
-- both MULTILINESTRING when a trail has more than one paused stretch.
--
-- trails.detailed_path / path keep the WORK parts only (as before) — the map
-- renders pause_path as a dotted line, so nothing double-draws.
--
-- Both columns are nullable: older trails and un-paused trails simply have no
-- connector. ADD COLUMN is metadata-only in PG11+ (no table rewrite).

ALTER TABLE public.trails
    ADD COLUMN IF NOT EXISTS pause_path geography(Geometry,4326);

ALTER TABLE public.trails
    ADD COLUMN IF NOT EXISTS pause_detailed_path geography;
