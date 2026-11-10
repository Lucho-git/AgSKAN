-- map_messages_attachments
-- Applied through the Supabase MCP; text copied from the recorded migration.

-- Location attachments on messages (shared pins/markers/fields)
alter table public.map_messages add column if not exists attachment jsonb;

-- Messages may now omit text when a location attachment is present.
alter table public.map_messages drop constraint if exists map_messages_body_check;
alter table public.map_messages add constraint map_messages_body_check
  check (char_length(body) between 0 and 500 and (char_length(body) > 0 or attachment is not null));
