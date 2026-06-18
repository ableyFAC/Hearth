-- =============================================================================
-- Hearth — storage for issue/improvement/system photos and the docs vault.
-- Files are namespaced by property id as the first path segment:
--   home-photos/<property_id>/<uuid>.jpg
-- so RLS can check ownership from the object path.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('home-photos', 'home-photos', true)
on conflict (id) do nothing;

-- Owners can read/write only objects under a property they own. The first
-- folder segment of the object name is the property id.
create policy "home-photos owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'home-photos'
    and public.owns_property( (storage.foldername(name))[1]::uuid )
  );

create policy "home-photos owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'home-photos'
    and public.owns_property( (storage.foldername(name))[1]::uuid )
  );

create policy "home-photos owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'home-photos'
    and public.owns_property( (storage.foldername(name))[1]::uuid )
  );
