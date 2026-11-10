-- ============================================================================
-- Admin map notes: one free-text note per map (farm), written and edited from
-- the admin dashboard. Only callers with user_settings.dev_tools_enabled get
-- through — the same gate admin_dashboard_query() uses. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_map_notes (
    master_map_id uuid PRIMARY KEY REFERENCES public.master_maps(id) ON DELETE CASCADE,
    note          text NOT NULL DEFAULT '',
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    uuid
);

ALTER TABLE public.admin_map_notes ENABLE ROW LEVEL SECURITY;

-- No RLS policies on purpose: anon/authenticated get no direct access. Reads
-- and writes go through the SECURITY DEFINER functions below (which run as the
-- table owner and therefore bypass RLS).

-- ── Read: every non-empty note, keyed by map id ─────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_map_notes_query()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    caller_id uuid;
    is_dev boolean;
    result jsonb;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT dev_tools_enabled INTO is_dev
    FROM user_settings
    WHERE user_id = caller_id;

    IF is_dev IS NOT TRUE THEN
        RAISE EXCEPTION 'Forbidden - developer mode not enabled';
    END IF;

    SELECT COALESCE(
        jsonb_object_agg(
            n.master_map_id::text,
            jsonb_build_object('note', n.note, 'updated_at', n.updated_at)
        ),
        '{}'::jsonb
    )
    INTO result
    FROM admin_map_notes n
    WHERE btrim(n.note) <> '';

    RETURN result;
END;
$function$;

-- ── Write: upsert the note for one map ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_map_note(p_master_map_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    caller_id uuid;
    is_dev boolean;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT dev_tools_enabled INTO is_dev
    FROM user_settings
    WHERE user_id = caller_id;

    IF is_dev IS NOT TRUE THEN
        RAISE EXCEPTION 'Forbidden - developer mode not enabled';
    END IF;

    IF p_master_map_id IS NULL THEN
        RAISE EXCEPTION 'Missing map id';
    END IF;

    INSERT INTO admin_map_notes (master_map_id, note, updated_at, updated_by)
    VALUES (p_master_map_id, COALESCE(p_note, ''), now(), caller_id)
    ON CONFLICT (master_map_id)
    DO UPDATE SET
        note = EXCLUDED.note,
        updated_at = now(),
        updated_by = caller_id;

    RETURN jsonb_build_object(
        'note', COALESCE(p_note, ''),
        'updated_at', now()
    );
END;
$function$;

-- New functions default to EXECUTE for PUBLIC — lock that down.
REVOKE ALL ON FUNCTION public.admin_map_notes_query() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_map_note(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_map_notes_query() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_map_note(uuid, text) TO authenticated;
