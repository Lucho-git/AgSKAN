-- ============================================================================
-- Chaser loads — the tonnage in every chaser bin on the map
-- ============================================================================
-- One row per chaser bin (its operator's profiles.id), shared by the whole
-- map so ANY operator can adjust ANY chaser's load — not just their own.
--
-- Why not keep it on vehicle_state.vehicle_marker (where grainLoad originally
-- lived)? That row belongs to the machine's own client, which re-pushes its
-- vehicle_marker every few seconds — so a teammate's edit was overwritten
-- within one heartbeat. A dedicated row removes the owner-vs-editor race and
-- gives us a realtime feed everyone can watch.
--
-- Visitors (profiles.role = 'viewer') can read but not change loads.
-- ============================================================================

create table if not exists public.chaser_loads (
    master_map_id   uuid not null references public.master_maps(id) on delete cascade,
    vehicle_id      uuid not null,                    -- profiles.id of the chaser's operator
    load_tonnes     numeric(10, 2) not null default 0,
    capacity_tonnes numeric(10, 2) not null default 40,
    updated_at      timestamptz not null default now(),
    updated_by      uuid,
    primary key (master_map_id, vehicle_id),
    constraint chaser_loads_load_check check (load_tonnes >= 0),
    constraint chaser_loads_capacity_check check (capacity_tonnes >= 0)
);

comment on table public.chaser_loads is
    'Per-chaser grain load (tonnes) for a map. Readable by every member; writable by non-visitor members so any operator can adjust any chaser bin.';

alter table public.chaser_loads enable row level security;

-- Read: anyone on the map.
drop policy if exists chaser_loads_select_members on public.chaser_loads;
create policy chaser_loads_select_members on public.chaser_loads
    for select to authenticated
    using (master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid()));

-- Write: operators/managers on the map. Visitors are read-only.
drop policy if exists chaser_loads_insert_members on public.chaser_loads;
create policy chaser_loads_insert_members on public.chaser_loads
    for insert to authenticated
    with check (
        master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
        and coalesce((select p.role from public.profiles p where p.id = auth.uid()), '') <> 'viewer'
    );

drop policy if exists chaser_loads_update_members on public.chaser_loads;
create policy chaser_loads_update_members on public.chaser_loads
    for update to authenticated
    using (
        master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
        and coalesce((select p.role from public.profiles p where p.id = auth.uid()), '') <> 'viewer'
    )
    with check (
        master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
        and coalesce((select p.role from public.profiles p where p.id = auth.uid()), '') <> 'viewer'
    );

revoke all on public.chaser_loads from anon;
grant select, insert, update on public.chaser_loads to authenticated;
grant all on public.chaser_loads to service_role;

-- Live updates: everyone sees everyone's chaser change as it happens.
do $$
begin
    begin
        alter publication supabase_realtime add table public.chaser_loads;
    exception
        when duplicate_object then null;  -- already in the publication
    end;
end
$$;
