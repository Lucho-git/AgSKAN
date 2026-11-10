-- Marker photos are stored in user_files_bucket under:
--   maps/{master_map_id}/marker-photos/{marker_id}/{file}
-- Any authenticated user whose profile belongs to that master map may
-- upload, read, update and delete these files (so everyone on the map can
-- view and manage the photos).

DROP POLICY IF EXISTS "marker_photos_map_insert" ON storage.objects;
CREATE POLICY "marker_photos_map_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user_files_bucket'
    AND (storage.foldername(name))[1] = 'maps'
    AND (storage.foldername(name))[2] =
        (SELECT master_map_id::text FROM profiles WHERE id = auth.uid())
    AND (storage.foldername(name))[3] = 'marker-photos'
  );

DROP POLICY IF EXISTS "marker_photos_map_select" ON storage.objects;
CREATE POLICY "marker_photos_map_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'user_files_bucket'
    AND (storage.foldername(name))[1] = 'maps'
    AND (storage.foldername(name))[2] =
        (SELECT master_map_id::text FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "marker_photos_map_update" ON storage.objects;
CREATE POLICY "marker_photos_map_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'user_files_bucket'
    AND (storage.foldername(name))[1] = 'maps'
    AND (storage.foldername(name))[2] =
        (SELECT master_map_id::text FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "marker_photos_map_delete" ON storage.objects;
CREATE POLICY "marker_photos_map_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'user_files_bucket'
    AND (storage.foldername(name))[1] = 'maps'
    AND (storage.foldername(name))[2] =
        (SELECT master_map_id::text FROM profiles WHERE id = auth.uid())
  );
