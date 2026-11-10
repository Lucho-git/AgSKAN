-- ── Operator system: decouple "who is driving" from the auth account ──
-- An operator is a named person on a map. Multiple accounts (vehicles) can
-- share the same auth session, so we track which operator is currently
-- selected per account per map.

-- Operators belonging to a map
CREATE TABLE IF NOT EXISTS public.map_operators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id      uuid NOT NULL REFERENCES public.master_maps(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text DEFAULT '#60a5fa',
  is_active   boolean DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (map_id, name)
);

CREATE INDEX IF NOT EXISTS idx_map_operators_map
  ON public.map_operators (map_id) WHERE is_active = true;

-- Tracks which account currently has which operator selected.
-- Only one active session per operator (enforced by partial unique index).
-- When a new account selects an operator, the previous session is ended ("kick").
CREATE TABLE IF NOT EXISTS public.operator_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id  uuid NOT NULL REFERENCES public.map_operators(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  map_id       uuid NOT NULL REFERENCES public.master_maps(id) ON DELETE CASCADE,
  started_at   timestamptz DEFAULT now(),
  ended_at     timestamptz
);

-- One active session per operator (the "kick" enforcement)
CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_sessions_one_active
  ON public.operator_sessions (operator_id)
  WHERE ended_at IS NULL;

-- Fast lookup: what's the active session for this account on this map?
CREATE INDEX IF NOT EXISTS idx_operator_sessions_account_map
  ON public.operator_sessions (account_id, map_id, ended_at);

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE public.map_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_sessions ENABLE ROW LEVEL SECURITY;

-- map_operators: visible to anyone on the same map; managed by map members
CREATE POLICY "map_operators_select_same_map" ON public.map_operators
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.master_map_id = map_operators.map_id
    )
  );

CREATE POLICY "map_operators_insert_same_map" ON public.map_operators
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.master_map_id = map_operators.map_id
    )
  );

CREATE POLICY "map_operators_update_same_map" ON public.map_operators
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.master_map_id = map_operators.map_id
    )
  );

-- operator_sessions: users can see/manage their own sessions + see active sessions on their map
CREATE POLICY "operator_sessions_select_own_or_map" ON public.operator_sessions
  FOR SELECT USING (
    account_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.master_map_id = operator_sessions.map_id
    )
  );

CREATE POLICY "operator_sessions_insert_own" ON public.operator_sessions
  FOR INSERT WITH CHECK (account_id = auth.uid());

CREATE POLICY "operator_sessions_update_own" ON public.operator_sessions
  FOR UPDATE USING (account_id = auth.uid());

-- ── Helper: end all active sessions for an operator (the "kick") ──
CREATE OR REPLACE FUNCTION public.end_operator_sessions(p_operator_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.operator_sessions
  SET ended_at = now()
  WHERE operator_id = p_operator_id AND ended_at IS NULL;
END;
$$;

-- ── Helper: select an operator for the current account ──
-- Ends any existing session for that operator (kick), then creates a new one.
-- Returns the operator row.
CREATE OR REPLACE FUNCTION public.select_operator(
  p_operator_id uuid,
  p_map_id uuid
)
RETURNS public.map_operators
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_operator public.map_operators;
BEGIN
  -- End any active session for this operator (kick the other account)
  UPDATE public.operator_sessions
  SET ended_at = now()
  WHERE operator_id = p_operator_id AND ended_at IS NULL;

  -- End this account's previous active session on this map
  UPDATE public.operator_sessions
  SET ended_at = now()
  WHERE account_id = auth.uid() AND map_id = p_map_id AND ended_at IS NULL;

  -- Create new active session
  INSERT INTO public.operator_sessions (operator_id, account_id, map_id)
  VALUES (p_operator_id, auth.uid(), p_map_id);

  -- Return the operator row
  SELECT * INTO v_operator FROM public.map_operators WHERE id = p_operator_id;
  RETURN v_operator;
END;
$$;

-- ── Helper: get the active operator for the current account on a map ──
-- Returns the operator row if the account has an active session, or NULL.
-- Also returns whether the account's last operator was taken by someone else.
CREATE OR REPLACE FUNCTION public.get_active_operator(p_map_id uuid)
RETURNS TABLE (
  operator_id uuid,
  operator_name text,
  operator_color text,
  is_active boolean,
  was_kicked boolean,
  previous_operator_name text
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
  -- Find the account's active session on this map
  SELECT * INTO v_active_session
  FROM public.operator_sessions
  WHERE account_id = auth.uid() AND map_id = p_map_id AND ended_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    -- Still have an active operator
    SELECT * INTO v_operator FROM public.map_operators WHERE id = v_active_session.operator_id;
    RETURN QUERY SELECT v_operator.id, v_operator.name, v_operator.color, v_operator.is_active, false, NULL::text;
    RETURN;
  END IF;

  -- No active session. Find the account's most recent ended session
  SELECT * INTO v_last_session
  FROM public.operator_sessions
  WHERE account_id = auth.uid() AND map_id = p_map_id AND ended_at IS NOT NULL
  ORDER BY ended_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Check if that operator now has a different active session (was kicked)
    SELECT * INTO v_prev_operator FROM public.map_operators WHERE id = v_last_session.operator_id;

    PERFORM 1
    FROM public.operator_sessions
    WHERE operator_id = v_last_session.operator_id
      AND ended_at IS NULL
      AND account_id != auth.uid();

    IF FOUND THEN
      -- Was kicked by another account
      RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false, true, v_prev_operator.name;
      RETURN;
    END IF;

    -- Session ended but operator is free — can re-select
    RETURN QUERY SELECT v_prev_operator.id, v_prev_operator.name, v_prev_operator.color, v_prev_operator.is_active, false, NULL::text;
    RETURN;
  END IF;

  -- No session history at all — brand new
  RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, false, false, NULL::text;
  RETURN;
END;
$$;
