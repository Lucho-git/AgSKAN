-- add_manager_subscription_trigger
-- Applied through the Supabase MCP; text copied from the recorded migration.

create trigger on_profile_inserted_manager
    after insert on public.profiles
    for each row
    when (new.role = 'manager')
    execute function public.ensure_manager_subscription();
