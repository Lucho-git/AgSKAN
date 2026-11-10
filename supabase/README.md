# Supabase

| Path | What it is |
| --- | --- |
| `migrations/` | Every schema change, named `<UTC timestamp>_<name>.sql`, in the order it was applied. |
| `functions/` | Edge Functions (billing, notifications, invites, contact). |
| `adhoc/` | One-off diagnostics and data-repair scripts. They are not migrations; don't put schema changes here. |
| `config.toml`, `seed.sql` | Local stack config. |

## Adding a schema change

```sh
supabase migration new <short_name>   # creates migrations/<timestamp>_<short_name>.sql
```

Write the SQL, then apply it with `supabase db push` or the MCP `apply_migration` tool. **Don't paste SQL straight into the SQL editor.** It won't be recorded, and the history will drift again.

## How the history was reconciled (November 2026)

Before this, migrations lived in two folders (`supabase/migrations/add_*.sql` with no timestamps, and `sql/migrations/YYYY-MM-DD_*.sql`). Some had been applied through the MCP, which records them in `supabase_migrations.schema_migrations`, and the rest by hand in the SQL editor. They are now one ordered folder:

- **117 recorded migrations** keep the exact version recorded on the project. If the repo already had a matching file, that file was renamed, keeping its comments. Otherwise the recorded SQL was written out. Ad-hoc diagnostic queries and one-off customer data fixes were recorded as migrations too. Their files are `select 1;` placeholders, because the originals contain customer data or a secret.
- **68 hand-applied migrations** are versioned by the time they were first committed, nudged so files from the same commit run in dependency order. The project has no history row for them yet. Run [`adhoc/mark-hand-applied-migrations.sql`](adhoc/mark-hand-applied-migrations.sql) once against prod (same as `supabase migration repair --status applied …`) so `supabase db push` doesn't try to re-apply them. A spot-check of their tables, columns and functions found all of them present in prod.

### Still missing: a baseline

The recorded history starts on 2026-06-30, and the original schema (profiles, master_maps, trails, markers, …) was never captured as a migration. So you **cannot rebuild a database from this folder yet**. To add a baseline, from a machine whose IP is on the database allow-list:

```sh
supabase db dump --linked -f supabase/migrations/20260101000000_baseline.sql
```

Then reset a local stack (`supabase db reset`) to check the full chain replays. Expect a few early hand-applied files to need `if not exists` guards, because the dump already contains their changes.
