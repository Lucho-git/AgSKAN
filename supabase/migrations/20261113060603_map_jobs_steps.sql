-- map_jobs_steps
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Jobs with more than one step ("get the harvester from the shed", "spray
-- Home", "spray Dam"). Each step has its own words and its own places, and
-- is ticked off by whoever has the job:
--   [{ title, done_at, items: [{ type, id, label, lng, lat, points? }] }]
-- `items` stays as the flat list of every place the job points at.
-- Safe to re-run.
alter table public.map_jobs
    add column if not exists steps jsonb not null default '[]'::jsonb;
