begin;

alter table public.photos
  add column if not exists visibility text not null default 'album_only';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.photos'::regclass
      and conname = 'photos_visibility_check'
  ) then
    alter table public.photos
      add constraint photos_visibility_check
      check (visibility in ('album_only', 'global'));
  end if;
end
$$;

create index if not exists photos_global_created_at_idx
  on public.photos(created_at desc)
  where visibility = 'global';

drop policy if exists "authenticated view global photos" on public.photos;
create policy "authenticated view global photos"
on public.photos
for select
to authenticated
using (
  auth.uid() is not null
  and visibility = 'global'
);

drop policy if exists "authenticated read global photo objects" on storage.objects;
create policy "authenticated read global photo objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'album-photos'
  and auth.uid() is not null
  and exists (
    select 1
    from public.photos
    where photos.storage_path = storage.objects.name
      and photos.visibility = 'global'
  )
);

commit;
