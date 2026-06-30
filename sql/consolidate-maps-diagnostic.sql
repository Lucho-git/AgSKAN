-- =============================================================================
-- DIAGNOSTIC: Show all data to be consolidated before migration
-- Run this first in Supabase SQL Editor to review what will be affected
-- =============================================================================

-- First, show the target users' IDs and current map relationships
SELECT
  p.id AS profile_id,
  p.email,
  p.full_name,
  p.master_map_id AS current_selected_map,
  p.recent_maps
FROM profiles p
WHERE p.email IN ('valtellinaview@agskan.com', 'kojdonupdolomite@gmail.com', 'ashtongianatti16@gmail.com', 'oliviajdraper@gmail.com', 'ashtongianatti16@gmail.com', 'oliviajdraper@gmail.com');

-- All maps that reference these users as owner OR have any of their markers/operations
-- This catches maps where the user was added as a collaborator but isn't the owner
WITH target_users AS (
  SELECT id, email, full_name
  FROM profiles
  WHERE email IN ('valtellinaview@agskan.com', 'kojdonupdolomite@gmail.com', 'ashtongianatti16@gmail.com', 'oliviajdraper@gmail.com')
),

-- Find all map IDs linked to these users through ANY relationship
all_user_map_ids AS (
  -- Maps they own directly
  SELECT mm.id, 'owner' AS relationship
  FROM master_maps mm
  JOIN target_users u ON u.id = mm.master_user_id

  UNION

  -- Maps where they've placed markers
  SELECT DISTINCT mk.master_map_id, 'has_markers' AS relationship
  FROM map_markers mk
  JOIN target_users u ON u.id = mk.update_user_id
  WHERE mk.master_map_id IS NOT NULL

  UNION

  -- Maps from profiles.recent_maps JSONB
  SELECT DISTINCT (rm->>'map_id')::uuid, 'in_recent_maps'
  FROM profiles p
  JOIN target_users u ON u.id = p.id,
  jsonb_array_elements(p.recent_maps) rm
  WHERE p.recent_maps IS NOT NULL
),

-- Deduplicate
unique_map_ids AS (
  SELECT id, MIN(relationship) AS relationship
  FROM all_user_map_ids
  GROUP BY id
)

-- Summary per map (excluding the target we're consolidating INTO)
SELECT
  mm.id AS map_id,
  mm.map_name,
  mm.master_user_id,
  COALESCE(po.full_name, 'unknown') AS owner_name,
  mm.created_at AS map_created,
  um.relationship AS first_found_relationship,
  (SELECT COUNT(*) FROM operations op WHERE op.master_map_id = mm.id) AS operation_count,
  (SELECT string_agg(op.name || ' (' || op.year || ')', ', ') FROM operations op WHERE op.master_map_id = mm.id) AS operation_names,
  (SELECT COUNT(*) FROM map_markers mk WHERE mk.master_map_id = mm.id AND (mk.deleted IS NULL OR mk.deleted = false)) AS active_markers,
  (SELECT COUNT(*) FROM map_markers mk WHERE mk.master_map_id = mm.id AND mk.deleted = true) AS deleted_markers,
  (SELECT COUNT(*) FROM marker_drawings md WHERE md.master_map_id = mm.id AND (md.deleted IS NULL OR md.deleted = false)) AS active_drawings,
  (SELECT COUNT(*) FROM marker_drawings md WHERE md.master_map_id = mm.id AND md.deleted = true) AS deleted_drawings,
  (SELECT COUNT(*) FROM trails t JOIN operations op ON op.id = t.operation_id WHERE op.master_map_id = mm.id) AS trail_count
FROM unique_map_ids um
JOIN master_maps mm ON mm.id = um.id
LEFT JOIN profiles po ON po.id = mm.master_user_id
WHERE mm.id != '306b121a-5d6c-4e77-b360-c0af6d080236'
ORDER BY mm.created_at;
