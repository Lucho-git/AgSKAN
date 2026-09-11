-- ============================================================================
-- Map log: vehicle changes + operator changes
-- ============================================================================
-- * vehicle.changed: a user switched their machine (type / colour / swath).
--   Captured on vehicle_state.vehicle_marker — the row every map client
--   keeps current. Location-only updates (coordinates / heading / speed /
--   flash) never fire it: the trigger WHEN compares vehicle_marker alone.
--   details carry from_vehicle_* → vehicle_* for a before → after visual.
-- * operator.changed: an account selected (or switched) the operator it is
--   acting as on the map. Logged from inside select_operator() — the single
--   choke point every operator selection goes through (picker, create+select,
--   spray confirm re-select).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Vehicle changes (vehicle_state.vehicle_marker)
-- ---------------------------------------------------------------------------
create or replace function public.trg_map_log_vehicle_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_actor_id   uuid;
    v_actor_name text;
    v_from       jsonb := coalesce(old.vehicle_marker, '{}'::jsonb);
    v_to         jsonb := coalesce(new.vehicle_marker, '{}'::jsonb);
    v_summary    text;
begin
    if new.master_map_id is null then
        return null;
    end if;

    select a.actor_id, a.actor_name into v_actor_id, v_actor_name
      from public.map_log_actor(new.vehicle_id) a;

    v_summary := 'Changed vehicle — ' || coalesce(v_to ->> 'type', 'vehicle')
        || case when coalesce(v_to ->> 'bodyColor', '') <> ''
                then ' • ' || (v_to ->> 'bodyColor') else '' end
        || case when (v_to ->> 'swath') is not null
                then ' • ' || (v_to ->> 'swath') || 'm' else '' end;

    insert into public.map_log
        (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
    values (
        new.master_map_id,
        case when v_actor_id is null then 'system' else 'app' end,
        v_actor_id,
        coalesce(v_actor_name, 'System'),
        'vehicle.changed',
        'vehicle',
        new.vehicle_id,
        v_summary,
        jsonb_strip_nulls(jsonb_build_object(
            'vehicle_type',            v_to -> 'type',
            'vehicle_body_color',      v_to -> 'bodyColor',
            'vehicle_swath',           v_to -> 'swath',
            'from_vehicle_type',       v_from -> 'type',
            'from_vehicle_body_color', v_from -> 'bodyColor',
            'from_vehicle_swath',      v_from -> 'swath'
        ))
    );
    return null;
end
$$;

drop trigger if exists map_log_vehicle_changed on public.vehicle_state;
create trigger map_log_vehicle_changed
    after update on public.vehicle_state
    for each row
    when (new.vehicle_marker is not null
          and new.vehicle_marker is distinct from old.vehicle_marker)
    execute function public.trg_map_log_vehicle_change();

-- ---------------------------------------------------------------------------
-- Operator changes (select_operator RPC)
-- ---------------------------------------------------------------------------
-- Same signature/behaviour as before, plus a map_log entry when the account
-- actually switches to a different operator. Re-selecting the same operator
-- is a no-op and is not logged.
create or replace function public.select_operator(p_operator_id uuid, p_map_id uuid)
returns map_operators
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_operator           public.map_operators;
  v_prev_operator_id   uuid;
  v_prev_operator_name text;
  v_actor_id           uuid;
  v_actor_name         text;
begin
  -- Who the account was acting as before this switch (for the log).
  select os.operator_id, mo.name
    into v_prev_operator_id, v_prev_operator_name
    from public.operator_sessions os
    left join public.map_operators mo on mo.id = os.operator_id
   where os.account_id = auth.uid()
     and os.map_id = p_map_id
     and os.ended_at is null
   limit 1;

  UPDATE public.operator_sessions
  SET ended_at = now()
  WHERE operator_id = p_operator_id AND ended_at IS NULL;

  UPDATE public.operator_sessions
  SET ended_at = now()
  WHERE account_id = auth.uid() AND map_id = p_map_id AND ended_at IS NULL;

  INSERT INTO public.operator_sessions (operator_id, account_id, map_id)
  VALUES (p_operator_id, auth.uid(), p_map_id);

  SELECT * INTO v_operator FROM public.map_operators WHERE id = p_operator_id;

  -- Map log: the account changed operator on this map.
  if v_operator.id is not null
     and v_operator.id is distinct from v_prev_operator_id then
    select a.actor_id, a.actor_name into v_actor_id, v_actor_name
      from public.map_log_actor(null) a;

    insert into public.map_log
        (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
    values (
        p_map_id,
        case when v_actor_id is null then 'system' else 'app' end,
        v_actor_id,
        coalesce(v_actor_name, 'System'),
        'operator.changed',
        'operator',
        v_operator.id,
        case when v_prev_operator_name is null
             then 'Selected operator ' || v_operator.name
             else 'Changed operator — ' || v_prev_operator_name || ' → ' || v_operator.name end,
        jsonb_strip_nulls(jsonb_build_object(
            'operator_id',        v_operator.id,
            'operator_name',      v_operator.name,
            'operator_color',     v_operator.color,
            'from_operator_id',   v_prev_operator_id,
            'from_operator_name', v_prev_operator_name
        ))
    );
  end if;

  RETURN v_operator;
end;
$$;
