# Verifies trail data integrity via the Supabase Management API.
# The access token is read from Windows Credential Manager by supa-sql.ps1 and
# is never printed.
#
# All three counts should be 0:
#   closed_null_path - a closed trail with no geometry shows as 0 km in Trail
#                      History and cannot be rendered or replayed
#   leftover_stream  - trail_stream rows left on an already-closed trail
#   leftover_pauses  - same, for pause windows
#
# Usage:  .\scripts\verify-trail-integrity.ps1

$sql = @"
select
  (select count(*) from public.trails
     where end_time is not null and path is null)                        as closed_null_path,
  (select count(*) from public.trail_stream ts
     where not exists (select 1 from public.trails t
                        where t.id = ts.trail_id and t.end_time is null)) as leftover_stream,
  (select count(*) from public.trail_pauses tp
     where not exists (select 1 from public.trails t
                        where t.id = tp.trail_id and t.end_time is null)) as leftover_pauses,
  (select count(*) from public.trails where end_time is null)             as open_trails,
  (select count(*) from public.trails)                                    as total_trails;
"@

& (Join-Path $PSScriptRoot "supa-sql.ps1") -Sql $sql
