-- ============================================================================
-- background_sync — stop clobbering heading with 0 when there is no bearing
-- ============================================================================
-- The native background tracker always posts a location, but its bearing is
-- only meaningful above a walking pace and is reported as 0 when unavailable.
-- The old expression
--
--     LEAST(GREATEST(COALESCE(p_heading, 0), 0), 360)
--
-- turned "no bearing" into 0° (due north) and clamped instead of wrapping, so
-- any background fix without a bearing snapped a moving vehicle to north.
--
-- Now:
--   * `p_heading` NULL (or NaN) → store NULL on insert, and KEEP the existing
--     heading on conflict, so the vehicle holds its last known direction.
--   * values wrap into [0, 360) so -10° → 350° and 360° → 0°.
-- ============================================================================

create or replace function public.background_sync(
    p_lat double precision,
    p_lng double precision,
    p_heading double precision default 0,
    p_speed double precision default 0,
    p_timestamp text default null,
    p_operation_id text default null,
    p_trail_id text default null,
    p_vehicle_id text default null,
    p_master_map_id text default null,
    p_is_trailing text default 'false',
    mock boolean default null
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_ts timestamptz;
  v_vehicle_id uuid;
  v_is_trailing boolean;
  v_heading double precision;
BEGIN
  -- Security: use the authenticated user's ID from the JWT.
  -- If the JWT is expired and refresh is dead, gracefully exit
  -- instead of throwing. This prevents the native plugin from
  -- retrying forever with a dead session (OS-killed app restart).
  v_vehicle_id := auth.uid();
  IF v_vehicle_id IS NULL THEN
    v_vehicle_id := p_vehicle_id::uuid;
  END IF;
  IF v_vehicle_id IS NULL THEN
    RETURN json_build_object('ok', true, 'warning', 'no_identity');
  END IF;

  -- Parse timestamp
  v_ts := CASE
    WHEN p_timestamp IS NOT NULL AND p_timestamp != ''
    THEN p_timestamp::timestamptz
    ELSE now()
  END;

  -- Parse trailing flag
  v_is_trailing := lower(COALESCE(p_is_trailing, 'false')) = 'true';

  -- Normalise the bearing: NULL / NaN means "unknown", anything else wraps
  -- into [0, 360) instead of being clamped at the edges.
  v_heading := CASE
    WHEN p_heading IS NULL OR p_heading = 'NaN'::double precision THEN NULL
    ELSE mod(mod(p_heading::numeric, 360) + 360, 360)::double precision
  END;

  -- 1. Always update vehicle_state
  INSERT INTO vehicle_state (
    vehicle_id, coordinates, last_update, heading, speed,
    is_trailing, master_map_id
  ) VALUES (
    v_vehicle_id,
    point(p_lng, p_lat),
    v_ts,
    v_heading,
    GREATEST(COALESCE(p_speed, 0) * 3.6, 0),
    v_is_trailing,
    CASE WHEN p_master_map_id IS NOT NULL AND p_master_map_id != ''
         THEN p_master_map_id::uuid ELSE NULL END
  )
  ON CONFLICT (vehicle_id) DO UPDATE SET
    coordinates = EXCLUDED.coordinates,
    last_update = EXCLUDED.last_update,
    -- Hold the last known direction when this fix carries no bearing.
    heading = COALESCE(EXCLUDED.heading, vehicle_state.heading),
    speed = EXCLUDED.speed,
    is_trailing = EXCLUDED.is_trailing,
    master_map_id = COALESCE(EXCLUDED.master_map_id, vehicle_state.master_map_id);

  -- 2. If trailing, record the trail coordinate
  IF v_is_trailing AND p_trail_id IS NOT NULL AND p_trail_id != '' THEN
    IF EXISTS (
      SELECT 1 FROM trails
      WHERE id = p_trail_id::uuid AND end_time IS NULL
    ) THEN
      INSERT INTO trail_stream (
        trail_id, coordinate, timestamp, operation_id
      ) VALUES (
        p_trail_id::uuid,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
        v_ts,
        CASE WHEN p_operation_id IS NOT NULL AND p_operation_id != ''
             THEN p_operation_id::uuid ELSE NULL END
      )
      ON CONFLICT (trail_id, timestamp) DO NOTHING;
    END IF;
  END IF;

  RETURN json_build_object('ok', true);
END;
$function$;
