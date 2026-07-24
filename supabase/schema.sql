-- MapAlbum Supabase schema
-- Supabase Dashboard > SQL Editor で、このファイル全体を1回実行してください。

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'album_role') then
    create type public.album_role as enum ('admin', 'editor', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'photo_category') then
    create type public.photo_category as enum (
      'scenery',
      'food',
      'activity',
      'stay',
      'people',
      'other'
    );
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default 'メンバー',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8)),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.album_members (
  album_id uuid not null references public.albums(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.album_role not null default 'viewer',
  joined_at timestamptz not null default now(),
  primary key (album_id, user_id)
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  author_name text not null,
  storage_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 500),
  category public.photo_category not null default 'other',
  captured_at timestamptz not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists album_members_user_id_idx
  on public.album_members(user_id);
create index if not exists photos_album_captured_idx
  on public.photos(album_id, captured_at desc);
create index if not exists photos_author_id_idx
  on public.photos(author_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists albums_set_updated_at on public.albums;
create trigger albums_set_updated_at
before update on public.albums
for each row execute function public.set_updated_at();

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at
before update on public.photos
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, 'member'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

create or replace function public.add_album_creator_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.album_members (album_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict (album_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_album_created on public.albums;
create trigger on_album_created
after insert on public.albums
for each row execute function public.add_album_creator_as_admin();

create or replace function public.is_album_member(target_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.album_members
    where album_id = target_album_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.current_album_role(target_album_id uuid)
returns public.album_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.album_members
  where album_id = target_album_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      target_user_id = auth.uid()
      or exists (
        select 1
        from public.album_members as mine
        join public.album_members as target
          on target.album_id = mine.album_id
        where mine.user_id = auth.uid()
          and target.user_id = target_user_id
      )
    );
$$;

create or replace function public.join_album_by_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_album_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select id into target_album_id
  from public.albums
  where upper(replace(invite_code, '-', '')) =
        upper(replace(trim(p_invite_code), '-', ''))
  limit 1;

  if target_album_id is null then
    raise exception '招待コードが見つかりません';
  end if;

  insert into public.album_members (album_id, user_id, role)
  values (target_album_id, auth.uid(), 'viewer')
  on conflict (album_id, user_id) do nothing;

  return target_album_id;
end;
$$;

revoke all on function public.join_album_by_code(text) from public;
grant execute on function public.join_album_by_code(text) to authenticated;
revoke all on function public.is_album_member(uuid) from public;
revoke all on function public.current_album_role(uuid) from public;
revoke all on function public.can_view_profile(uuid) from public;
grant execute on function public.is_album_member(uuid) to authenticated;
grant execute on function public.current_album_role(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.add_album_creator_as_admin() from public;

alter table public.profiles enable row level security;
alter table public.albums enable row level security;
alter table public.album_members enable row level security;
alter table public.photos enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.albums from anon;
revoke all on table public.album_members from anon;
revoke all on table public.photos from anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.albums to authenticated;
grant select, insert, update, delete on table public.album_members to authenticated;
grant select, insert, update, delete on table public.photos to authenticated;

drop policy if exists "authenticated profiles are visible" on public.profiles;
drop policy if exists "album members view related profiles" on public.profiles;
create policy "album members view related profiles"
on public.profiles for select
to authenticated
using ((select public.can_view_profile(id)));

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "members view albums" on public.albums;
create policy "members view albums"
on public.albums for select
to authenticated
using (public.is_album_member(id));

drop policy if exists "users create albums" on public.albums;
create policy "users create albums"
on public.albums for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "admins update albums" on public.albums;
create policy "admins update albums"
on public.albums for update
to authenticated
using (public.current_album_role(id) = 'admin')
with check (public.current_album_role(id) = 'admin');

drop policy if exists "admins delete albums" on public.albums;
create policy "admins delete albums"
on public.albums for delete
to authenticated
using (public.current_album_role(id) = 'admin');

drop policy if exists "members view memberships" on public.album_members;
create policy "members view memberships"
on public.album_members for select
to authenticated
using (public.is_album_member(album_id));

drop policy if exists "admins add members" on public.album_members;
create policy "admins add members"
on public.album_members for insert
to authenticated
with check (public.current_album_role(album_id) = 'admin');

drop policy if exists "admins update member roles" on public.album_members;
create policy "admins update member roles"
on public.album_members for update
to authenticated
using (public.current_album_role(album_id) = 'admin')
with check (
  public.current_album_role(album_id) = 'admin'
  and (
    user_id <> (
      select target_album.created_by
      from public.albums as target_album
      where target_album.id = album_members.album_id
    )
    or role = 'admin'
  )
);

drop policy if exists "admins or self remove members" on public.album_members;
create policy "admins or self remove members"
on public.album_members for delete
to authenticated
using (
  public.current_album_role(album_id) = 'admin'
  or user_id = auth.uid()
);

drop policy if exists "members view photos" on public.photos;
create policy "members view photos"
on public.photos for select
to authenticated
using (public.is_album_member(album_id));

drop policy if exists "editors upload photos" on public.photos;
create policy "editors upload photos"
on public.photos for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.current_album_role(album_id) in ('admin', 'editor')
);

drop policy if exists "authors or admins update photos" on public.photos;
create policy "authors or admins update photos"
on public.photos for update
to authenticated
using (
  author_id = auth.uid()
  or public.current_album_role(album_id) = 'admin'
)
with check (
  (
    author_id = auth.uid()
    and public.current_album_role(album_id) in ('admin', 'editor')
  )
  or public.current_album_role(album_id) = 'admin'
);

drop policy if exists "authors or admins delete photos" on public.photos;
create policy "authors or admins delete photos"
on public.photos for delete
to authenticated
using (
  author_id = auth.uid()
  or public.current_album_role(album_id) = 'admin'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'album-photos',
  'album-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read album photos" on storage.objects;
create policy "members read album photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'album-photos'
  and public.is_album_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "editors upload album photos" on storage.objects;
create policy "editors upload album photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'album-photos'
  and ((storage.foldername(name))[2])::uuid = auth.uid()
  and public.current_album_role(((storage.foldername(name))[1])::uuid)
      in ('admin', 'editor')
);

drop policy if exists "authors or admins delete stored photos" on storage.objects;
create policy "authors or admins delete stored photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'album-photos'
  and (
    ((storage.foldername(name))[2])::uuid = auth.uid()
    or public.current_album_role(((storage.foldername(name))[1])::uuid) = 'admin'
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table public.photos;
  end if;
end
$$;
