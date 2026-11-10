-- boundary_detection_ignore_holes_multipolygon
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Add a helper function that returns the "solid" version of a field boundary:
-- for each polygon, only the exterior ring (ignoring holes/occlusions).
-- For multipolygons, unions all exterior rings into a single multipolygon.
-- This means a point inside the outer boundary counts as "in" even if it's
-- in a hole/dam/rock outcrop within the field.
CREATE OR REPLACE FUNCTION public.field_solid_boundary(field_geom geometry)
RETURNS geometry
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ST_Collect(
    ST_MakePolygon(ST_ExteriorRing(geom))
  )
  FROM (
    SELECT (ST_Dump(field_geom)).geom AS geom
  ) dumped
  WHERE ST_GeometryType(geom) IN ('ST_Polygon', 'ST_MultiPolygon')
$$;

-- Add a generated column to fields for the solid boundary (for performance)
ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS boundary_solid geometry;

-- Backfill existing fields
UPDATE public.fields 
SET boundary_solid = public.field_solid_boundary(boundary)
WHERE boundary IS NOT NULL;

-- Add index for fast point-in-polygon lookups
CREATE INDEX IF NOT EXISTS fields_boundary_solid_idx 
  ON public.fields USING GIST (boundary_solid);
