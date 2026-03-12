-- ============================================================
-- background_sync: Native background location sync function
-- ============================================================
-- Called by transistorsoft's native HTTP engine (OkHttp on Android)
-- when the WebView JavaScript is frozen by the OS.
--
-- This function handles BOTH tables in a single POST:
--   1. vehicle_state  — UPSERT (always, so other users see this vehicle)
--   2. trail_stream   — INSERT (only when trailing)
--
-- HOW TO INSTALL:
--   1. Go to your Supabase Dashboard → SQL Editor
--   2. Paste this entire file
--   3. Click "Run"
-- ============================================================

CREATE OR REPLACE FUNCTION public.background_sync(
  p_lat double precision,
  p_lng double precision,
  p_heading double precision DEFAULT 0,
  p_speed double precision DEFAULT 0,
  p_timestamp text DEFAULT NULL,
  p_operation_id text DEFAULT NULL,
  p_trail_id text DEFAULT NULL,
  p_vehicle_id text DEFAULT NULL,
  p_master_map_id text DEFAULT NULL,
  p_is_trailing text DEFAULT 'false'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts timestamptz;
  v_vehicle_id uuid;
  v_is_trailing boolean;
BEGIN
  -- Security: always use the authenticated user's ID from the JWT
  v_vehicle_id := auth.uid();
  IF v_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Parse timestamp (ISO 8601 from transistorsoft, e.g. "2026-03-10T15:55:35.262Z")
  v_ts := CASE 
    WHEN p_timestamp IS NOT NULL AND p_timestamp != '' 
    THEN p_timestamp::timestamptz 
    ELSE now() 
  END;

  -- Parse trailing flag (passed as text for template safety)
  v_is_trailing := lower(COALESCE(p_is_trailing, 'false')) = 'true';

  -- ════════════════════════════════════════════════════════════
  -- 1. Always update vehicle_state (so other users see this vehicle)
  -- ════════════════════════════════════════════════════════════
  INSERT INTO vehicle_state (
    vehicle_id, coordinates, last_update, heading, speed,
    is_trailing, master_map_id
  ) VALUES (
    v_vehicle_id,
    point(p_lng, p_lat),
    v_ts,
    LEAST(GREATEST(COALESCE(p_heading, 0), 0), 360),  -- Clamp 0-360
    GREATEST(COALESCE(p_speed, 0) * 3.6, 0),          -- m/s → km/h, min 0
    v_is_trailing,
    CASE WHEN p_master_map_id IS NOT NULL AND p_master_map_id != '' 
         THEN p_master_map_id::uuid ELSE NULL END
  )
  ON CONFLICT (vehicle_id) DO UPDATE SET
    coordinates = EXCLUDED.coordinates,
    last_update = EXCLUDED.last_update,
    heading = EXCLUDED.heading,
    speed = EXCLUDED.speed,
    is_trailing = EXCLUDED.is_trailing,
    master_map_id = COALESCE(EXCLUDED.master_map_id, vehicle_state.master_map_id);
    -- NOTE: vehicle_marker is NOT touched — it's set in the foreground UI

  -- ════════════════════════════════════════════════════════════
  -- 2. If trailing, also record the trail coordinate
  -- ════════════════════════════════════════════════════════════
  IF v_is_trailing AND p_trail_id IS NOT NULL AND p_trail_id != '' THEN
    INSERT INTO trail_stream (
      trail_id, coordinate, timestamp, operation_id
    ) VALUES (
      p_trail_id::uuid,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
      v_ts,
      CASE WHEN p_operation_id IS NOT NULL AND p_operation_id != '' 
           THEN p_operation_id::uuid ELSE NULL END
    );
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.background_sync(
  double precision, double precision, double precision, double precision,
  text, text, text, text, text, text
) TO authenticated;

-- ============================================================
-- Enable Supabase Realtime on vehicle_state
-- ============================================================
-- Without this, postgres_changes subscriptions on vehicle_state
-- will NOT fire — meaning observers never see background-synced
-- position updates (broadcast channel.send() is JS-only and
-- cannot fire from the native HTTP engine).
--
-- trail_stream already works because it was added to the publication
-- earlier. This ensures vehicle_state gets the same treatment.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vehicle_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_state;
    RAISE NOTICE 'Added vehicle_state to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'vehicle_state already in supabase_realtime publication';
  END IF;
END $$;
