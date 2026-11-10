-- fix_get_active_operator_ambiguity
-- Applied through the Supabase MCP; text copied from the recorded migration.

CREATE OR REPLACE FUNCTION public.get_active_operator(p_map_id uuid)
RETURNS TABLE (
  out_operator_id uuid,
  out_operator_name text,
  out_operator_color text,
  out_is_active boolean,
  out_was_kicked boolean,
  out_previous_operator_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_session operator_sessions%ROWTYPE;
  v_last_session operator_sessions%ROWTYPE;
  v_operator map_operators%ROWTYPE;
  v_prev_operator map_operators%ROWTYPE;
BEGIN
  SELECT * INTO v_active_session
  FROM public.operator_sessions
  WHERE account_id = auth.uid() AND map_id = p_map_id AND ended_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_operator FROM public.map_operators WHERE id = v_active_session.operator_id;
    RETURN QUERY SELECT v_operator.id, v_operator.name, v_operator.color, v_operator.is_active, false, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_last_session
  FROM public.operator_sessions
  WHERE account_id = auth.uid() AND map_id = p_map_id AND ended_at IS NOT NULL
  ORDER BY ended_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_prev_operator FROM public.map_operators WHERE id = v_last_session.operator_id;

    PERFORM 1
    FROM public.operator_sessions os2
    WHERE os2.operator_id = v_last_session.operator_id
      AND os2.ended_at IS NULL
      AND os2.account_id != auth.uid();

    IF FOUND THEN
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false, true, v_prev_operator.name;
      RETURN;
    END IF;

    RETURN QUERY SELECT v_prev_operator.id, v_prev_operator.name, v_prev_operator.color, v_prev_operator.is_active, false, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false, false, NULL::text;
  RETURN;
END;
$$;
