-- add_map_jobs
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- ============================================================================
-- Jobs on a map (map_jobs)
-- ============================================================================
-- Something to do at a place on the farm: a title, an optional note, and the
-- paddocks, pins or spots it points at. A job is either given to one person
-- (assigned_to) or left open (assigned_to is null) for anyone on the crew to
-- take. Whoever takes it moves it from open to accepted to done.
--
-- Written by the new map viewer (/account/map-preview). Safe to re-run.
-- ============================================================================

create table if not exists public.map_jobs (
    id              uuid primary key default gen_random_uuid(),
    master_map_id   uuid not null references public.master_maps(id) on delete cascade,
    created_by      uuid not null,
    created_by_name text,
    -- null = open to anyone on the map
    assigned_to     uuid,
    title           text not null check (char_length(title) between 1 and 80),
    note            text not null default '' check (char_length(note) <= 500),
    -- [{ type: 'field' | 'marker' | 'spot', id, label, lng, lat }]
    items           jsonb not null default '[]'::jsonb,
    status          text not null default 'open'
                    check (status in ('open', 'accepted', 'done', 'cancelled')),
    taken_by        uuid,
    taken_by_name   text,
    taken_at        timestamptz,
    done_at         timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists map_jobs_map_idx
    on public.map_jobs (master_map_id, created_at desc);

drop trigger if exists map_jobs_modtime on public.map_jobs;
create trigger map_jobs_modtime
    before update on public.map_jobs
    for each row execute function public.update_modified_column();

alter table public.map_jobs enable row level security;

-- Everyone on the map can see its jobs (guests included, read-only).
drop policy if exists map_jobs_select on public.map_jobs;
create policy map_jobs_select on public.map_jobs
    for select to authenticated
    using (
        master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
    );

-- The crew (not guests) can post jobs on their own map, as themselves.
drop policy if exists map_jobs_insert on public.map_jobs;
create policy map_jobs_insert on public.map_jobs
    for insert to authenticated
    with check (
        created_by = auth.uid()
        and master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
        and coalesce((select p.map_role from public.profiles p where p.id = auth.uid()), 'member') <> 'viewer'
    );

-- A job can be changed by whoever posted it, whoever it was given to,
-- whoever took it, or (while nobody in particular has it) any of the crew.
drop policy if exists map_jobs_update on public.map_jobs;
create policy map_jobs_update on public.map_jobs
    for update to authenticated
    using (
        master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
        and coalesce((select p.map_role from public.profiles p where p.id = auth.uid()), 'member') <> 'viewer'
        and (
            created_by = auth.uid()
            or assigned_to = auth.uid()
            or taken_by = auth.uid()
            or assigned_to is null
        )
    )
    with check (
        master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
    );

grant all on public.map_jobs to service_role;
grant select, insert, update on public.map_jobs to authenticated;

-- Realtime: stream jobs to open maps as they are posted, taken and finished.
do $$
begin
    alter publication supabase_realtime add table public.map_jobs;
exception
    when duplicate_object then null;
end
$$;
