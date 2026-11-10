-- add_manager_subscription_trigger
-- Applied through the Supabase MCP; text copied from the recorded migration.

create trigger on_profile_became_manager
    after update of role on public.profiles
    for each row
    when (new.role = 'manager' and old.role is distinct from 'manager')
    execute function public.ensure_manager_subscription();
