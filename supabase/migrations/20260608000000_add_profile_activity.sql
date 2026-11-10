-- Add profile_activity table to track daily user engagement per map.
-- Uses a composite PK to deduplicate: one row per user per map per activity type per day.
-- The ON CONFLICT DO NOTHING pattern means only the first event each day incurs a write;
-- subsequent events that day hit the PK index and are silently ignored.

CREATE TABLE IF NOT EXISTS public.profile_activity (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL,
  master_map_id  uuid NOT NULL,
  activity_type  text NOT NULL DEFAULT 'location_update',
  activity_date  date NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  metadata       jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT profile_activity_pkey
    PRIMARY KEY (profile_id, master_map_id, activity_type, activity_date)
);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profile_activity_map_date
  ON public.profile_activity (master_map_id, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_profile_activity_profile_date
  ON public.profile_activity (profile_id, activity_date DESC);

-- Trigger function: log a daily activity row when a vehicle_state last_update changes.
-- Only inserts if this is the FIRST location update for that user/map/type today.
CREATE OR REPLACE FUNCTION public.log_daily_profile_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only fire when last_update actually changed (not on other column updates)
  -- and only when there's a valid master_map_id.
  IF (TG_OP = 'INSERT' OR NEW.last_update IS DISTINCT FROM OLD.last_update)
     AND NEW.master_map_id IS NOT NULL THEN
    INSERT INTO public.profile_activity (profile_id, master_map_id, activity_type, activity_date)
    VALUES (NEW.vehicle_id, NEW.master_map_id, 'location_update', CURRENT_DATE)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to vehicle_state
DROP TRIGGER IF EXISTS trg_log_daily_activity ON public.vehicle_state;
CREATE TRIGGER trg_log_daily_activity
  AFTER INSERT OR UPDATE ON public.vehicle_state
  FOR EACH ROW
  EXECUTE FUNCTION public.log_daily_profile_activity();

-- ── Helpers for dashboards ──────────────────────────────────────────

-- Convenience function: active days for a map within a date range.
CREATE OR REPLACE FUNCTION public.map_active_profiles(
  _map_id      uuid,
  _since       date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  _until       date DEFAULT CURRENT_DATE
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT profile_id)
  FROM public.profile_activity
  WHERE master_map_id = _map_id
    AND activity_date >= _since
    AND activity_date <= _until;
$$;

-- Convenience function: total distinct active days for a map.
CREATE OR REPLACE FUNCTION public.map_active_days(
  _map_id      uuid,
  _since       date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  _until       date DEFAULT CURRENT_DATE
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT activity_date)
  FROM public.profile_activity
  WHERE master_map_id = _map_id
    AND activity_date >= _since
    AND activity_date <= _until;
$$;

-- Bulk query: activity stats for ALL maps in one call (for admin dashboards).
CREATE OR REPLACE FUNCTION public.admin_activity_stats(
  _since date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  _until date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  master_map_id    uuid,
  active_profiles  bigint,
  active_days      bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    pa.master_map_id,
    COUNT(DISTINCT pa.profile_id) AS active_profiles,
    COUNT(DISTINCT pa.activity_date) AS active_days
  FROM public.profile_activity pa
  WHERE pa.activity_date >= _since
    AND pa.activity_date <= _until
  GROUP BY pa.master_map_id;
$$;

-- Daily activity breakdown for a single map (heatmap data).
-- Returns one row per (date, profile) so the frontend can build a
-- per-profile or aggregate heatmap calendar.
CREATE OR REPLACE FUNCTION public.map_daily_activity(
  _map_id uuid,
  _since  date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  _until  date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  activity_date  date,
  profile_id     uuid,
  profile_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    pa.activity_date,
    pa.profile_id,
    COUNT(*)::bigint AS profile_count
  FROM public.profile_activity pa
  WHERE pa.master_map_id = _map_id
    AND pa.activity_date >= _since
    AND pa.activity_date <= _until
  GROUP BY pa.activity_date, pa.profile_id
  ORDER BY pa.activity_date DESC;
$$;

-- -- Backfill from historical vehicle_state data ---------------------
-- Run this once to seed profile_activity with existing location history.
-- Safe to re-run: ON CONFLICT DO NOTHING skips duplicates.

INSERT INTO public.profile_activity (profile_id, master_map_id, activity_type, activity_date)
SELECT DISTINCT
  vehicle_id,
  master_map_id,
  'location_update',
  last_update::date
FROM public.vehicle_state
WHERE master_map_id IS NOT NULL
  AND last_update IS NOT NULL
ON CONFLICT DO NOTHING;

-- Optional: also backfill from trail activity (operators recording paths)
INSERT INTO public.profile_activity (profile_id, master_map_id, activity_type, activity_date)
SELECT DISTINCT
  t.vehicle_id,
  o.master_map_id,
  'trail_recorded',
  t.start_time::date
FROM public.trails t
JOIN public.operations o ON o.id = t.operation_id
WHERE t.vehicle_id IS NOT NULL
  AND o.master_map_id IS NOT NULL
  AND t.start_time IS NOT NULL
ON CONFLICT DO NOTHING;
