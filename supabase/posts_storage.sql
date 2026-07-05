-- =============================================================================
-- XLeats — storage policies for the 'posts' bucket
--
-- The bucket was created back in schema.sql but never got RLS policies, so
-- uploads have been silently denied since day one. Path convention matches
-- menu-photos: {truck_id}/filename.
-- =============================================================================

create policy posts_bucket_read on storage.objects for select
  using (bucket_id = 'posts');
create policy posts_bucket_write on storage.objects for all
  using (bucket_id = 'posts' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'posts' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid));

notify pgrst, 'reload schema';
