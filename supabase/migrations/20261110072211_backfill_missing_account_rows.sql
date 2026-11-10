-- backfill_missing_account_rows
-- Applied through the Supabase MCP; text copied from the recorded migration.

insert into public.profiles
    (id, email, full_name, avatar_url, onboarded, created_at, updated_at, last_sign_in)
select
    u.id,
    u.email,
    coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
        case when u.is_anonymous then 'Visitor' end
    ),
    coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'picture'), '')
    ),
    false,
    coalesce(u.created_at, now()),
    coalesce(u.updated_at, now()),
    coalesce(u.last_sign_in_at, u.created_at, now())
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
