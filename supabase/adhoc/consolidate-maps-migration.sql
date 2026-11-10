-- =============================================================================
-- MIGRATION: Consolidate maps into one master_map_id
-- Target: 306b121a-5d6c-4e77-b360-c0af6d080236
-- Users: valtellinaview@agskan.com, kojonupdolomite@gmail.com,
--        ashtongianatti16@gmail.com, oliviajdraper@gmail.com
--
-- Run this in a Supabase SQL Editor TRANSACTION (wrap in BEGIN/COMMIT)
-- =============================================================================

-- ⚠️ WRAP THIS ENTIRE SCRIPT IN A TRANSACTION ⚠️
-- Run: BEGIN; <this script> ROLLBACK;  (to test)
-- Run: BEGIN; <this script> COMMIT;    (to execute for real)

DO $$
DECLARE
  target_map_id UUID := '306b121a-5d6c-4e77-b360-c0af6d080236';
  target_emails TEXT[] := ARRAY[
    'valtellinaview@agskan.com',
    'kojdonupdolomite@gmail.com',
    'ashtongianatti16@gmail.com',
    'oliviajdraper@gmail.com'
  ];
  rec RECORD;
  op_rec RECORD;
  marker_count INT;
  drawing_count INT;
  trail_count INT;
  op_count INT;
  total_maps INT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Starting map consolidation migration';
  RAISE NOTICE 'Target map: %', target_map_id;
  RAISE NOTICE '========================================';

  -- ===========================================================================
  -- Build list of all map IDs connected to these users (same logic as diagnostic)
  -- Uses: direct ownership, markers they've placed, and recent_maps JSONB
  -- ===========================================================================
  CREATE TEMP TABLE maps_to_migrate AS
  WITH target_users AS (
    SELECT id, email FROM profiles
    WHERE email = ANY(target_emails)
  ),
  all_user_map_ids AS (
    -- Maps they own directly
    SELECT mm.id
    FROM master_maps mm
    JOIN target_users u ON u.id = mm.master_user_id
    WHERE mm.id != target_map_id
    UNION
    -- Maps where they've placed markers
    SELECT DISTINCT mk.master_map_id
    FROM map_markers mk
    JOIN target_users u ON u.id = mk.update_user_id
    WHERE mk.master_map_id IS NOT NULL
      AND mk.master_map_id != target_map_id
    UNION
    -- Maps from profiles.recent_maps JSONB
    SELECT DISTINCT (rm->>'map_id')::uuid
    FROM profiles p
    JOIN target_users u ON u.id = p.id,
    jsonb_array_elements(p.recent_maps) rm
    WHERE p.recent_maps IS NOT NULL
      AND (rm->>'map_id')::uuid != target_map_id
  )
  SELECT mm.id, mm.map_name
  FROM all_user_map_ids um
  JOIN master_maps mm ON mm.id = um.id;

  SELECT COUNT(*) INTO total_maps FROM maps_to_migrate;
  RAISE NOTICE 'Found % maps to migrate', total_maps;

  -- ===========================================================================
  -- Step 1: Rename operations and reassign to target map
  -- ===========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- Step 1: Migrating operations ---';

  FOR rec IN SELECT * FROM maps_to_migrate
  LOOP
    SELECT COUNT(*) INTO op_count
    FROM operations WHERE master_map_id = rec.id;

    IF op_count = 1 THEN
      UPDATE operations
      SET name = rec.map_name, master_map_id = target_map_id
      WHERE master_map_id = rec.id;
      RAISE NOTICE '  Map "%" (%) → moved 1 operation, renamed to "%"',
        rec.map_name, rec.id, rec.map_name;
    ELSIF op_count > 1 THEN
      FOR op_rec IN SELECT id, name FROM operations WHERE master_map_id = rec.id
      LOOP
        UPDATE operations
        SET name = rec.map_name || ' - ' || op_rec.name,
            master_map_id = target_map_id
        WHERE id = op_rec.id;
        RAISE NOTICE '  Map "%" → operation "%" renamed to "%"',
          rec.map_name, op_rec.name, rec.map_name || ' - ' || op_rec.name;
      END LOOP;
    ELSE
      RAISE NOTICE '  Map "%" (%) → no operations', rec.map_name, rec.id;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- Step 2: Migrate map_markers
  -- ===========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- Step 2: Migrating map_markers ---';

  FOR rec IN SELECT * FROM maps_to_migrate
  LOOP
    SELECT COUNT(*) INTO marker_count FROM map_markers WHERE master_map_id = rec.id;
    IF marker_count > 0 THEN
      UPDATE map_markers SET master_map_id = target_map_id WHERE master_map_id = rec.id;
      RAISE NOTICE '  Map "%" → moved % markers', rec.map_name, marker_count;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- Step 3: Migrate marker_drawings
  -- ===========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- Step 3: Migrating marker_drawings ---';

  FOR rec IN SELECT * FROM maps_to_migrate
  LOOP
    SELECT COUNT(*) INTO drawing_count FROM marker_drawings WHERE master_map_id = rec.id;
    IF drawing_count > 0 THEN
      UPDATE marker_drawings SET master_map_id = target_map_id WHERE master_map_id = rec.id;
      RAISE NOTICE '  Map "%" → moved % drawings', rec.map_name, drawing_count;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- Step 4: Trail count report (they follow operations, no direct update needed)
  -- ===========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- Step 4: Trail summary (moved via operations) ---';

  SELECT COUNT(*) INTO trail_count
  FROM trails t
  JOIN operations op ON op.id = t.operation_id
  WHERE op.master_map_id = target_map_id;

  RAISE NOTICE '  Total trails now on target map: %', trail_count;

  -- ===========================================================================
  -- Step 5: Summary
  -- ===========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration complete!';
  RAISE NOTICE '  Maps processed: %', total_maps;
  RAISE NOTICE '';
  RAISE NOTICE '  Target map now has:';
  RAISE NOTICE '    Operations: %', (SELECT COUNT(*) FROM operations WHERE master_map_id = target_map_id);
  RAISE NOTICE '    Markers:    %', (SELECT COUNT(*) FROM map_markers WHERE master_map_id = target_map_id);
  RAISE NOTICE '    Drawings:   %', (SELECT COUNT(*) FROM marker_drawings WHERE master_map_id = target_map_id);
  RAISE NOTICE '    Trails:     %', trail_count;
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Old master_maps still exist. To clean them up, run:';
  RAISE NOTICE '    DELETE FROM master_maps WHERE id IN (';
  FOR rec IN SELECT * FROM maps_to_migrate
  LOOP
    RAISE NOTICE '      ''%'',', rec.id;
  END LOOP;
  RAISE NOTICE '    );';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Do NOT delete old maps until you''ve verified the migration looks correct!';

  DROP TABLE IF EXISTS maps_to_migrate;
END $$;
