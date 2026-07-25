-- MapAlbum Supabase schema
-- Supabase Dashboard > SQL Editor で、このファイル全体を実行してください。
-- 旧版から再実行した場合も editor → member、アルバム作成者 → owner に移行します。

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'album_role_v2'
  ) then
    create type public.album_role_v2 as enum (
      'owner',
      'admin',
      'member',
      'viewer'
    );
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'photo_category'
  ) then
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
  invite_code text not null unique
    default upper(substr(encode(gen_random_bytes(16), 'hex'), 1, 16)),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.album_members (
  album_id uuid not null references public.albums(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.album_role_v2 not null default 'member',
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

create table if not exists public.album_invitations (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  email text not null check (email = lower(email)),
  token uuid not null unique default gen_random_uuid(),
  role public.album_role_v2 not null default 'member'
    check (role <> 'owner'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'revoked')),
  invited_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create table if not exists public.album_join_requests (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invitation_id uuid references public.album_invitations(id) on delete set null,
  requested_role public.album_role_v2 not null default 'member'
    check (requested_role <> 'owner'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint reviewed_request_has_reviewer check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

-- 旧版のenumを参照する同名RPCがオーバーロードとして残ると、PostgRESTから
-- 呼び分けられません。MapAlbumが管理するRPCだけを署名ごと削除し、後段で
-- album_role_v2を使う定義へ統一します。依存する旧RLSも後段で再作成します。
do $$
declare
  target_function record;
begin
  for target_function in
    select procedure.oid::regprocedure::text as signature
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'is_album_member',
        'current_album_role',
        'is_album_manager',
        'can_view_profile',
        'get_album_invite_code',
        'create_album_invitation',
        'request_album_membership',
        'review_album_join_request',
        'change_album_member_role',
        'join_album_by_code',
        'safe_uuid'
      )
  loop
    execute format('drop function %s cascade', target_function.signature);
  end loop;
end
$$;

-- album_membersだけでなく、招待と参加申請の権限列も旧enumから移行します。
-- 列に付いた旧enum依存のCHECK制約を先に外し、移行後に同じ制約を戻します。
do $$
declare
  target_constraint record;
  target_column record;
  role_type text;
begin
  for target_constraint in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      constraint_row.conname as constraint_name
    from pg_constraint as constraint_row
    join pg_class as relation
      on relation.oid = constraint_row.conrelid
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    join pg_attribute as attribute
      on attribute.attrelid = relation.oid
      and attribute.attnum = any(constraint_row.conkey)
    where namespace.nspname = 'public'
      and constraint_row.contype = 'c'
      and (
        (relation.relname = 'album_invitations' and attribute.attname = 'role')
        or
        (
          relation.relname = 'album_join_requests'
          and attribute.attname = 'requested_role'
        )
      )
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      target_constraint.schema_name,
      target_constraint.table_name,
      target_constraint.constraint_name
    );
  end loop;

  for target_column in
    select *
    from (
      values
        ('album_members', 'role'),
        ('album_invitations', 'role'),
        ('album_join_requests', 'requested_role')
    ) as columns_to_migrate(table_name, column_name)
  loop
    select column_row.udt_name
      into role_type
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = target_column.table_name
      and column_row.column_name = target_column.column_name;

    if role_type is distinct from 'album_role_v2' then
      execute format(
        'alter table public.%I alter column %I drop default',
        target_column.table_name,
        target_column.column_name
      );
      execute format(
        'alter table public.%I alter column %I type public.album_role_v2
         using (
           case %I::text
             when ''owner'' then ''owner''
             when ''admin'' then ''admin''
             when ''editor'' then ''member''
             when ''member'' then ''member''
             else ''viewer''
           end
         )::public.album_role_v2',
        target_column.table_name,
        target_column.column_name,
        target_column.column_name
      );
    end if;

    execute format(
      'alter table public.%I alter column %I
       set default ''member''::public.album_role_v2',
      target_column.table_name,
      target_column.column_name
    );
  end loop;
end
$$;

alter table public.album_invitations
  add constraint album_invitations_role_not_owner
  check (role <> 'owner');
alter table public.album_join_requests
  add constraint album_join_requests_role_not_owner
  check (requested_role <> 'owner');

-- 新規アルバムのコードは64bit相当とし、既存コードはリンク切れを避けて維持します。
alter table public.albums
  alter column invite_code
  set default upper(substr(encode(gen_random_bytes(16), 'hex'), 1, 16));

-- 作成者だけをオーナーに統一します。欠けている作成者行も補完するため、
-- 旧版からの再実行後も必ず各アルバムに1人のオーナーが存在します。
update public.album_members as member
set role = 'admin'
from public.albums as album
where member.album_id = album.id
  and member.role = 'owner'
  and member.user_id <> album.created_by;

insert into public.album_members (album_id, user_id, role)
select album.id, album.created_by, 'owner'
from public.albums as album
on conflict (album_id, user_id) do update
set role = 'owner';

create index if not exists album_members_user_id_idx
  on public.album_members(user_id);
create index if not exists photos_album_captured_idx
  on public.photos(album_id, captured_at desc);
create index if not exists photos_author_id_idx
  on public.photos(author_id);
create index if not exists album_invitations_album_status_idx
  on public.album_invitations(album_id, status, created_at desc);
create unique index if not exists album_invitations_one_pending_email_idx
  on public.album_invitations(album_id, email)
  where status = 'pending';
create index if not exists album_join_requests_album_status_idx
  on public.album_join_requests(album_id, status, created_at);
create unique index if not exists album_join_requests_one_pending_user_idx
  on public.album_join_requests(album_id, user_id)
  where status = 'pending';

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

create or replace function public.protect_photo_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  expected_storage_path text;
begin
  if auth.uid() is null or new.author_id is distinct from auth.uid() then
    raise exception '投稿者情報が正しくありません';
  end if;

  select profile.display_name
    into profile_name
  from public.profiles as profile
  where profile.id = auth.uid();

  new.author_name := coalesce(profile_name, 'メンバー');
  expected_storage_path :=
    new.album_id::text || '/' || new.author_id::text || '/' || new.id::text || '.jpg';
  if new.storage_path is distinct from expected_storage_path then
    raise exception '写真の保存先が正しくありません';
  end if;
  return new;
end;
$$;

drop trigger if exists photos_protect_identity on public.photos;
create trigger photos_protect_identity
before insert on public.photos
for each row execute function public.protect_photo_identity();

create or replace function public.protect_album_identity()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'アルバムの作成者は変更できません';
  end if;
  return new;
end;
$$;

drop trigger if exists albums_protect_identity on public.albums;
create trigger albums_protect_identity
before update on public.albums
for each row execute function public.protect_album_identity();

create or replace function public.protect_album_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  album_creator uuid;
begin
  if tg_op = 'UPDATE'
    and old.role = 'owner'
    and (
      new.role <> 'owner'
      or new.album_id <> old.album_id
      or new.user_id <> old.user_id
    ) then
    raise exception 'オーナー権限は変更できません';
  end if;

  if new.role = 'owner' then
    select album.created_by
      into album_creator
    from public.albums as album
    where album.id = new.album_id;

    if album_creator is null or album_creator <> new.user_id then
      raise exception 'アルバム作成者以外をオーナーにはできません';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists album_members_protect_owner on public.album_members;
create trigger album_members_protect_owner
before insert or update on public.album_members
for each row execute function public.protect_album_owner();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    lower(coalesce(new.email, '')),
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

create or replace function public.add_album_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.album_members (album_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (album_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists on_album_created on public.albums;
create trigger on_album_created
after insert on public.albums
for each row execute function public.add_album_creator_as_owner();

drop function if exists public.add_album_creator_as_admin();

create or replace function public.is_album_member(target_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.album_members
    where album_id = target_album_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.current_album_role(target_album_id uuid)
returns public.album_role_v2
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.album_members
  where album_id = target_album_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_album_manager(target_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_album_role(target_album_id) in ('owner', 'admin'),
    false
  );
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
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
      or exists (
        select 1
        from public.album_join_requests as request
        where request.user_id = target_user_id
          and request.status = 'pending'
          and public.is_album_manager(request.album_id)
      )
    );
$$;

create or replace function public.create_album_invitation(
  p_album_id uuid,
  p_email text,
  p_role public.album_role_v2 default 'member'
)
returns table (
  id uuid,
  album_id uuid,
  email text,
  token uuid,
  role public.album_role_v2,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(p_email));
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  perform 1
  from public.albums as album
  where album.id = p_album_id
    and public.is_album_manager(album.id)
  for update;
  if not found then
    raise exception '招待を作成する権限がありません';
  end if;
  if normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception '正しいメールアドレスを入力してください';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'オーナー権限は招待に指定できません';
  end if;
  if exists (
    select 1
    from public.album_members as member
    join auth.users as invited_user on invited_user.id = member.user_id
    where member.album_id = p_album_id
      and lower(invited_user.email) = normalized_email
  ) then
    raise exception 'このメールアドレスはすでに参加しています';
  end if;

  update public.album_invitations as old_invitation
  set status = 'revoked'
  where old_invitation.album_id = p_album_id
    and old_invitation.email = normalized_email
    and old_invitation.status = 'pending';

  return query
  insert into public.album_invitations (
    album_id,
    email,
    role,
    invited_by
  )
  values (
    p_album_id,
    normalized_email,
    p_role,
    auth.uid()
  )
  returning
    album_invitations.id,
    album_invitations.album_id,
    album_invitations.email,
    album_invitations.token,
    album_invitations.role,
    album_invitations.status,
    album_invitations.created_at,
    album_invitations.expires_at;
end;
$$;

create or replace function public.get_album_invite_code(p_album_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if not public.is_album_manager(p_album_id) then
    raise exception '招待情報を表示する権限がありません';
  end if;

  select album.invite_code
    into result
  from public.albums as album
  where album.id = p_album_id;
  if result is null then
    raise exception 'アルバムが見つかりません';
  end if;
  return result;
end;
$$;

create or replace function public.request_album_membership(
  p_invite_code text default null,
  p_invite_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_album_id uuid;
  target_invitation_id uuid;
  target_role public.album_role_v2 := 'member';
  target_email text;
  current_email text;
  current_email_is_verified boolean;
  existing_request_id uuid;
  new_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select lower(app_user.email), app_user.email_confirmed_at is not null
    into current_email, current_email_is_verified
  from auth.users as app_user
  where app_user.id = auth.uid();

  if p_invite_token is not null then
    select invitation.album_id, invitation.id, invitation.role, invitation.email
      into target_album_id, target_invitation_id, target_role, target_email
    from public.album_invitations as invitation
    where invitation.token = p_invite_token
      and invitation.status = 'pending'
      and invitation.expires_at > now()
    limit 1;

    if target_album_id is null then
      raise exception '招待URLが無効か、有効期限が切れています';
    end if;
    if current_email is distinct from lower(target_email) then
      raise exception '招待されたメールアドレスでログインしてください';
    end if;
    if not coalesce(current_email_is_verified, false) then
      raise exception 'メールアドレスの確認を完了してください';
    end if;
  elsif nullif(trim(p_invite_code), '') is not null then
    if not coalesce(current_email_is_verified, false) then
      raise exception 'メールアドレスの確認を完了してください';
    end if;
    select album.id
      into target_album_id
    from public.albums as album
    where upper(replace(album.invite_code, '-', '')) =
          upper(replace(trim(p_invite_code), '-', ''))
    limit 1;

    if target_album_id is null then
      raise exception '招待コードが見つかりません';
    end if;
  else
    raise exception '招待コードまたは招待URLが必要です';
  end if;

  -- 招待の再発行・参加承認との競合を直列化し、ロック取得後に
  -- メール専用招待がまだ有効かを再確認します。
  perform 1
  from public.albums as album
  where album.id = target_album_id
  for update;
  if not found then
    raise exception 'アルバムが見つかりません';
  end if;

  if target_invitation_id is not null and not exists (
    select 1
    from public.album_invitations as invitation
    where invitation.id = target_invitation_id
      and invitation.album_id = target_album_id
      and invitation.token = p_invite_token
      and invitation.status = 'pending'
      and invitation.expires_at > now()
      and lower(invitation.email) = current_email
  ) then
    raise exception '招待URLが無効か、有効期限が切れています';
  end if;

  if exists (
    select 1 from public.album_members
    where album_id = target_album_id
      and user_id = auth.uid()
  ) then
    raise exception 'このアルバムにはすでに参加しています';
  end if;

  select request.id
    into existing_request_id
  from public.album_join_requests as request
  where request.album_id = target_album_id
    and request.user_id = auth.uid()
    and request.status = 'pending'
  limit 1;

  if existing_request_id is not null then
    if target_invitation_id is not null then
      update public.album_join_requests
      set
        invitation_id = target_invitation_id,
        requested_role = target_role
      where id = existing_request_id;
    end if;
    return existing_request_id;
  end if;

  insert into public.album_join_requests (
    album_id,
    user_id,
    invitation_id,
    requested_role
  )
  values (
    target_album_id,
    auth.uid(),
    target_invitation_id,
    target_role
  )
  returning id into new_request_id;

  return new_request_id;
end;
$$;

create or replace function public.review_album_join_request(
  p_request_id uuid,
  p_approve boolean,
  p_role public.album_role_v2 default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.album_join_requests%rowtype;
  approved_role public.album_role_v2;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select *
    into target_request
  from public.album_join_requests
  where id = p_request_id
  for update;

  if target_request.id is null or target_request.status <> 'pending' then
    raise exception '承認待ちの参加申請が見つかりません';
  end if;
  if not public.is_album_manager(target_request.album_id) then
    raise exception '参加申請を処理する権限がありません';
  end if;

  approved_role := coalesce(p_role, target_request.requested_role);
  if approved_role = 'owner' then
    raise exception 'オーナー権限は付与できません';
  end if;

  if p_approve then
    if target_request.invitation_id is not null and not exists (
      select 1
      from public.album_invitations as invitation
      where invitation.id = target_request.invitation_id
        and invitation.album_id = target_request.album_id
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    ) then
      raise exception '招待URLが無効か、有効期限が切れています';
    end if;

    insert into public.album_members (album_id, user_id, role)
    values (target_request.album_id, target_request.user_id, approved_role)
    on conflict (album_id, user_id) do nothing;
  end if;

  update public.album_join_requests
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = target_request.id;

  if target_request.invitation_id is not null then
    update public.album_invitations
    set status = case when p_approve then 'accepted' else 'rejected' end
    where id = target_request.invitation_id;
  end if;

  return target_request.album_id;
end;
$$;

create or replace function public.change_album_member_role(
  p_album_id uuid,
  p_user_id uuid,
  p_role public.album_role_v2
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  perform 1
  from public.albums as album
  where album.id = p_album_id
  for update;
  if not found then
    raise exception 'アルバムが見つかりません';
  end if;
  if not public.is_album_manager(p_album_id) then
    raise exception '権限を変更する権限がありません';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'オーナー権限は付与できません';
  end if;
  if exists (
    select 1
    from public.album_members
    where album_id = p_album_id
      and user_id = p_user_id
      and role = 'owner'
  ) then
    raise exception 'オーナー権限は変更できません';
  end if;

  update public.album_members
  set role = p_role
  where album_id = p_album_id
    and user_id = p_user_id;

  if not found then
    raise exception '対象のメンバーが見つかりません';
  end if;
end;
$$;

create or replace function public.safe_uuid(value text)
returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then value::uuid
    else null
  end;
$$;

-- 旧版の「コード入力で即参加」RPCは削除し、承認制RPCだけを公開します。
drop function if exists public.join_album_by_code(text);

revoke all on function public.set_updated_at() from public;
revoke all on function public.protect_album_identity() from public;
revoke all on function public.protect_album_owner() from public;
revoke all on function public.protect_photo_identity() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.add_album_creator_as_owner() from public;
revoke all on function public.is_album_member(uuid) from public;
revoke all on function public.current_album_role(uuid) from public;
revoke all on function public.is_album_manager(uuid) from public;
revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.get_album_invite_code(uuid) from public;
revoke all on function public.create_album_invitation(
  uuid, text, public.album_role_v2
) from public;
revoke all on function public.request_album_membership(text, uuid) from public;
revoke all on function public.review_album_join_request(
  uuid, boolean, public.album_role_v2
) from public;
revoke all on function public.change_album_member_role(
  uuid, uuid, public.album_role_v2
) from public;
revoke all on function public.safe_uuid(text) from public;

grant execute on function public.is_album_member(uuid) to authenticated;
grant execute on function public.current_album_role(uuid) to authenticated;
grant execute on function public.is_album_manager(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.get_album_invite_code(uuid) to authenticated;
grant execute on function public.create_album_invitation(
  uuid, text, public.album_role_v2
) to authenticated;
grant execute on function public.request_album_membership(text, uuid)
  to authenticated;
grant execute on function public.review_album_join_request(
  uuid, boolean, public.album_role_v2
) to authenticated;
grant execute on function public.change_album_member_role(
  uuid, uuid, public.album_role_v2
) to authenticated;
grant execute on function public.safe_uuid(text) to authenticated;
grant usage on type public.album_role_v2 to authenticated;
grant usage on type public.photo_category to authenticated;

alter table public.profiles enable row level security;
alter table public.albums enable row level security;
alter table public.album_members enable row level security;
alter table public.photos enable row level security;
alter table public.album_invitations enable row level security;
alter table public.album_join_requests enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.albums from anon;
revoke all on table public.album_members from anon;
revoke all on table public.photos from anon;
revoke all on table public.album_invitations from anon;
revoke all on table public.album_join_requests from anon;

-- 再実行前の広い権限を残さないようauthenticatedもいったん全取消します。
revoke all on table public.profiles from authenticated;
revoke all on table public.albums from authenticated;
revoke all on table public.album_members from authenticated;
revoke all on table public.photos from authenticated;
revoke all on table public.album_invitations from authenticated;
revoke all on table public.album_join_requests from authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url)
  on table public.profiles to authenticated;
grant select (id, name, description, created_by, created_at)
  on table public.albums to authenticated;
grant delete on table public.albums to authenticated;
grant insert (name, description)
  on table public.albums to authenticated;
grant update (name, description)
  on table public.albums to authenticated;
grant select on table public.album_members to authenticated;
grant select, delete on table public.photos to authenticated;
grant insert (
  id,
  album_id,
  author_id,
  author_name,
  storage_path,
  caption,
  category,
  captured_at,
  latitude,
  longitude
) on table public.photos to authenticated;
grant update (caption, category, captured_at, latitude, longitude)
  on table public.photos to authenticated;
grant select on table public.album_invitations to authenticated;
grant select on table public.album_join_requests to authenticated;

-- MapAlbumの6テーブルに旧版の広いポリシーを残さず、以下で再構築します。
do $$
declare
  old_policy record;
begin
  for old_policy in
    select policy.schemaname, policy.tablename, policy.policyname
    from pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename in (
        'profiles',
        'albums',
        'album_members',
        'photos',
        'album_invitations',
        'album_join_requests'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      old_policy.policyname,
      old_policy.schemaname,
      old_policy.tablename
    );
  end loop;
end
$$;

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
using (
  created_by = auth.uid()
  or public.is_album_member(id)
);

drop policy if exists "users create albums" on public.albums;
create policy "users create albums"
on public.albums for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "admins update albums" on public.albums;
drop policy if exists "managers update albums" on public.albums;
create policy "managers update albums"
on public.albums for update
to authenticated
using (public.is_album_manager(id))
with check (public.is_album_manager(id));

drop policy if exists "admins delete albums" on public.albums;
drop policy if exists "owners delete albums" on public.albums;
create policy "owners delete albums"
on public.albums for delete
to authenticated
using (public.current_album_role(id) = 'owner');

drop policy if exists "members view memberships" on public.album_members;
create policy "members view memberships"
on public.album_members for select
to authenticated
using (public.is_album_member(album_id));

drop policy if exists "admins add members" on public.album_members;
drop policy if exists "managers add members" on public.album_members;
create policy "managers add members"
on public.album_members for insert
to authenticated
with check (
  public.is_album_manager(album_id)
  and role <> 'owner'
);

drop policy if exists "admins update member roles" on public.album_members;
drop policy if exists "managers update member roles" on public.album_members;
create policy "managers update member roles"
on public.album_members for update
to authenticated
using (
  public.is_album_manager(album_id)
  and role <> 'owner'
)
with check (
  public.is_album_manager(album_id)
  and role <> 'owner'
);

drop policy if exists "admins or self remove members" on public.album_members;
drop policy if exists "managers or self remove members" on public.album_members;
create policy "managers or self remove members"
on public.album_members for delete
to authenticated
using (
  role <> 'owner'
  and (
    public.is_album_manager(album_id)
    or user_id = auth.uid()
  )
);

drop policy if exists "managers view invitations" on public.album_invitations;
create policy "managers view invitations"
on public.album_invitations for select
to authenticated
using (public.is_album_manager(album_id));

drop policy if exists "managers view join requests" on public.album_join_requests;
create policy "managers view join requests"
on public.album_join_requests for select
to authenticated
using (
  public.is_album_manager(album_id)
  or user_id = auth.uid()
);

drop policy if exists "members view photos" on public.photos;
create policy "members view photos"
on public.photos for select
to authenticated
using (public.is_album_member(album_id));

drop policy if exists "editors upload photos" on public.photos;
drop policy if exists "contributors upload photos" on public.photos;
create policy "contributors upload photos"
on public.photos for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.current_album_role(album_id) in ('owner', 'admin', 'member')
);

drop policy if exists "authors or admins update photos" on public.photos;
drop policy if exists "authors or managers update photos" on public.photos;
create policy "authors or managers update photos"
on public.photos for update
to authenticated
using (
  (
    author_id = auth.uid()
    and public.current_album_role(album_id) in ('owner', 'admin', 'member')
  )
  or public.is_album_manager(album_id)
)
with check (
  (
    author_id = auth.uid()
    and public.current_album_role(album_id) in ('owner', 'admin', 'member')
  )
  or public.is_album_manager(album_id)
);

drop policy if exists "authors or admins delete photos" on public.photos;
drop policy if exists "authors or managers delete photos" on public.photos;
create policy "authors or managers delete photos"
on public.photos for delete
to authenticated
using (
  author_id = auth.uid()
  or public.is_album_manager(album_id)
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
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

-- 同じPrivateバケットに対する旧版ポリシーだけを整理します。他バケットの
-- ポリシーには触れません。
do $$
declare
  old_policy record;
begin
  for old_policy in
    select policy.policyname
    from pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and (
        coalesce(policy.qual, '') ilike '%album-photos%'
        or coalesce(policy.with_check, '') ilike '%album-photos%'
      )
  loop
    execute format(
      'drop policy %I on storage.objects',
      old_policy.policyname
    );
  end loop;
end
$$;

drop policy if exists "members read album photos" on storage.objects;
create policy "members read album photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'album-photos'
  and public.is_album_member(
    public.safe_uuid((storage.foldername(name))[1])
  )
);

drop policy if exists "editors upload album photos" on storage.objects;
drop policy if exists "contributors upload album photos" on storage.objects;
create policy "contributors upload album photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'album-photos'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.current_album_role(
    public.safe_uuid((storage.foldername(name))[1])
  )
      in ('owner', 'admin', 'member')
);

drop policy if exists "authors or admins delete stored photos" on storage.objects;
drop policy if exists "authors or managers delete stored photos" on storage.objects;
create policy "authors or managers delete stored photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'album-photos'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.is_album_manager(
      public.safe_uuid((storage.foldername(name))[1])
    )
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'photos'
  ) then alter publication supabase_realtime add table public.photos; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'album_members'
  ) then alter publication supabase_realtime add table public.album_members; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'album_join_requests'
  ) then alter publication supabase_realtime add table public.album_join_requests; end if;
end
$$;
