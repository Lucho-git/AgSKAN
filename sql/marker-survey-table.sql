-- Marker Survey responses
-- Public survey at /markersurvey: users rank their top 3 icon styles,
-- suggest new icons, and leave harvest comments. Anyone (anon) can INSERT;
-- rows are only readable by the project owner (dashboard), no anon/authenticated SELECT.
create table if not exists public.marker_survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  top1_style text,
  top2_style text,
  top3_style text,
  active_style text,
  icon_suggestions text,
  comments text
);

comment on table public.marker_survey_responses is
  'Responses from the public marker survey page (/markersurvey).';

-- RLS: public form - anyone may insert, nobody (anon/authenticated) may read.
alter table public.marker_survey_responses enable row level security;

drop policy if exists "marker_survey_public_insert" on public.marker_survey_responses;
create policy "marker_survey_public_insert"
  on public.marker_survey_responses
  for insert
  to anon, authenticated
  with check (true);

-- Expose to the Data API for the anon role (insert only).
grant insert on table public.marker_survey_responses to anon, authenticated;
