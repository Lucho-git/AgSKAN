-- backfill_missing_account_rows
-- Applied through the Supabase MCP; text copied from the recorded migration.

insert into public.user_settings (user_id)
select p.id
from public.profiles p
where not exists (select 1 from public.user_settings s where s.user_id = p.id)
on conflict (user_id) do nothing;
