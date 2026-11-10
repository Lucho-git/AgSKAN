-- backfill_missing_account_rows
-- Applied through the Supabase MCP; text copied from the recorded migration.

insert into public.user_subscriptions
    (user_id, subscription, marker_limit, trail_limit, current_seats,
     created_at, updated_at)
select p.id, 'FREE', 100, 100000, 1, now(), now()
from public.profiles p
where p.role = 'manager'
  and not exists (
      select 1 from public.user_subscriptions s where s.user_id = p.id
  )
on conflict (user_id) do nothing;
