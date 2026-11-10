-- add_kmz_overlays
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Per-map KMZ/KML overlay layers (e.g. user-drawn roads exported from Google Earth).
-- Option 1: store the full GeoJSON FeatureCollection as jsonb (matches em_overlays pattern).
create table public.kmz_overlays (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.master_maps(id) on delete cascade,
  name text not null,
  source_file text,
  geojson jsonb not null,
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kmz_overlays_map_id_idx on public.kmz_overlays (map_id);

comment on table public.kmz_overlays is 'Per-map KMZ/KML overlay layers (e.g. user-drawn roads exported from Google Earth).';
comment on column public.kmz_overlays.geojson is 'Full GeoJSON FeatureCollection (LineString/MultiLineString/Point/Polygon) for the overlay.';

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kmz_overlays_set_updated_at on public.kmz_overlays;
create trigger kmz_overlays_set_updated_at
  before update on public.kmz_overlays
  for each row execute function public.set_updated_at();

-- Enable RLS and allow users to manage overlays for maps they own (via profiles.master_map_id).
alter table public.kmz_overlays enable row level security;

create policy "Users can select their own map overlays"
  on public.kmz_overlays for select
  using (
    map_id in (
      select master_map_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can insert overlays on their own maps"
  on public.kmz_overlays for insert
  with check (
    map_id in (
      select master_map_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can update their own map overlays"
  on public.kmz_overlays for update
  using (
    map_id in (
      select master_map_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can delete their own map overlays"
  on public.kmz_overlays for delete
  using (
    map_id in (
      select master_map_id from public.profiles where id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
