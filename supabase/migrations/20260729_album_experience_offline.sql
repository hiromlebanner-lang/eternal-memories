begin;

alter table public.albums
  add column if not exists cover_photo_id uuid,
  add column if not exists visibility text not null default 'private',
  add column if not exists icon text not null default 'images',
  add column if not exists theme_color text not null default '#c65476';

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_cover_photo_id_fkey'
      and conrelid = 'public.albums'::regclass
  ) then
    alter table public.albums
      add constraint albums_cover_photo_id_fkey
      foreign key (cover_photo_id)
      references public.photos(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_visibility_check'
      and conrelid = 'public.albums'::regclass
  ) then
    alter table public.albums
      add constraint albums_visibility_check
      check (visibility in ('private', 'limited', 'public'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_theme_color_check'
      and conrelid = 'public.albums'::regclass
  ) then
    alter table public.albums
      add constraint albums_theme_color_check
      check (theme_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$constraints$;

create table if not exists public.album_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default 'folder'
    check (char_length(icon) between 1 and 32),
  theme_color text not null default '#c65476'
    check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.user_album_preferences (
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  album_id uuid not null
    references public.albums(id) on delete cascade,
  folder_id uuid
    references public.album_folders(id) on delete set null,
  is_favorite boolean not null default false,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, album_id)
);

create table if not exists public.album_tags (
  album_id uuid not null
    references public.albums(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 30),
  added_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (album_id, tag)
);

create index if not exists user_album_preferences_favorite_idx
  on public.user_album_preferences(user_id, is_favorite, updated_at desc);
create index if not exists user_album_preferences_folder_idx
  on public.user_album_preferences(user_id, folder_id);
create index if not exists user_album_preferences_recent_idx
  on public.user_album_preferences(user_id, last_viewed_at desc);
create index if not exists album_tags_tag_idx
  on public.album_tags(tag);

create or replace function public.validate_album_cover_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.cover_photo_id is not null
    and not exists (
      select 1
      from public.photos as photo
      where photo.id = new.cover_photo_id
        and photo.album_id = new.id
    )
  then
    raise exception '表紙画像は同じアルバムの写真から選択してください';
  end if;
  return new;
end
$function$;

drop trigger if exists albums_validate_cover_photo on public.albums;
create trigger albums_validate_cover_photo
before insert or update of cover_photo_id on public.albums
for each row execute function public.validate_album_cover_photo();

create or replace function public.touch_album_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.albums
  set updated_at = now()
  where id = coalesce(new.album_id, old.album_id);
  return null;
end
$function$;

drop trigger if exists photos_touch_album_activity on public.photos;
create trigger photos_touch_album_activity
after insert or update or delete on public.photos
for each row execute function public.touch_album_activity();

create or replace function public.update_album_presentation(
  p_album_id uuid,
  p_cover_photo_id uuid,
  p_visibility text,
  p_icon text,
  p_theme_color text,
  p_tags text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_album_manager(p_album_id) then
    raise exception 'このアルバムの表示設定を変更する権限がありません';
  end if;

  update public.albums
  set cover_photo_id = p_cover_photo_id,
      visibility = p_visibility,
      icon = left(trim(p_icon), 32),
      theme_color = p_theme_color,
      updated_at = now()
  where id = p_album_id;

  if not found then
    raise exception 'アルバムが見つかりません';
  end if;

  delete from public.album_tags
  where album_id = p_album_id;

  insert into public.album_tags (album_id, tag, added_by)
  select p_album_id, normalized.tag, auth.uid()
  from (
    select distinct left(trim(value), 30) as tag
    from unnest(coalesce(p_tags, array[]::text[])) as value
    where trim(value) <> ''
    limit 12
  ) as normalized;
end
$function$;

alter table public.album_folders enable row level security;
alter table public.user_album_preferences enable row level security;
alter table public.album_tags enable row level security;

revoke all on table public.album_folders from anon;
revoke all on table public.user_album_preferences from anon;
revoke all on table public.album_tags from anon;

grant select, insert, update, delete
  on table public.album_folders to authenticated;
grant select, insert, update, delete
  on table public.user_album_preferences to authenticated;
grant select, insert, delete
  on table public.album_tags to authenticated;
grant select (updated_at, cover_photo_id, visibility, icon, theme_color)
  on table public.albums to authenticated;

drop policy if exists "users manage own album folders"
  on public.album_folders;
create policy "users manage own album folders"
on public.album_folders
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users manage own album preferences"
  on public.user_album_preferences;
create policy "users manage own album preferences"
on public.user_album_preferences
for all
to authenticated
using (
  user_id = auth.uid()
  and public.is_album_member(album_id)
)
with check (
  user_id = auth.uid()
  and public.is_album_member(album_id)
  and (
    folder_id is null
    or exists (
      select 1
      from public.album_folders as folder
      where folder.id = folder_id
        and folder.user_id = auth.uid()
    )
  )
);

drop policy if exists "members read album tags"
  on public.album_tags;
create policy "members read album tags"
on public.album_tags
for select
to authenticated
using (public.is_album_member(album_id));

drop policy if exists "managers add album tags"
  on public.album_tags;
create policy "managers add album tags"
on public.album_tags
for insert
to authenticated
with check (
  added_by = auth.uid()
  and public.is_album_manager(album_id)
);

drop policy if exists "managers delete album tags"
  on public.album_tags;
create policy "managers delete album tags"
on public.album_tags
for delete
to authenticated
using (public.is_album_manager(album_id));

revoke all on function public.validate_album_cover_photo() from public, anon;
revoke all on function public.touch_album_activity() from public, anon;
revoke all on function public.update_album_presentation(
  uuid, uuid, text, text, text, text[]
) from public, anon;
grant execute on function public.update_album_presentation(
  uuid, uuid, text, text, text, text[]
) to authenticated;

commit;
