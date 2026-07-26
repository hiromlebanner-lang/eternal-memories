begin;

-- Table privileges are required before PostgreSQL evaluates the RLS policies.
grant select, insert, update, delete on table public.photos to authenticated;
revoke insert, update, delete on table public.photos from anon;

drop policy if exists "contributors upload photos" on public.photos;
create policy "contributors upload photos"
on public.photos
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.current_album_role(album_id)::text
    in ('owner', 'admin', 'member')
);

drop policy if exists "authors or managers update photos" on public.photos;
drop policy if exists "authors update own photos" on public.photos;
create policy "authors update own photos"
on public.photos
for update
to authenticated
using (author_id = auth.uid())
with check (
  author_id = auth.uid()
  and public.current_album_role(album_id)::text
    in ('owner', 'admin', 'member')
);

drop policy if exists "authors or managers delete photos" on public.photos;
drop policy if exists "authors delete own photos" on public.photos;
create policy "authors delete own photos"
on public.photos
for delete
to authenticated
using (author_id = auth.uid());

drop policy if exists "authors or managers delete stored photos" on storage.objects;
drop policy if exists "authors delete own stored photos" on storage.objects;
create policy "authors delete own stored photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'album-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
);

commit;
