-- safety_soft_delete_fields_part1
-- Applied through the Supabase MCP; text copied from the recorded migration.

ALTER TABLE public.fields ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.delete_duplicate_field(
  p_delete_field_id uuid,
  p_keep_field_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_reassigned int := 0;
  v_name text;
BEGIN
  SELECT name INTO v_name FROM fields WHERE field_id = p_delete_field_id;
  IF p_keep_field_id IS NOT NULL THEN
    UPDATE spray_records SET field_id = p_keep_field_id WHERE field_id = p_delete_field_id;
    GET DIAGNOSTICS v_reassigned = ROW_COUNT;
  END IF;
  UPDATE fields SET deleted_at = NOW() WHERE field_id = p_delete_field_id;
  RETURN jsonb_build_object('success', true, 'deleted_field', p_delete_field_id, 'deleted_name', v_name, 'reassigned_records', v_reassigned);
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_soft_deleted_field(p_field_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE fields SET deleted_at = NULL WHERE field_id = p_field_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field not found or not deleted');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$function$;
