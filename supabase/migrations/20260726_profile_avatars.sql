begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and name = auth.uid()::text || '.jpg'
);

drop policy if exists "users update own avatar" on storage.objects;
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

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and name = auth.uid()::text || '.jpg'
);

create or replace function public.get_nearby_profile_cards(p_user_ids uuid[])
returns table (
  id uuid,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if coalesce(cardinality(p_user_ids), 0) > 50 then
    raise exception '一度に確認できるユーザー数を超えています';
  end if;

  return query
  select profile.id, profile.display_name, profile.avatar_url
  from public.profiles as profile
  where profile.id = any(coalesce(p_user_ids, array[]::uuid[]))
    and profile.id <> auth.uid();
end;
$$;

revoke all on function public.get_nearby_profile_cards(uuid[]) from public;
grant execute on function public.get_nearby_profile_cards(uuid[]) to authenticated;

commit;

