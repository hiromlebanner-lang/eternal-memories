begin;

-- Keep the existing bucket configuration unchanged. Create it only when absent.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg']
)
on conflict (id) do nothing;

-- Replace only MapAlbum's avatar policies.
drop policy if exists "users upload own avatar" on storage.objects;
drop policy if exists "users update own avatar" on storage.objects;
drop policy if exists "users delete own avatar" on storage.objects;
drop policy if exists "authenticated users view avatars" on storage.objects;

create policy "users upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and name = auth.uid()::text || '.jpg'
);

create policy "users update own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and name = auth.uid()::text || '.jpg'
)
with check (
  bucket_id = 'avatars'
  and name = auth.uid()::text || '.jpg'
);

create policy "users delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and name = auth.uid()::text || '.jpg'
);

create policy "authenticated users view avatars"
on storage.objects for select
to authenticated
using (bucket_id = 'avatars');

commit;
