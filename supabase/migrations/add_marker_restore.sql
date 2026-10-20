-- ============================================================================
-- Marker restore (undo delete)
-- ============================================================================
-- Markers are soft-deleted by the client: `map_markers.deleted = true` plus
-- `deleted_at`. The row — and its full `marker_data` — is never dropped, so
-- undo is just flipping the flag back.
--
-- Everything downstream already reacts to that flip:
--   * trg_map_log_marker        → writes `marker.restored` to map_log
--   * trg_marker_archive        → clears marker_archive.deleted_at/deleted_by
--   * clients' realtime handlers → re-add the marker to the map
--   * loadMarkersFromServer     → `.or('deleted.is.null,deleted.eq.false')`
--
-- Why an RPC instead of a direct table UPDATE:
--   * map_markers has RLS disabled (see get_advisors), so the client can reach
--     every row. This function re-checks that the caller belongs to the
--     marker's map and is not a read-only guest before un-deleting anything.
--   * It also returns the restored row so the caller can rehydrate its store
--     without a follow-up round trip (own realtime echoes are filtered out by
--     update_user_id, so the caller must apply the change locally).
-- ============================================================================

create or replace function public.restore_marker(p_marker_id uuid)
returns public.map_markers
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_row public.map_markers%rowtype;
    v_map uuid;
    v_role text;
begin
    select m.master_map_id into v_map
      from public.map_markers m
     where m.id = p_marker_id;

    if v_map is null then
        raise exception 'Marker not found';
    end if;

    select p.map_role into v_role
      from public.profiles p
     where p.id = auth.uid()
       and p.master_map_id = v_map;

    if v_role is null then
        raise exception 'Not a member of this map';
    end if;

    if v_role = 'viewer' then
        raise exception 'View-only access: this action is not available on a guest invite.';
    end if;

    update public.map_markers
       set deleted        = false,
           deleted_at     = null,
           update_user_id = auth.uid(),
           updated_at     = now()
     where id = p_marker_id
       and deleted is true
    returning * into v_row;

    if v_row.id is null then
        raise exception 'Marker is not deleted';
    end if;

    return v_row;
end;
$function$;

comment on function public.restore_marker(uuid) is
    'Undo a marker soft delete. Verifies map membership + non-viewer role, then flips deleted back to false. The map_log and marker_archive triggers record the restore.';

revoke all on function public.restore_marker(uuid) from public;
revoke all on function public.restore_marker(uuid) from anon;
grant execute on function public.restore_marker(uuid) to authenticated;

-- Supports the "Deleted" list / trash panel: newest deletions first per map.
create index if not exists marker_archive_map_deleted_idx
    on public.marker_archive (master_map_id, deleted_at desc)
    where deleted_at is not null;
