-- ============================================================================
-- Direct messages between people on a map (map_messages)
-- ============================================================================
-- Written when someone sends a message from the people/vehicles menu:
--   * recipient's app open  → realtime INSERT → in-app popup + conversation
--   * recipient offline     → sender also calls send-message-push (web push)
--
-- Safe to re-run.
-- ============================================================================

create table if not exists public.map_messages (
    id            bigint generated always as identity primary key,
    master_map_id uuid not null references public.master_maps(id) on delete cascade,
    sender_id     uuid not null,
    sender_name   text,
    recipient_id  uuid not null,
    body          text not null check (char_length(body) between 1 and 500),
    created_at    timestamptz not null default now(),
    read_at       timestamptz
);

-- Conversation lookup (both directions) + unread badge counts.
create index if not exists map_messages_convo_idx
    on public.map_messages (master_map_id, sender_id, recipient_id, id desc);
create index if not exists map_messages_unread_idx
    on public.map_messages (master_map_id, recipient_id)
    where read_at is null;

alter table public.map_messages enable row level security;

drop policy if exists map_messages_select on public.map_messages;
create policy map_messages_select on public.map_messages
    for select
    using (
        master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
        and (sender_id = auth.uid() or recipient_id = auth.uid())
    );

drop policy if exists map_messages_insert on public.map_messages;
create policy map_messages_insert on public.map_messages
    for insert
    with check (
        sender_id = auth.uid()
        and recipient_id <> auth.uid()
        and master_map_id = (select p.master_map_id from public.profiles p where p.id = auth.uid())
    );

-- Recipients (only) can mark messages as read.
drop policy if exists map_messages_update on public.map_messages;
create policy map_messages_update on public.map_messages
    for update
    using (recipient_id = auth.uid())
    with check (recipient_id = auth.uid());

grant all on public.map_messages to service_role;
grant select, insert, update on public.map_messages to anon, authenticated;

-- Realtime: stream new messages to open clients (INSERT events).
do $$
begin
    alter publication supabase_realtime add table public.map_messages;
exception
    when duplicate_object then null;
end
$$;
