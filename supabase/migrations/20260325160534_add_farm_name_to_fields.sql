-- Migration: Create farms table and migrate fields.farm_name → fields.farm_id
-- Purpose: Farms are first-class entities, decoupled from fields

-- ============================================================
-- 1. Create the farms table
-- ============================================================
CREATE TABLE IF NOT EXISTS farms (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id      UUID NOT NULL REFERENCES master_maps(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_farm_per_map UNIQUE (map_id, name)
);

CREATE INDEX IF NOT EXISTS idx_farms_map_id
  ON farms (map_id);

-- ============================================================
-- 2. Seed farms from existing field farm_name values
-- ============================================================
INSERT INTO farms (map_id, name)
SELECT DISTINCT f.map_id, f.farm_name
FROM fields f
WHERE f.farm_name IS NOT NULL
ON CONFLICT (map_id, name) DO NOTHING;

-- ============================================================
-- 3. Ensure every master_map has at least one default farm
--    (uses the map's own name)
-- ============================================================
INSERT INTO farms (map_id, name)
SELECT mm.id, mm.map_name
FROM master_maps mm
WHERE NOT EXISTS (
  SELECT 1 FROM farms fa WHERE fa.map_id = mm.id
)
ON CONFLICT (map_id, name) DO NOTHING;

-- ============================================================
-- 4. Add farm_id FK column to fields
-- ============================================================
ALTER TABLE fields
  ADD COLUMN IF NOT EXISTS farm_id UUID REFERENCES farms(id) ON DELETE SET NULL;

-- ============================================================
-- 5. Backfill farm_id from the matching farm row
-- ============================================================
UPDATE fields f
SET farm_id = fa.id
FROM farms fa
WHERE f.map_id = fa.map_id
  AND f.farm_name = fa.name
  AND f.farm_id IS NULL;

-- For any remaining fields with NULL farm_name,
-- assign the map's earliest farm
UPDATE fields f
SET farm_id = (
  SELECT fa.id FROM farms fa
  WHERE fa.map_id = f.map_id
  ORDER BY fa.created_at ASC
  LIMIT 1
)
WHERE f.farm_id IS NULL;

-- ============================================================
-- 6. Drop old constraint, column, and index
-- ============================================================
ALTER TABLE fields
  DROP CONSTRAINT IF EXISTS unique_field_per_map_farm;

DROP INDEX IF EXISTS idx_fields_map_farm;

ALTER TABLE fields
  DROP COLUMN IF EXISTS farm_name;

-- ============================================================
-- 7. New unique constraint and index using farm_id
-- ============================================================
ALTER TABLE fields
  ADD CONSTRAINT unique_field_per_map_farm UNIQUE (map_id, name, farm_id);

CREATE INDEX IF NOT EXISTS idx_fields_farm_id
  ON fields (farm_id);
