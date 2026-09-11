-- ============================================================================
-- Map log: paging index
-- ============================================================================
-- The feed is cursor-paged newest-first ("before id"), always scoped to one
-- master map. A (master_map_id, id desc) index makes that an index-only walk:
--   where master_map_id = $1 and id < $2 order by id desc limit 50
-- ============================================================================

create index if not exists map_log_map_id_idx
    on public.map_log (master_map_id, id desc);
