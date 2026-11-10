-- ── Preview: Headless maps with data inventory ──────────────────────
-- Shows every map whose owner is NOT connected, along with the owner's
-- name and counts of markers, fields, trails, operations, and members.
-- Run this FIRST to review before deleting anything.

WITH headless AS (
  SELECT
    m.id                     AS map_id,
    m.map_name,
    m.master_user_id         AS owner_id,
    m.created_at             AS map_created,
    p.full_name              AS owner_name,
    p.email                  AS owner_email,
    p.last_sign_in           AS owner_last_sign_in,
    p.created_at             AS owner_joined
  FROM public.master_maps m
  JOIN public.profiles p ON p.id = m.master_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vehicle_state vs
    WHERE vs.vehicle_id = m.master_user_id
      AND vs.master_map_id = m.id
  )
)
SELECT
  h.map_id,
  h.map_name,
  h.owner_name,
  h.owner_email,
  h.owner_last_sign_in,
  h.owner_joined,
  h.map_created,
  -- Data inventory
  (SELECT COUNT(*) FROM public.map_markers  WHERE master_map_id = h.map_id) AS markers,
  (SELECT COUNT(*) FROM public.fields        WHERE map_id        = h.map_id) AS fields,
  (SELECT COUNT(*) FROM public.operations    WHERE master_map_id = h.map_id) AS operations,
  (SELECT COUNT(*) FROM public.trails t
     JOIN public.operations o ON o.id = t.operation_id
    WHERE o.master_map_id = h.map_id)                                      AS trails,
  (SELECT COUNT(*) FROM public.profiles      WHERE master_map_id = h.map_id) AS members,
  -- Total data points
  (SELECT COUNT(*) FROM public.map_markers  WHERE master_map_id = h.map_id)
  + (SELECT COUNT(*) FROM public.fields      WHERE map_id        = h.map_id)
  + (SELECT COUNT(*) FROM public.operations  WHERE master_map_id = h.map_id)
  + (SELECT COUNT(*) FROM public.trails t
       JOIN public.operations o ON o.id = t.operation_id
      WHERE o.master_map_id = h.map_id)
  + (SELECT COUNT(*) FROM public.profiles    WHERE master_map_id = h.map_id) AS total_data
FROM headless h
ORDER BY total_data DESC, h.map_created DESC;

-- -------------------------------------------
-- Delete: Remove headless maps with zero data
-- -------------------------------------------
-- WARNING: Only run this AFTER reviewing the preview above.
-- Uncomment the block you want to execute.

-- Option A: Delete ONLY headless maps with ZERO data of any kind.
/*
DELETE FROM public.master_maps
WHERE id IN (
  SELECT m.id
  FROM public.master_maps m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vehicle_state vs
    WHERE vs.vehicle_id = m.master_user_id AND vs.master_map_id = m.id
  )
  AND NOT EXISTS (SELECT 1 FROM public.map_markers WHERE master_map_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM public.fields       WHERE map_id        = m.id)
  AND NOT EXISTS (SELECT 1 FROM public.operations   WHERE master_map_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM public.profiles     WHERE master_map_id = m.id AND id != m.master_user_id)
);
*/

-- Option B: Delete ALL headless maps regardless of data.
-- DESTRUCTIVE -- be very sure before running this.
/*
DELETE FROM public.master_maps
WHERE id IN (
  SELECT m.id
  FROM public.master_maps m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vehicle_state vs
    WHERE vs.vehicle_id = m.master_user_id AND vs.master_map_id = m.id
  )
);
*/

-- Option C: Delete specific maps by ID (paste IDs from preview).
/*
DELETE FROM public.master_maps WHERE id IN (
  'paste-map-id-here',
  'paste-another-id-here'
);
*/

-- ── Preview: Headless maps with total_data <= 2 AND null owner email ─
-- Run this first to see what Option D will delete.
WITH headless AS (
  SELECT
    m.id AS map_id,
    m.map_name,
    m.master_user_id AS owner_id,
    m.created_at AS map_created,
    p.full_name AS owner_name,
    p.email AS owner_email,
    p.last_sign_in AS owner_last_sign_in
  FROM public.master_maps m
  JOIN public.profiles p ON p.id = m.master_user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vehicle_state vs
    WHERE vs.vehicle_id = m.master_user_id AND vs.master_map_id = m.id
  )
)
SELECT
  h.map_id,
  h.map_name,
  h.owner_name,
  h.owner_email,
  h.owner_last_sign_in,
  h.map_created,
  (SELECT COUNT(*) FROM public.map_markers WHERE master_map_id = h.map_id) AS markers,
  (SELECT COUNT(*) FROM public.fields       WHERE map_id        = h.map_id) AS fields,
  (SELECT COUNT(*) FROM public.operations   WHERE master_map_id = h.map_id) AS ops,
  (SELECT COUNT(*) FROM public.trails t JOIN public.operations o ON o.id = t.operation_id
   WHERE o.master_map_id = h.map_id) AS trails,
  (SELECT COUNT(*) FROM public.profiles     WHERE master_map_id = h.map_id) AS members,
  (SELECT COUNT(*) FROM public.map_markers WHERE master_map_id = h.map_id)
  + (SELECT COUNT(*) FROM public.fields     WHERE map_id        = h.map_id)
  + (SELECT COUNT(*) FROM public.operations WHERE master_map_id = h.map_id)
  + (SELECT COUNT(*) FROM public.trails t JOIN public.operations o ON o.id = t.operation_id
     WHERE o.master_map_id = h.map_id)
  + (SELECT COUNT(*) FROM public.profiles   WHERE master_map_id = h.map_id) AS total_data
FROM headless h
WHERE h.owner_email IS NULL
  AND (
    (SELECT COUNT(*) FROM public.map_markers WHERE master_map_id = h.map_id)
    + (SELECT COUNT(*) FROM public.fields     WHERE map_id        = h.map_id)
    + (SELECT COUNT(*) FROM public.operations WHERE master_map_id = h.map_id)
    + (SELECT COUNT(*) FROM public.trails t JOIN public.operations o ON o.id = t.operation_id
       WHERE o.master_map_id = h.map_id)
    + (SELECT COUNT(*) FROM public.profiles   WHERE master_map_id = h.map_id)
  ) <= 2
ORDER BY total_data DESC, h.map_created DESC;

-- Option D: Delete headless maps with <= 2 total data AND null owner email.
-- Run the preview above first, then uncomment this.
/*
DELETE FROM public.master_maps
WHERE id IN (
  SELECT m.id
  FROM public.master_maps m
  JOIN public.profiles p ON p.id = m.master_user_id
  WHERE p.email IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.vehicle_state vs
      WHERE vs.vehicle_id = m.master_user_id AND vs.master_map_id = m.id
    )
    AND (
      (SELECT COUNT(*) FROM public.map_markers WHERE master_map_id = m.id)
      + (SELECT COUNT(*) FROM public.fields     WHERE map_id        = m.id)
      + (SELECT COUNT(*) FROM public.operations WHERE master_map_id = m.id)
      + (SELECT COUNT(*) FROM public.trails t JOIN public.operations o ON o.id = t.operation_id
         WHERE o.master_map_id = m.id)
      + (SELECT COUNT(*) FROM public.profiles   WHERE master_map_id = m.id)
    ) <= 2
);
*/
