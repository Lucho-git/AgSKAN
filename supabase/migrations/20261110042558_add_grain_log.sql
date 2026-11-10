-- ============================================================================
-- Grain log — append-only record of bin/chaser tonnage activity
-- ============================================================================
-- One row per grain action an operator performs on the map:
--
--   'bin.level'     a field/mother bin's fill was set (slider drag, Add/Take)
--   'chaser.level'  the user's own chaser bin load was set (slider, Add/Take)
--   'chaser.empty'  a one-tap empty: chaser → bin (tonnes moved, who, where)
--
-- Why an app-written log instead of triggers on map_markers/vehicle_state:
-- a single operator action ("emptied the chaser into Bin 3") touches two
-- tables, and the two fire blindly — the trigger route would record a bin
-- gain and a chaser loss with no way to tie them together as one transfer.
-- Writing the record with the action keeps the intent (and the tonnes moved)
-- intact, which is the whole point of the record system.
--
-- Writes go through public.log_grain_event() (security definer) so the
-- table itself stays read-only for clients — same model as public.map_log.
-- ============================================================================

create table if not exists public.grain_log (
    id              bigint generated always as identity primary key,
    master_map_id   uuid not null references public.master_maps(id) on delete cascade,
    occurred_at     timestamptz not null default now(),
    actor_id        uuid,                             -- profiles.id; null = system
    actor_name      text not null default 'Unknown user',
    action          text not null,                    -- 'bin.level' | 'chaser.level' | 'chaser.empty'
    bin_id          uuid,                             -- map_markers.id (no FK: logs outlive bin deletes)
    bin_name        text,
    vehicle_id      uuid,                             -- profiles.id of the chaser's operator
    vehicle_name    text,                             -- machine name snapshot (e.g. "FWD Chaser")
    tonnes_before   numeric(10, 2),                   -- tonnes in the thing being changed
    tonnes_after    numeric(10, 2),
    bin_fill_before numeric(6, 2),                    -- bin fill % (bin.level / chaser.empty)
    bin_fill_after  numeric(6, 2),
    note            text,
    details         jsonb not null default '{}'::jsonb,
    constraint grain_log_action_check
        check (action in ('bin.level', 'chaser.level', 'chaser.empty'))
);

comment on table public.grain_log is
    'Append-only grain activity record (bin levels, chaser levels, chaser→bin empties). Clients read their own map; writes only via log_grain_event().';

create index if not exists grain_log_map_time_idx on public.grain_log (master_map_id, occurred_at desc);
create index if not exists grain_log_bin_idx      on public.grain_log (bin_id, occurred_at desc);
create index if not exists grain_log_vehicle_idx  on public.grain_log (vehicle_id, occurred_at desc);

alter table public.grain_log enable row level security;

drop policy if exists grain_log_select_members on public.grain_log;
create policy grain_log_select_members on public.grain_log
    for select to authenticated
    using (master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid()));

-- Nothing but reads for clients — inserts happen through the RPC below.
revoke all on public.grain_log from anon, authenticated;
grant select on public.grain_log to authenticated;
grant all on public.grain_log to service_role;

-- ---------------------------------------------------------------------------
-- log_grain_event() — the single write path
-- ---------------------------------------------------------------------------
-- Actor + map come from the caller's profile (never from the client), so a
-- user can only record activity on their own map. Returns the new row id.
create or replace function public.log_grain_event(
    p_action          text,
    p_bin_id          uuid default null,
    p_bin_name        text default null,
    p_vehicle_id      uuid default null,
    p_vehicle_name    text default null,
    p_tonnes_before   numeric default null,
    p_tonnes_after    numeric default null,
    p_bin_fill_before numeric default null,
    p_bin_fill_after  numeric default null,
    p_note            text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_profile  public.profiles%rowtype;
    v_id       bigint;
begin
    if p_action not in ('bin.level', 'chaser.level', 'chaser.empty') then
        raise exception 'log_grain_event: unknown action %', p_action
            using errcode = '22023';
    end if;

    select * into v_profile from public.profiles where id = auth.uid();
    if not found or v_profile.master_map_id is null then
        raise exception 'log_grain_event: no profile for caller'
            using errcode = '28000';
    end if;

    insert into public.grain_log (
        master_map_id, actor_id, actor_name, action,
        bin_id, bin_name, vehicle_id, vehicle_name,
        tonnes_before, tonnes_after, bin_fill_before, bin_fill_after, note
    ) values (
        v_profile.master_map_id,
        v_profile.id,
        coalesce(nullif(v_profile.full_name, ''), nullif(v_profile.email, ''), 'Unknown user'),
        p_action,
        p_bin_id, p_bin_name, p_vehicle_id, p_vehicle_name,
        p_tonnes_before, p_tonnes_after, p_bin_fill_before, p_bin_fill_after, p_note
    )
    returning id into v_id;

    return v_id;
end
$$;

comment on function public.log_grain_event(
    text, uuid, text, uuid, text, numeric, numeric, numeric, numeric, text
) is
    'Grain log: records one bin/chaser/transfer action for the caller''s map.';

revoke all on function public.log_grain_event(
    text, uuid, text, uuid, text, numeric, numeric, numeric, numeric, text
) from public, anon;
grant execute on function public.log_grain_event(
    text, uuid, text, uuid, text, numeric, numeric, numeric, numeric, text
) to authenticated;
