-- add_manager_subscription_trigger
-- Applied through the Supabase MCP; text copied from the recorded migration.

create or replace function public.ensure_manager_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
    insert into public.user_subscriptions
        (user_id, subscription, marker_limit, trail_limit, current_seats,
         created_at, updated_at)
    values (new.id, 'FREE', 100, 100000, 1, now(), now())
    on conflict (user_id) do nothing;

    return new;
end
$fn$;
