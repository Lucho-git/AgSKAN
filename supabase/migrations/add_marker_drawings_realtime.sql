-- Enable realtime for marker_drawings so drawing creates/updates/deletes
-- propagate instantly to other users (mirroring map_markers, which is already
-- in the publication). Drawings are soft-deleted via UPDATE, so the default
-- replica identity is sufficient for the master_map_id filter.
ALTER PUBLICATION supabase_realtime ADD TABLE public.marker_drawings;
