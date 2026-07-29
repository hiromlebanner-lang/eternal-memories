begin;

alter table public.photos
  alter column album_id drop not null,
  alter column latitude drop not null,
  alter column longitude drop not null;

alter table public.photos
  drop constraint if exists photos_destination_check;

alter table public.photos
  add constraint photos_destination_check
  check (
    (
      visibility = 'album_only'
      and album_id is not null
      and latitude is not null
      and longitude is not null
    )
    or
    (
      visibility = 'global'
      and (
        (latitude is null and longitude is null)
        or (latitude is not null and longitude is not null)
      )
    )
  );

drop policy if exists "contributors upload photos" on public.photos;
create policy "contributors upload photos"
on public.photos
for insert
to authenticated
with check (
  author_id = auth.uid()
  and (
    (
      visibility = 'album_only'
      and album_id is not null
      and public.current_album_role(album_id)::text
        in ('owner', 'admin', 'member')
    )
    or
    (
      visibility = 'global'
      and (
        album_id is null
        or public.current_album_role(album_id)::text
          in ('owner', 'admin', 'member')
      )
    )
  )
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
  and (
    (
      visibility = 'album_only'
      and album_id is not null
      and public.current_album_role(album_id)::text
        in ('owner', 'admin', 'member')
    )
    or
    (
      visibility = 'global'
      and (
        album_id is null
        or public.current_album_role(album_id)::text
          in ('owner', 'admin', 'member')
      )
    )
  )
);

drop policy if exists "contributors upload album photos" on storage.objects;
create policy "contributors upload album photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'album-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (
    (storage.foldername(name))[1] = 'global'
    or public.current_album_role(
      public.safe_uuid((storage.foldername(name))[1])
    )::text in ('owner', 'admin', 'member')
  )
);

commit;
