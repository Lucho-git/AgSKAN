-- Map look survey responses
-- Public survey at /mapsurvey: farmers click through map colour styles on a
-- demo farm, pick their top 3 and the one they like least, and leave comments.
-- Same access model as marker_survey_responses: anyone may INSERT, nobody
-- (anon/authenticated) may read; results are read from the dashboard.
create table if not exists public.map_look_survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 100),
  top1_look text check (char_length(top1_look) <= 40),
  top2_look text check (char_length(top2_look) <= 40),
  top3_look text check (char_length(top3_look) <= 40),
  least_liked_look text check (char_length(least_liked_look) <= 40),
  -- Which looks they actually opened, and which demo farm they were on.
  viewed_looks text[] not null default '{}',
  demo_farm text check (char_length(demo_farm) <= 40),
  comments text check (char_length(comments) <= 4000)
);

comment on table public.map_look_survey_responses is
  'Responses from the public map look survey page (/mapsurvey).';

alter table public.map_look_survey_responses enable row level security;

drop policy if exists "map_look_survey_public_insert" on public.map_look_survey_responses;
create policy "map_look_survey_public_insert"
  on public.map_look_survey_responses
  for insert
  to anon, authenticated
  with check (true);

revoke all on table public.map_look_survey_responses from anon, authenticated;
grant insert on table public.map_look_survey_responses to anon, authenticated;
