-- add_trail_stream_guard_trigger_and_rpc
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- =============================================================================
-- GUARD: trail_stream inserts must reference an OPEN trail
-- =============================================================================
-- Problem: trail_stream INSERTs arrive via multiple paths (background_sync RPC,
-- direct PostgREST from JS, native HTTP plugin from old app versions). Only
-- background_sync had a guard. Direct PostgREST inserts bypassed it, causing
-- FK violations when a trail was deleted/closed while the native plugin still
-- had a stale trail_id baked into its HTTP template.
--
-- Solution: Two layers of protection:
--   1. BEFORE INSERT trigger — catches ALL paths (old apps, new apps, RPC, direct)
--   2. insert_trail_stream RPC — clean interface for new apps, returns explicit status
-- =============================================================================

-- ── 1. BEFORE INSERT trigger (safety net for ALL insert paths) ──

CREATE OR REPLACE FUNCTION guard_trail_stream_insert()
RETURNS trigger AS $$
BEGIN
    -- Only allow insert if the trail exists AND is still open.
    -- This silently drops points for deleted/closed trails, preventing
    -- FK violations and log flooding from stale native plugin POSTs.
    IF NOT EXISTS (
        SELECT 1 FROM trails
        WHERE id = NEW.trail_id AND end_time IS NULL
    ) THEN
        RETURN NULL;  -- silently drop the insert
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trail_stream_guard_insert ON trail_stream;
CREATE TRIGGER trail_stream_guard_insert
    BEFORE INSERT ON trail_stream
    FOR EACH ROW EXECUTE FUNCTION guard_trail_stream_insert();

-- ── 2. insert_trail_stream RPC (for new app versions) ──
-- Accepts a batch of coordinates and inserts them with the guard.
-- Returns explicit status so the app knows if the trail was closed/deleted.

CREATE OR REPLACE FUNCTION insert_trail_stream(
    p_trail_id uuid,
    p_points jsonb,
    p_operation_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_point jsonb;
    v_inserted integer := 0;
    v_skipped integer := 0;
BEGIN
    -- Guard: trail must exist and be open
    IF NOT EXISTS (
        SELECT 1 FROM trails
        WHERE id = p_trail_id AND end_time IS NULL
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'trail_not_open',
            'inserted', 0,
            'skipped', jsonb_array_length(p_points)
        );
    END IF;

    -- Insert each point (trigger will also guard, but we check first for efficiency)
    FOR v_point IN SELECT * FROM jsonb_array_elements(p_points) LOOP
        BEGIN
            INSERT INTO trail_stream (trail_id, coordinate, timestamp, operation_id)
            VALUES (
                p_trail_id,
                ST_SetSRID(ST_MakePoint(
                    (v_point->>'lng')::float8,
                    (v_point->>'lat')::float8
                ), 4326),
                (v_point->>'timestamp')::timestamptz,
                COALESCE(p_operation_id, NULLIF(v_point->>'operation_id', '')::uuid)
            )
            ON CONFLICT (trail_id, timestamp) DO NOTHING;

            v_inserted := v_inserted + 1;
        EXCEPTION WHEN OTHERS THEN
            v_skipped := v_skipped + 1;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'inserted', v_inserted,
        'skipped', v_skipped
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated and anon (the native plugin uses anon key)
GRANT EXECUTE ON FUNCTION insert_trail_stream(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_trail_stream(uuid, jsonb, uuid) TO anon;
