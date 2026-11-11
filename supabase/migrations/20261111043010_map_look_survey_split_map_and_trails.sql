-- The /mapsurvey page now asks two separate questions: which map style
-- (imagery + paddocks) and which trail colours. Store each answer on its own.
-- The original top1/top2/top3/least_liked columns are left in place, unused.
alter table public.map_look_survey_responses
  add column if not exists map_style text check (char_length(map_style) <= 40),
  add column if not exists trail_style text check (char_length(trail_style) <= 40),
  add column if not exists viewed_trail_styles text[] not null default '{}';

comment on column public.map_look_survey_responses.map_style is 'Preferred map style key (classic, muted, mono, spotlight).';
comment on column public.map_look_survey_responses.trail_style is 'Preferred trail palette key (classic, soft, earth).';
