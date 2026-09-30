-- update_close_trail_fast_pause_geometry.sql
-- close_trail_fast: accept + store the paused transfer geometry, and keep
-- paused points out of spray-record generation.
--
--  * New optional params pause_path_param / pause_detailed_path_param (EWKT;
--    NULL = leave existing values, same CASE pattern as path/detailed_path).
--  * Before generate_spray_records runs, trail_stream points INSIDE pause
--    windows are deleted so a drive-through while paused can't create
--    phantom spray records (the whole stream is deleted right after anyway).
--
-- Signature change: a CREATE OR REPLACE cannot change the parameter list, so
-- the old 4-arg function is dropped first, then recreated with 2 more
-- defaulted params. Old-style 4-arg callers (older app builds) keep working.
--
-- Apply together with add_trail_pause_paths.sql (pause columns).

DROP FUNCTION IF EXISTS public.close_trail_fast(uuid, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.close_trail_fast(
    trail_id_param uuid,
    end_time_param timestamptz DEFAULT now(),
    path_param text DEFAULT NULL,
    detailed_path_param text DEFAULT NULL,
    pause_path_param text DEFAULT NULL,
    pause_detailed_path_param text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_spray_result jsonb;
    v_start timestamptz;
BEGIN
    v_start := clock_timestamp();
    RAISE WARNING '[close_trail_fast] START trail=%', trail_id_param;

    IF NOT EXISTS (SELECT 1 FROM trails WHERE id = trail_id_param) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trail does not exist');
    END IF;

    IF path_param IS NOT NULL THEN
        BEGIN
            PERFORM path_param::geometry;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid path geometry: ' || SQLERRM);
        END;
    END IF;

    IF detailed_path_param IS NOT NULL THEN
        BEGIN
            PERFORM detailed_path_param::geometry;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid detailed path geometry: ' || SQLERRM);
        END;
    END IF;

    IF pause_path_param IS NOT NULL THEN
        BEGIN
            PERFORM pause_path_param::geometry;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid pause path geometry: ' || SQLERRM);
        END;
    END IF;

    IF pause_detailed_path_param IS NOT NULL THEN
        BEGIN
            PERFORM pause_detailed_path_param::geometry;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid pause detailed path geometry: ' || SQLERRM);
        END;
    END IF;

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
        pause_path = CASE 
            WHEN pause_path_param IS NOT NULL THEN pause_path_param::geometry
            ELSE pause_path 
        END,
        pause_detailed_path = CASE 
            WHEN pause_detailed_path_param IS NOT NULL THEN pause_detailed_path_param::geometry
            ELSE pause_detailed_path 
        END,
        metrics_calculated = false
    WHERE id = trail_id_param;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Failed to update trail');
    END IF;

    RAISE WARNING '[close_trail_fast] updated trail=% at % ms', trail_id_param, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start);

    -- Paused stretches are transfer, not work: drop those stream points BEFORE
    -- spray record generation so a drive-through can't create phantom spray.
    DELETE FROM public.trail_stream ts
    USING public.trail_pauses tp
    WHERE ts.trail_id = trail_id_param
      AND tp.trail_id = trail_id_param
      AND ts.timestamp > tp.paused_at
      AND ts.timestamp < COALESCE(tp.resumed_at, 'infinity'::timestamptz);

    v_spray_result := generate_spray_records(trail_id_param);
    RAISE WARNING '[close_trail_fast] spray_records done trail=% at % ms, generated=%', trail_id_param, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start), v_spray_result->>'records_generated';

    DELETE FROM trail_stream WHERE trail_id = trail_id_param;
    RAISE WARNING '[close_trail_fast] DONE trail=% total=% ms', trail_id_param, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start);

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Trail %s closed successfully', trail_id_param),
        'trail_id', trail_id_param,
        'spray_records', v_spray_result
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[close_trail_fast] ERROR trail=%: %', trail_id_param, SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
