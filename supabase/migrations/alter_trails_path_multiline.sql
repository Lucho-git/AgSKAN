-- alter_trails_path_multiline.sql
-- Allow multi-part trail geometries (pause breaks).
--
-- Loosens trails.path from geography(LineString,4326) to geography(Geometry,4326)
-- so a trail can be stored as a MULTILINESTRING — one part per work segment,
-- with the pause/resume gap left out. Mapbox draws the parts separately, so
-- the connector line between a pause and a resume simply does not exist.
--
-- Why Geometry (not MultiLineString) as the target type:
--   * Old app versions / scripts that still write single LINESTRING paths keep
--     working with zero writer changes (no ST_Multi wrapping required anywhere).
--   * New paused trails write 2D MULTILINESTRING; un-paused trails may keep
--     writing LINESTRING — both fit.
--
-- trails.detailed_path is unconstrained geography and already accepts
-- MULTILINESTRING M — NO change needed there (verified 2026-09-30).
--
-- !! THIS STATEMENT REWRITES THE ENTIRE trails TABLE (~3.6 GB, ~24k rows) !!
-- Run in a quiet window: the rewrite takes an ACCESS EXCLUSIVE lock, so trail
-- closes/cron writes are blocked for the duration (~minutes). No spatial
-- indexes exist on the table (btree only) — nothing else to rebuild.
--
-- Verified on a scratch table 2026-09-30:
--   * existing LINESTRING rows survive the ALTER unchanged
--   * 2D MULTILINESTRING inserts are accepted afterwards
--   * ST_Length(MultiLineString) excludes the connector (metrics fix)

ALTER TABLE public.trails
    ALTER COLUMN path TYPE geography(Geometry,4326)
    USING path::geometry::geography;
