-- hook_generate_spray_records_into_close_trail_fast
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Modify close_trail_fast to call generate_spray_records BEFORE deleting trail_stream.
-- This ensures per-field timing data is available when creating spray records.
-- The spray records are returned alongside the close result so the client
-- can show the confirmation popup.

CREATE OR REPLACE FUNCTION close_trail_fast(
    trail_id_param uuid,
    end_time_param timestamptz DEFAULT now(),
    path_param text DEFAULT NULL,
    detailed_path_param text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_spray_result jsonb;
BEGIN
    -- Validate trail exists
    IF NOT EXISTS (SELECT 1 FROM trails WHERE id = trail_id_param) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Trail does not exist'
        );
    END IF;

    -- Validate geometry strings if provided
    IF path_param IS NOT NULL THEN
        BEGIN
            PERFORM path_param::geometry;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid path geometry: ' || SQLERRM
            );
        END;
    END IF;

    IF detailed_path_param IS NOT NULL THEN
        BEGIN
            PERFORM detailed_path_param::geometry;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid detailed path geometry: ' || SQLERRM
            );
        END;
    END IF;

    -- Perform the main update (store paths but don't calculate metrics)
    UPDATE trails
    SET 
        end_time = end_time_param,
        path = CASE 
            WHEN path_param IS NOT NULL THEN path_param::geometry
            ELSE path 
        END,
        detailed_path = CASE 
            WHEN detailed_path_param IS NOT NULL THEN detailed_path_param::geometry
            ELSE detailed_path 
        END,
        metrics_calculated = false
    WHERE id = trail_id_param;

    -- Verify the update was successful
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Failed to update trail'
        );
    END IF;

    -- Generate spray records BEFORE deleting trail_stream
    -- (needs trail_stream points for per-field timing)
    v_spray_result := generate_spray_records(trail_id_param);

    -- Delete the trail_stream points immediately
    DELETE FROM trail_stream
    WHERE trail_id = trail_id_param;

    -- Return success with spray records for the confirmation popup
    RETURN jsonb_build_object(
        'success', true,
        'message', format('Trail %s closed successfully', trail_id_param),
        'trail_id', trail_id_param,
        'spray_records', v_spray_result
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
