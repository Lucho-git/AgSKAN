-- ============================================================================
-- Map log: marker edit capture + richer trail details
-- ============================================================================
-- * marker.edited events: icon / marker colour / tint style changes on a
--   marker, with from/to values so the feed can show a before → after visual
--   (e.g. rock → tree). Silo fill, photos, notes etc. stay unlogged.
-- * trail.started / trail.closed now carry vehicle_body_color, vehicle_swath
--   and operator_id so the expanded log row can show full vehicle stats and
--   the selected operator profile.
-- ============================================================================

create or replace function public.trg_map_log_marker()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_row        public.map_markers%rowtype;
    v_actor_id   uuid;
    v_actor_name text;
    v_action     text;
    v_summary    text;
    v_props      jsonb;
    v_from_props jsonb;
    v_coords     jsonb;
begin
    if tg_op = 'DELETE' then
        if old.deleted is true then
            return null;
        end if;
        v_row := old;
        v_props := coalesce(old.marker_data -> 'properties', '{}'::jsonb);
        v_action := 'marker.deleted';
        v_summary := 'Deleted a marker';
    elsif tg_op = 'INSERT' then
        v_row := new;
        v_props := coalesce(new.marker_data -> 'properties', '{}'::jsonb);
        v_action := 'marker.placed';
        v_summary := 'Placed a marker';
    elsif new.deleted is true and coalesce(old.deleted, false) is false then
        v_row := new;
        v_props := coalesce(new.marker_data -> 'properties', '{}'::jsonb);
        v_action := 'marker.deleted';
        v_summary := 'Deleted a marker';
    elsif coalesce(new.deleted, false) is false and old.deleted is true then
        v_row := new;
        v_props := coalesce(new.marker_data -> 'properties', '{}'::jsonb);
        v_action := 'marker.restored';
        v_summary := 'Restored a marker';
    else
        -- edit — the trigger WHEN guarantees icon / colour / tint changed
        v_row := new;
        v_props := coalesce(new.marker_data -> 'properties', '{}'::jsonb);
        v_from_props := coalesce(old.marker_data -> 'properties', '{}'::jsonb);
        v_action := 'marker.edited';
        if (v_from_props ->> 'icon') is distinct from (v_props ->> 'icon') then
            v_summary := 'Changed the marker icon';
        else
            v_summary := 'Changed the marker colour';
        end if;
    end if;

    if v_row.master_map_id is null then
        return null;
    end if;

    select a.actor_id, a.actor_name into v_actor_id, v_actor_name
      from public.map_log_actor(v_row.update_user_id) a;

    v_coords := v_row.marker_data -> 'geometry' -> 'coordinates';

    insert into public.map_log
        (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
    values (
        v_row.master_map_id,
        case when v_actor_id is null then 'system' else 'app' end,
        v_actor_id,
        coalesce(v_actor_name, 'System'),
        v_action,
        'marker',
        v_row.id,
        v_summary,
        jsonb_strip_nulls(
            jsonb_build_object(
                'icon',         v_props -> 'icon',
                'marker_color', v_props -> 'marker_color',
                'tint_mode',    v_props -> 'tint_mode',
                'lng',          v_coords -> 0,
                'lat',          v_coords -> 1
            )
            || case when v_action = 'marker.edited' then jsonb_build_object(
                   'from_icon',         v_from_props -> 'icon',
                   'from_marker_color', v_from_props -> 'marker_color',
                   'from_tint_mode',    v_from_props -> 'tint_mode'
               ) else '{}'::jsonb end
        )
    );
    return null;
end
$$;

drop trigger if exists map_log_marker_deleted on public.map_markers;
create trigger map_log_marker_updated
    after update on public.map_markers
    for each row
    when (new.deleted is distinct from old.deleted
          or (new.marker_data -> 'properties' -> 'icon') is distinct from (old.marker_data -> 'properties' -> 'icon')
          or (new.marker_data -> 'properties' -> 'marker_color') is distinct from (old.marker_data -> 'properties' -> 'marker_color')
          or (new.marker_data -> 'properties' -> 'tint_mode') is distinct from (old.marker_data -> 'properties' -> 'tint_mode'))
    execute function public.trg_map_log_marker();

create or replace function public.trg_map_log_trail()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_actor_id   uuid;
    v_actor_name text;
    v_map        uuid;
    v_op_name    text;
    v_vtype      text;
    v_summary    text;
    v_duration_s bigint;
    v_auto       boolean;
begin
    if tg_op = 'DELETE' then
        if old.end_time is not null then
            return null;
        end if;
        v_map := public.map_log_map_for_trail(old.operation_id, old.vehicle_id);
        if v_map is null then
            return null;
        end if;

        select a.actor_id, a.actor_name into v_actor_id, v_actor_name
          from public.map_log_actor(null) a;

        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
        values (
            v_map,
            case when v_actor_id is null then 'system' else 'app' end,
            v_actor_id,
            coalesce(v_actor_name, 'System'),
            'trail.deleted', 'trail', old.id,
            'Deleted an unfinished trail',
            jsonb_strip_nulls(jsonb_build_object(
                'operation_id', old.operation_id
            ))
        );
        return null;
    end if;

    if tg_op = 'INSERT' then
        if new.end_time is not null then
            return null;
        end if;
        v_map := public.map_log_map_for_trail(new.operation_id, new.vehicle_id);
        if v_map is null then
            return null;
        end if;

        v_op_name := (select o.name from public.operations o where o.id = new.operation_id);
        v_vtype   := new.vehicle_marker ->> 'type';

        select a.actor_id, a.actor_name into v_actor_id, v_actor_name
          from public.map_log_actor(null) a;

        v_summary := 'Started trailing'
            || case when v_vtype is not null then ' with ' || v_vtype else '' end
            || case when v_op_name is not null then ' — ' || v_op_name else '' end;

        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
        values (
            v_map,
            case when v_actor_id is null then 'system' else 'app' end,
            v_actor_id,
            coalesce(v_actor_name, 'System'),
            'trail.started', 'trail', new.id, v_summary,
            jsonb_strip_nulls(jsonb_build_object(
                'operation_id',       new.operation_id,
                'operation_name',     v_op_name,
                'vehicle_id',         new.vehicle_id,
                'vehicle_type',       new.vehicle_marker -> 'type',
                'vehicle_body_color', new.vehicle_marker -> 'bodyColor',
                'vehicle_swath',      new.vehicle_marker -> 'swath',
                'operator_id',        new.operator_id,
                'operator_name',      new.operator_name,
                'trail_color',        new.trail_color,
                'trail_width',        new.trail_width
            ))
        );
        return null;
    end if;

    if new.end_time is not null and old.end_time is null then
        v_map := public.map_log_map_for_trail(new.operation_id, new.vehicle_id);
        if v_map is null then
            return null;
        end if;

        v_op_name := (select o.name from public.operations o where o.id = new.operation_id);

        select a.actor_id, a.actor_name into v_actor_id, v_actor_name
          from public.map_log_actor(null) a;

        v_auto := v_actor_id is null;
        v_duration_s := greatest(0, extract(epoch from (new.end_time - new.start_time))::bigint);

        insert into public.map_log
            (master_map_id, source, actor_id, actor_name, action, entity_type, entity_id, summary, details)
        values (
            v_map,
            case when v_auto then 'system' else 'app' end,
            v_actor_id,
            coalesce(v_actor_name, 'System'),
            'trail.closed', 'trail', new.id,
            public.map_log_trail_close_summary(v_auto, v_duration_s, new.trail_hectares),
            jsonb_strip_nulls(jsonb_build_object(
                'operation_id',       new.operation_id,
                'operation_name',     v_op_name,
                'vehicle_id',         new.vehicle_id,
                'vehicle_type',       new.vehicle_marker -> 'type',
                'vehicle_body_color', new.vehicle_marker -> 'bodyColor',
                'vehicle_swath',      new.vehicle_marker -> 'swath',
                'operator_id',        new.operator_id,
                'operator_name',      new.operator_name,
                'duration_s',         v_duration_s,
                'trail_distance',     new.trail_distance,
                'trail_hectares',     new.trail_hectares
            ))
        );
        return null;
    end if;

    if new.metrics_calculated is true
       and coalesce(old.metrics_calculated, false) is false
       and new.end_time is not null then
        v_duration_s := greatest(0, extract(epoch from (new.end_time - new.start_time))::bigint);

        update public.map_log ml
           set summary = public.map_log_trail_close_summary(ml.source = 'system', v_duration_s, new.trail_hectares),
               details = ml.details || jsonb_strip_nulls(jsonb_build_object(
                   'trail_distance', new.trail_distance,
                   'trail_hectares', new.trail_hectares,
                   'trail_percentage_overlap', new.trail_percentage_overlap,
                   'metrics_calculated', true
               ))
         where ml.id = (
             select ml2.id
               from public.map_log ml2
              where ml2.entity_type = 'trail'
                and ml2.entity_id = new.id
                and ml2.action = 'trail.closed'
              order by ml2.id desc
              limit 1
         );
        return null;
    end if;

    return null;
end
$$;
