-- delete_spray_record_rpc
-- Applied through the Supabase MCP; text copied from the recorded migration.

CREATE OR REPLACE FUNCTION public.delete_spray_record(p_record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM spray_records WHERE id = p_record_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Record not found');
  END IF;
  
  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$function$;
