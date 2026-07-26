begin;

alter table public.photos
  add column if not exists title text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.photos'::regclass
      and conname = 'photos_title_length_check'
  ) then
    alter table public.photos
      add constraint photos_title_length_check
      check (char_length(title) <= 120);
  end if;
end
$$;

drop policy if exists "authors or managers update photos" on public.photos;
create policy "authors or managers update photos"
on public.photos
for update
to authenticated
using (
  author_id = auth.uid()
  or (
    visibility = 'album_only'
    and public.is_album_manager(album_id)
  )
)
with check (
  author_id = auth.uid()
  or (
    visibility = 'album_only'
    and public.is_album_manager(album_id)
  )
);

drop policy if exists "authors or managers delete photos" on public.photos;
create policy "authors or managers delete photos"
on public.photos
for delete
to authenticated
using (
  author_id = auth.uid()
  or (
    visibility = 'album_only'
    and public.is_album_manager(album_id)
  )
);

drop policy if exists "authors or managers delete stored photos" on storage.objects;
create policy "authors or managers delete stored photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'album-photos'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or exists (
      select 1
      from public.photos
      where photos.storage_path = storage.objects.name
        and photos.visibility = 'album_only'
        and public.is_album_manager(photos.album_id)
    )
  )
);

commit;
