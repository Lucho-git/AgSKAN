-- update_get_trail_path_as_geojson.sql
-- get_trail_path_as_geojson now returns BOTH geometries so the map can draw
-- the solid work path and the dotted pause connector from one fetch:
--   { "path": <geojson|null>, "pause_path": <geojson|null> }
-- Callers fall back to treating the result as a raw geometry when talking to
-- an older deploy of this function (staged rollout safety).

CREATE OR REPLACE FUNCTION public.get_trail_path_as_geojson(trail_id_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'path', ST_AsGeoJSON(path)::JSONB,
        'pause_path',
        CASE
            WHEN pause_path IS NOT NULL THEN ST_AsGeoJSON(pause_path)::JSONB
            ELSE NULL
        END
    ) INTO result
    FROM trails
    WHERE id = trail_id_param;

    RETURN result;
END;
$function$;
