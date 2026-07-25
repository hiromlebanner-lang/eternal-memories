-- MapAlbum
-- Safe additive migration: invitations, join requests, notifications, nearby users
-- File: supabase/migrations/20260725_safe_invite_notifications.sql
--
-- IMPORTANT
-- - This file does not migrate or rewrite existing album member roles.
-- - This file does not update existing albums, photos, profiles, members, or Storage.
-- - Existing album rows keep owner_id / invite setting columns as NULL. Runtime
--   functions treat created_by as the owner and NULL invite settings as legacy-safe
--   defaults. New albums receive defaults automatically.
-- - No table or policy is dropped. Policies created by this migration have the
--   mapalbum_20260725_ prefix.
-- - Function bodies contain the INSERT / UPDATE operations required when users
--   later submit or review requests. No such function is invoked by this migration.
-- - Run the complete file in Supabase SQL Editor only after reviewing section 0.
-- - Web Push also needs the Edge Function, VAPID secrets, and Database Webhook
--   documented in README.md. Those secrets are intentionally not embedded here.

-- ============================================================================
-- 0. BEFORE: read-only inspection
-- ============================================================================

select
  current_database() as database_name,
  now() as checked_at,
  to_regclass('public.profiles') is not null as profiles_exists,
  to_regclass('public.albums') is not null as albums_exists,
  to_regclass('public.album_members') is not null as album_members_exists,
  to_regclass('public.photos') is not null as photos_exists,
  to_regclass('storage.objects') is not null as storage_objects_exists,
  to_regtype('public.album_role_v2') is not null as album_role_v2_exists;

select
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'albums' and column_name in (
      'id',
      'name',
      'invite_code',
      'created_by',
      'owner_id',
      'members_can_invite',
      'invite_code_enabled',
      'invite_code_expires_at'
    ))
    or
    (table_name = 'album_members' and column_name in (
      'album_id',
      'user_id',
      'role'
    ))
  )
order by table_name, ordinal_position;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname in ('public', 'realtime')
  and tablename in (
    'profiles',
    'album_invitations',
    'album_join_requests',
    'nearby_invitations',
    'push_subscriptions',
    'messages'
  )
order by schemaname, tablename, policyname;

do $preflight$
declare
  member_role_type text;
  member_role_oid oid;
  normalized_code_duplicates bigint;
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.albums') is null
    or to_regclass('public.album_members') is null
    or to_regclass('public.photos') is null then
    raise exception
      'Preflight failed: profiles, albums, album_members, and photos must already exist.';
  end if;

  if to_regtype('public.album_role_v2') is null then
    raise exception
      'Preflight failed: public.album_role_v2 is missing. This safe migration will not convert existing member roles.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) then
    raise exception 'Preflight failed: public.profiles.id must be uuid.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'albums'
      and column_name = 'id'
      and udt_name = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'albums'
      and column_name = 'created_by'
      and udt_name = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'albums'
      and column_name = 'invite_code'
      and data_type = 'text'
  ) then
    raise exception
      'Preflight failed: public.albums must have uuid id/created_by and text invite_code columns.';
  end if;

  select
    format_type(attribute.atttypid, attribute.atttypmod),
    attribute.atttypid
    into member_role_type, member_role_oid
  from pg_attribute as attribute
  where attribute.attrelid = 'public.album_members'::regclass
    and attribute.attname = 'role'
    and not attribute.attisdropped;

  if member_role_oid is distinct from
    to_regtype('public.album_role_v2')::oid then
    raise exception
      'Preflight failed: album_members.role is %, expected public.album_role_v2. Existing roles were not changed.',
      coalesce(member_role_type, '(missing)');
  end if;

  select count(*)
    into normalized_code_duplicates
  from (
    select upper(replace(trim(invite_code), '-', ''))
    from public.albums
    where nullif(trim(invite_code), '') is not null
    group by upper(replace(trim(invite_code), '-', ''))
    having count(*) > 1
  ) as duplicate_codes;

  if normalized_code_duplicates > 0 then
    raise exception
      'Preflight failed: % duplicate normalized album invite code group(s) exist. No changes were made.',
      normalized_code_duplicates;
  end if;
end
$preflight$;

-- ============================================================================
-- 1. TRANSACTIONAL MIGRATION
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local check_function_bodies = on;

-- --------------------------------------------------------------------------
-- 1.1 Additive album invite settings
-- Existing rows are intentionally left NULL and are never backfilled.
-- --------------------------------------------------------------------------

alter table public.albums
  add column if not exists owner_id uuid;
alter table public.albums
  add column if not exists members_can_invite boolean;
alter table public.albums
  add column if not exists invite_code_enabled boolean;
alter table public.albums
  add column if not exists invite_code_expires_at timestamptz;

alter table public.albums
  alter column owner_id set default auth.uid();
alter table public.albums
  alter column members_can_invite set default false;
alter table public.albums
  alter column invite_code_enabled set default true;
alter table public.albums
  alter column invite_code_expires_at
    set default (now() + interval '30 days');

do $album_column_compatibility$
declare
  actual_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into actual_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.albums'::regclass
    and attribute.attname = 'owner_id'
    and not attribute.attisdropped;
  if actual_type is distinct from 'uuid' then
    raise exception 'albums.owner_id must be uuid, found %.', actual_type;
  end if;

  select format_type(attribute.atttypid, attribute.atttypmod)
    into actual_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.albums'::regclass
    and attribute.attname = 'members_can_invite'
    and not attribute.attisdropped;
  if actual_type is distinct from 'boolean' then
    raise exception
      'albums.members_can_invite must be boolean, found %.', actual_type;
  end if;

  select format_type(attribute.atttypid, attribute.atttypmod)
    into actual_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.albums'::regclass
    and attribute.attname = 'invite_code_enabled'
    and not attribute.attisdropped;
  if actual_type is distinct from 'boolean' then
    raise exception
      'albums.invite_code_enabled must be boolean, found %.', actual_type;
  end if;

  select format_type(attribute.atttypid, attribute.atttypmod)
    into actual_type
  from pg_attribute as attribute
  where attribute.attrelid = 'public.albums'::regclass
    and attribute.attname = 'invite_code_expires_at'
    and not attribute.attisdropped;
  if actual_type is distinct from 'timestamp with time zone' then
    raise exception
      'albums.invite_code_expires_at must be timestamptz, found %.',
      actual_type;
  end if;
end
$album_column_compatibility$;

do $owner_foreign_key$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.albums'::regclass
      and conname = 'mapalbum_20260725_albums_owner_id_fkey'
  ) then
    alter table public.albums
      add constraint mapalbum_20260725_albums_owner_id_fkey
      foreign key (owner_id)
      references public.profiles(id)
      on delete restrict
      not valid;
  end if;
end
$owner_foreign_key$;

create or replace function public.mapalbum_20260725_guard_album_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'ログインが必要です';
    end if;
    if new.owner_id is null then
      new.owner_id := auth.uid();
    elsif new.owner_id <> auth.uid() then
      raise exception 'owner_idにはログインユーザーだけを指定できます';
    end if;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception '既存アルバムのowner_idは変更できません';
  end if;
  return new;
end
$function$;

do $owner_trigger$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.albums'::regclass
      and tgname = 'mapalbum_20260725_guard_album_owner'
      and not tgisinternal
  ) then
    create trigger mapalbum_20260725_guard_album_owner
    before insert or update of owner_id on public.albums
    for each row
    execute function public.mapalbum_20260725_guard_album_owner();
  end if;
end
$owner_trigger$;

create unique index if not exists
  mapalbum_20260725_albums_invite_code_normalized_uidx
on public.albums (
  upper(replace(trim(invite_code), '-', ''))
);

-- --------------------------------------------------------------------------
-- 1.2 Feature tables
-- CREATE TABLE IF NOT EXISTS leaves an existing compatible table and its data
-- untouched. Compatibility is asserted before any functions are installed.
-- --------------------------------------------------------------------------

create table if not exists public.album_invitations (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  role public.album_role_v2 not null default 'member',
  status text not null default 'pending',
  invited_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create table if not exists public.album_join_requests (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invitation_id uuid
    references public.album_invitations(id) on delete set null,
  requested_role public.album_role_v2 not null default 'member',
  status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.nearby_invitations (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  invited_user_id uuid not null
    references public.profiles(id) on delete cascade,
  invited_by uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  responded_at timestamptz
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $feature_table_compatibility$
declare
  missing_columns text;
  incompatible_role_type text;
  incompatible_role_oid oid;
begin
  select string_agg(expected.table_name || '.' || expected.column_name, ', ')
    into missing_columns
  from (
    values
      ('album_invitations', 'id'),
      ('album_invitations', 'album_id'),
      ('album_invitations', 'email'),
      ('album_invitations', 'token'),
      ('album_invitations', 'role'),
      ('album_invitations', 'status'),
      ('album_invitations', 'invited_by'),
      ('album_invitations', 'created_at'),
      ('album_invitations', 'expires_at'),
      ('album_join_requests', 'id'),
      ('album_join_requests', 'album_id'),
      ('album_join_requests', 'user_id'),
      ('album_join_requests', 'invitation_id'),
      ('album_join_requests', 'requested_role'),
      ('album_join_requests', 'status'),
      ('album_join_requests', 'reviewed_by'),
      ('album_join_requests', 'created_at'),
      ('album_join_requests', 'reviewed_at'),
      ('nearby_invitations', 'id'),
      ('nearby_invitations', 'album_id'),
      ('nearby_invitations', 'invited_user_id'),
      ('nearby_invitations', 'invited_by'),
      ('nearby_invitations', 'status'),
      ('nearby_invitations', 'created_at'),
      ('nearby_invitations', 'expires_at'),
      ('nearby_invitations', 'responded_at'),
      ('push_subscriptions', 'id'),
      ('push_subscriptions', 'user_id'),
      ('push_subscriptions', 'endpoint'),
      ('push_subscriptions', 'p256dh'),
      ('push_subscriptions', 'auth_key'),
      ('push_subscriptions', 'user_agent'),
      ('push_subscriptions', 'enabled'),
      ('push_subscriptions', 'created_at'),
      ('push_subscriptions', 'updated_at')
  ) as expected(table_name, column_name)
  left join information_schema.columns as actual
    on actual.table_schema = 'public'
    and actual.table_name = expected.table_name
    and actual.column_name = expected.column_name
  where actual.column_name is null;

  if missing_columns is not null then
    raise exception
      'Feature table compatibility failed; missing column(s): %.',
      missing_columns;
  end if;

  select
    format_type(attribute.atttypid, attribute.atttypmod),
    attribute.atttypid
    into incompatible_role_type, incompatible_role_oid
  from pg_attribute as attribute
  where attribute.attrelid = 'public.album_join_requests'::regclass
    and attribute.attname = 'requested_role'
    and not attribute.attisdropped;
  if incompatible_role_oid is distinct from
    to_regtype('public.album_role_v2')::oid then
    raise exception
      'album_join_requests.requested_role must be public.album_role_v2, found %.',
      incompatible_role_type;
  end if;

  select
    format_type(attribute.atttypid, attribute.atttypmod),
    attribute.atttypid
    into incompatible_role_type, incompatible_role_oid
  from pg_attribute as attribute
  where attribute.attrelid = 'public.album_invitations'::regclass
    and attribute.attname = 'role'
    and not attribute.attisdropped;
  if incompatible_role_oid is distinct from
    to_regtype('public.album_role_v2')::oid then
    raise exception
      'album_invitations.role must be public.album_role_v2, found %.',
      incompatible_role_type;
  end if;
end
$feature_table_compatibility$;

do $feature_constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.album_invitations'::regclass
      and conname = 'mapalbum_20260725_album_invitation_role_check'
  ) then
    alter table public.album_invitations
      add constraint mapalbum_20260725_album_invitation_role_check
      check (role <> 'owner'::public.album_role_v2)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.album_invitations'::regclass
      and conname = 'mapalbum_20260725_album_invitation_status_check'
  ) then
    alter table public.album_invitations
      add constraint mapalbum_20260725_album_invitation_status_check
      check (status in ('pending', 'accepted', 'rejected', 'revoked'))
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.album_join_requests'::regclass
      and conname = 'mapalbum_20260725_join_request_role_check'
  ) then
    alter table public.album_join_requests
      add constraint mapalbum_20260725_join_request_role_check
      check (requested_role <> 'owner'::public.album_role_v2)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.album_join_requests'::regclass
      and conname = 'mapalbum_20260725_join_request_status_check'
  ) then
    alter table public.album_join_requests
      add constraint mapalbum_20260725_join_request_status_check
      check (status in ('pending', 'approved', 'rejected'))
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.album_join_requests'::regclass
      and conname = 'mapalbum_20260725_join_request_review_check'
  ) then
    alter table public.album_join_requests
      add constraint mapalbum_20260725_join_request_review_check
      check (
        (
          status = 'pending'
          and reviewed_by is null
          and reviewed_at is null
        )
        or
        (
          status <> 'pending'
          and reviewed_by is not null
          and reviewed_at is not null
        )
      )
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nearby_invitations'::regclass
      and conname = 'mapalbum_20260725_nearby_status_check'
  ) then
    alter table public.nearby_invitations
      add constraint mapalbum_20260725_nearby_status_check
      check (status in ('pending', 'accepted', 'declined', 'expired'))
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nearby_invitations'::regclass
      and conname = 'mapalbum_20260725_nearby_users_differ_check'
  ) then
    alter table public.nearby_invitations
      add constraint mapalbum_20260725_nearby_users_differ_check
      check (invited_user_id <> invited_by)
      not valid;
  end if;
end
$feature_constraints$;

do $duplicate_prevention_preflight$
declare
  duplicate_count bigint;
begin
  select count(*)
    into duplicate_count
  from (
    select album_id, user_id
    from public.album_join_requests
    where status = 'pending'
    group by album_id, user_id
    having count(*) > 1
  ) as duplicate_pending_join_requests;
  if duplicate_count > 0 then
    raise exception
      'Cannot add pending join request uniqueness: % duplicate group(s) exist. Transaction will roll back.',
      duplicate_count;
  end if;

  select count(*)
    into duplicate_count
  from (
    select album_id, invited_user_id
    from public.nearby_invitations
    where status = 'pending'
    group by album_id, invited_user_id
    having count(*) > 1
  ) as duplicate_pending_nearby_invitations;
  if duplicate_count > 0 then
    raise exception
      'Cannot add nearby invitation uniqueness: % duplicate group(s) exist. Transaction will roll back.',
      duplicate_count;
  end if;

  select count(*)
    into duplicate_count
  from (
    select endpoint
    from public.push_subscriptions
    group by endpoint
    having count(*) > 1
  ) as duplicate_push_endpoints;
  if duplicate_count > 0 then
    raise exception
      'Cannot add Push endpoint uniqueness: % duplicate group(s) exist. Transaction will roll back.',
      duplicate_count;
  end if;
end
$duplicate_prevention_preflight$;

create index if not exists mapalbum_20260725_join_requests_album_status_idx
  on public.album_join_requests(album_id, status, created_at);
create unique index if not exists
  mapalbum_20260725_join_requests_one_pending_user_uidx
  on public.album_join_requests(album_id, user_id)
  where status = 'pending';

create index if not exists mapalbum_20260725_nearby_target_status_idx
  on public.nearby_invitations(
    invited_user_id,
    status,
    expires_at desc
  );
create unique index if not exists
  mapalbum_20260725_nearby_one_pending_target_uidx
  on public.nearby_invitations(album_id, invited_user_id)
  where status = 'pending';

create unique index if not exists
  mapalbum_20260725_push_endpoint_uidx
  on public.push_subscriptions(endpoint);
create index if not exists mapalbum_20260725_push_user_enabled_idx
  on public.push_subscriptions(user_id, enabled);

-- --------------------------------------------------------------------------
-- 1.3 Authorization helpers
-- These helpers use role::text and created_by. Existing roles are read only.
-- --------------------------------------------------------------------------

create or replace function public.mapalbum_20260725_is_album_manager(
  target_album_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.albums as album
        where album.id = target_album_id
          and (
            album.created_by = auth.uid()
            or album.owner_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.album_members as member
        where member.album_id = target_album_id
          and member.user_id = auth.uid()
          and member.role::text in ('owner', 'admin')
      )
    );
$function$;

create or replace function public.mapalbum_20260725_can_invite_album(
  target_album_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    public.mapalbum_20260725_is_album_manager(target_album_id)
    or exists (
      select 1
      from public.albums as album
      join public.album_members as member
        on member.album_id = album.id
      where album.id = target_album_id
        and member.user_id = auth.uid()
        and member.role::text = 'member'
        and coalesce(album.members_can_invite, false)
    ),
    false
  );
$function$;

-- Keep the public RPC name used by the PWA.
create or replace function public.can_invite_album(target_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.mapalbum_20260725_can_invite_album(target_album_id);
$function$;

-- --------------------------------------------------------------------------
-- 1.4 Per-album invite RPCs
-- --------------------------------------------------------------------------

create or replace function public.get_album_invite_settings(p_album_id uuid)
returns table (
  invite_code text,
  invite_code_enabled boolean,
  invite_code_expires_at timestamptz,
  members_can_invite boolean,
  can_manage boolean,
  can_invite boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if not public.mapalbum_20260725_can_invite_album(p_album_id) then
    raise exception '招待情報を表示する権限がありません';
  end if;

  return query
  select
    album.invite_code,
    coalesce(album.invite_code_enabled, true),
    coalesce(
      album.invite_code_expires_at,
      now() + interval '30 days'
    ),
    coalesce(album.members_can_invite, false),
    public.mapalbum_20260725_is_album_manager(album.id),
    public.mapalbum_20260725_can_invite_album(album.id)
  from public.albums as album
  where album.id = p_album_id;
end
$function$;

create or replace function public.get_album_invite_code(p_album_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if not public.mapalbum_20260725_can_invite_album(p_album_id) then
    raise exception '招待情報を表示する権限がありません';
  end if;

  select album.invite_code
    into result
  from public.albums as album
  where album.id = p_album_id
    and coalesce(album.invite_code_enabled, true)
    and (
      album.invite_code_expires_at is null
      or album.invite_code_expires_at > now()
    );

  if result is null then
    raise exception '招待コードが無効か、有効期限が切れています';
  end if;
  return result;
end
$function$;

create or replace function public.rotate_album_invite_code(
  p_album_id uuid,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  next_code text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if not public.mapalbum_20260725_is_album_manager(p_album_id) then
    raise exception '招待コードを再発行する権限がありません';
  end if;
  if p_expires_at is null
    or p_expires_at <= now() + interval '1 hour'
    or p_expires_at > now() + interval '1 year' then
    raise exception '有効期限は1時間後から1年後までで設定してください';
  end if;

  loop
    next_code := upper(substr(encode(gen_random_bytes(16), 'hex'), 1, 16));
    exit when not exists (
      select 1
      from public.albums as album
      where upper(replace(trim(album.invite_code), '-', '')) = next_code
    );
  end loop;

  update public.albums
  set
    invite_code = next_code,
    invite_code_enabled = true,
    invite_code_expires_at = p_expires_at
  where id = p_album_id;

  if not found then
    raise exception 'アルバムが見つかりません';
  end if;
  return next_code;
end
$function$;

create or replace function public.update_album_invite_settings(
  p_album_id uuid,
  p_members_can_invite boolean,
  p_invite_code_enabled boolean,
  p_invite_code_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if not public.mapalbum_20260725_is_album_manager(p_album_id) then
    raise exception '招待設定を変更する権限がありません';
  end if;
  if coalesce(p_invite_code_enabled, false)
    and (
      p_invite_code_expires_at is null
      or p_invite_code_expires_at <= now() + interval '1 hour'
      or p_invite_code_expires_at > now() + interval '1 year'
    ) then
    raise exception '有効期限は1時間後から1年後までで設定してください';
  end if;

  update public.albums
  set
    members_can_invite = coalesce(p_members_can_invite, false),
    invite_code_enabled = coalesce(p_invite_code_enabled, false),
    invite_code_expires_at = p_invite_code_expires_at
  where id = p_album_id;

  if not found then
    raise exception 'アルバムが見つかりません';
  end if;
end
$function$;

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
as $function$
declare
  normalized_email text := lower(trim(p_email));
  granted_role public.album_role_v2;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if not public.mapalbum_20260725_can_invite_album(p_album_id) then
    raise exception '招待を作成する権限がありません';
  end if;
  if normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception '正しいメールアドレスを入力してください';
  end if;
  if p_role is null or p_role = 'owner'::public.album_role_v2 then
    raise exception 'オーナー権限は招待に指定できません';
  end if;

  granted_role := case
    when public.mapalbum_20260725_is_album_manager(p_album_id) then p_role
    else 'member'::public.album_role_v2
  end;

  if exists (
    select 1
    from public.album_members as member
    join auth.users as invited_user
      on invited_user.id = member.user_id
    where member.album_id = p_album_id
      and lower(invited_user.email) = normalized_email
  ) then
    raise exception 'このメールアドレスはすでに参加しています';
  end if;

  update public.album_invitations
  set status = 'revoked'
  where album_invitations.album_id = p_album_id
    and album_invitations.email = normalized_email
    and album_invitations.status = 'pending';

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
    granted_role,
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
end
$function$;

-- --------------------------------------------------------------------------
-- 1.5 Join request and approval RPCs
-- --------------------------------------------------------------------------

create or replace function public.request_album_membership(
  p_invite_code text default null,
  p_invite_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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
    select
      invitation.album_id,
      invitation.id,
      invitation.role,
      invitation.email
    into
      target_album_id,
      target_invitation_id,
      target_role,
      target_email
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
  elsif nullif(trim(p_invite_code), '') is not null then
    select album.id
      into target_album_id
    from public.albums as album
    where upper(replace(trim(album.invite_code), '-', '')) =
          upper(replace(trim(p_invite_code), '-', ''))
      and coalesce(album.invite_code_enabled, true)
      and (
        album.invite_code_expires_at is null
        or album.invite_code_expires_at > now()
      )
    limit 1;

    if target_album_id is null then
      raise exception '招待コードが無効か、有効期限が切れています';
    end if;
  else
    raise exception '招待コードまたは招待URLが必要です';
  end if;

  if not coalesce(current_email_is_verified, false) then
    raise exception 'メールアドレスの確認を完了してください';
  end if;

  perform 1
  from public.albums
  where id = target_album_id
  for update;
  if not found then
    raise exception 'アルバムが見つかりません';
  end if;

  if target_invitation_id is not null and not exists (
    select 1
    from public.album_invitations
    where id = target_invitation_id
      and album_id = target_album_id
      and status = 'pending'
      and expires_at > now()
      and lower(email) = current_email
  ) then
    raise exception '招待URLが無効か、有効期限が切れています';
  end if;

  if exists (
    select 1
    from public.album_members
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
  for update;

  if existing_request_id is not null then
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
end
$function$;

create or replace function public.review_album_join_request(
  p_request_id uuid,
  p_approve boolean,
  p_role public.album_role_v2 default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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
  if not public.mapalbum_20260725_is_album_manager(
    target_request.album_id
  ) then
    raise exception '参加申請を処理する権限がありません';
  end if;

  approved_role := coalesce(p_role, target_request.requested_role);
  if approved_role is null
    or approved_role = 'owner'::public.album_role_v2 then
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

    insert into public.album_members (
      album_id,
      user_id,
      role
    )
    values (
      target_request.album_id,
      target_request.user_id,
      approved_role
    )
    on conflict (album_id, user_id) do nothing;
  end if;

  update public.album_join_requests
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = target_request.id
    and status = 'pending';

  if not found then
    raise exception 'この参加申請はすでに処理されています';
  end if;

  if target_request.invitation_id is not null then
    update public.album_invitations
    set status = case when p_approve then 'accepted' else 'rejected' end
    where id = target_request.invitation_id
      and status = 'pending';
  end if;

  return target_request.album_id;
end
$function$;

-- --------------------------------------------------------------------------
-- 1.6 Nearby users
-- Coordinates are never written by these functions. Rounded coordinates and
-- timestamps exist only in the private Realtime Presence channel.
-- --------------------------------------------------------------------------

create or replace function public.get_nearby_profiles(p_user_ids uuid[])
returns table (
  id uuid,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if coalesce(cardinality(p_user_ids), 0) > 50 then
    raise exception '一度に確認できるユーザー数を超えています';
  end if;

  return query
  select profile.id, profile.display_name
  from public.profiles as profile
  where profile.id = any(coalesce(p_user_ids, array[]::uuid[]))
    and profile.id <> auth.uid();
end
$function$;

create or replace function public.create_nearby_invitation(
  p_album_id uuid,
  p_invited_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if p_invited_user_id is null or p_invited_user_id = auth.uid() then
    raise exception '招待するユーザーを確認できません';
  end if;
  if not public.mapalbum_20260725_can_invite_album(p_album_id) then
    raise exception 'このアルバムへ招待する権限がありません';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = p_invited_user_id
  ) then
    raise exception '招待するユーザーが見つかりません';
  end if;
  if exists (
    select 1
    from public.album_members
    where album_id = p_album_id
      and user_id = p_invited_user_id
  ) then
    raise exception 'このユーザーはすでにアルバムへ参加しています';
  end if;

  update public.nearby_invitations
  set
    status = 'expired',
    responded_at = now()
  where album_id = p_album_id
    and invited_user_id = p_invited_user_id
    and status = 'pending'
    and expires_at <= now();

  insert into public.nearby_invitations (
    album_id,
    invited_user_id,
    invited_by
  )
  values (
    p_album_id,
    p_invited_user_id,
    auth.uid()
  )
  on conflict (album_id, invited_user_id)
    where status = 'pending'
  do update set
    invited_by = excluded.invited_by,
    created_at = now(),
    expires_at = now() + interval '5 minutes'
  returning id into result_id;

  return result_id;
end
$function$;

create or replace function public.get_my_nearby_invitations()
returns table (
  id uuid,
  album_id uuid,
  album_name text,
  invited_by uuid,
  invited_by_name text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  update public.nearby_invitations
  set
    status = 'expired',
    responded_at = now()
  where invited_user_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  return query
  select
    invitation.id,
    invitation.album_id,
    album.name,
    invitation.invited_by,
    inviter.display_name,
    invitation.created_at,
    invitation.expires_at
  from public.nearby_invitations as invitation
  join public.albums as album
    on album.id = invitation.album_id
  join public.profiles as inviter
    on inviter.id = invitation.invited_by
  where invitation.invited_user_id = auth.uid()
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  order by invitation.created_at desc;
end
$function$;

create or replace function public.respond_nearby_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.nearby_invitations%rowtype;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select *
    into target
  from public.nearby_invitations
  where id = p_invitation_id
    and invited_user_id = auth.uid()
  for update;

  if target.id is null or target.status <> 'pending' then
    raise exception '承認待ちの近距離招待が見つかりません';
  end if;

  if target.expires_at <= now() then
    update public.nearby_invitations
    set
      status = 'expired',
      responded_at = now()
    where id = target.id;
    return null;
  end if;

  if not p_accept then
    update public.nearby_invitations
    set
      status = 'declined',
      responded_at = now()
    where id = target.id;
    return null;
  end if;

  if exists (
    select 1
    from public.album_members
    where album_id = target.album_id
      and user_id = auth.uid()
  ) then
    raise exception 'このアルバムにはすでに参加しています';
  end if;

  select request.id
    into request_id
  from public.album_join_requests as request
  where request.album_id = target.album_id
    and request.user_id = auth.uid()
    and request.status = 'pending'
  for update;

  if request_id is null then
    insert into public.album_join_requests (
      album_id,
      user_id,
      requested_role
    )
    values (
      target.album_id,
      auth.uid(),
      'member'::public.album_role_v2
    )
    returning id into request_id;
  end if;

  update public.nearby_invitations
  set
    status = 'accepted',
    responded_at = now()
  where id = target.id
    and status = 'pending';

  if not found then
    raise exception 'この近距離招待はすでに処理されています';
  end if;
  return request_id;
end
$function$;

-- --------------------------------------------------------------------------
-- 1.7 Push subscription RPCs
-- The "delete" RPC name is retained for PWA compatibility. It disables the
-- current user's subscription instead of physically removing a row.
-- --------------------------------------------------------------------------

create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if length(p_endpoint) < 20
    or length(p_endpoint) > 4000
    or length(p_p256dh) < 20
    or length(p_auth) < 8 then
    raise exception 'Push通知の購読情報が正しくありません';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_key,
    user_agent,
    enabled
  )
  values (
    auth.uid(),
    p_endpoint,
    p_p256dh,
    p_auth,
    left(coalesce(p_user_agent, ''), 500),
    true
  )
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    enabled = true,
    updated_at = now()
  where push_subscriptions.user_id = auth.uid()
  returning id into result_id;

  if result_id is null then
    raise exception 'このPush購読情報は別のユーザーに登録されています';
  end if;
  return result_id;
end
$function$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  update public.push_subscriptions
  set
    enabled = false,
    updated_at = now()
  where user_id = auth.uid()
    and endpoint = p_endpoint;
end
$function$;

-- --------------------------------------------------------------------------
-- 1.8 Function privileges
-- --------------------------------------------------------------------------

revoke all on function
  public.mapalbum_20260725_guard_album_owner()
from public;
revoke all on function
  public.mapalbum_20260725_is_album_manager(uuid)
from public;
revoke all on function
  public.mapalbum_20260725_can_invite_album(uuid)
from public;
revoke all on function public.can_invite_album(uuid) from public;
revoke all on function public.get_album_invite_settings(uuid) from public;
revoke all on function public.get_album_invite_code(uuid) from public;
revoke all on function
  public.rotate_album_invite_code(uuid, timestamptz)
from public;
revoke all on function
  public.update_album_invite_settings(uuid, boolean, boolean, timestamptz)
from public;
revoke all on function
  public.create_album_invitation(uuid, text, public.album_role_v2)
from public;
revoke all on function
  public.request_album_membership(text, uuid)
from public;
revoke all on function
  public.review_album_join_request(uuid, boolean, public.album_role_v2)
from public;
revoke all on function public.get_nearby_profiles(uuid[]) from public;
revoke all on function
  public.create_nearby_invitation(uuid, uuid)
from public;
revoke all on function public.get_my_nearby_invitations() from public;
revoke all on function
  public.respond_nearby_invitation(uuid, boolean)
from public;
revoke all on function
  public.upsert_push_subscription(text, text, text, text)
from public;
revoke all on function public.delete_push_subscription(text) from public;

grant execute on function
  public.mapalbum_20260725_is_album_manager(uuid)
to authenticated;
grant execute on function
  public.mapalbum_20260725_can_invite_album(uuid)
to authenticated;
grant execute on function public.can_invite_album(uuid) to authenticated;
grant execute on function
  public.get_album_invite_settings(uuid)
to authenticated;
grant execute on function public.get_album_invite_code(uuid) to authenticated;
grant execute on function
  public.rotate_album_invite_code(uuid, timestamptz)
to authenticated;
grant execute on function
  public.update_album_invite_settings(uuid, boolean, boolean, timestamptz)
to authenticated;
grant execute on function
  public.create_album_invitation(uuid, text, public.album_role_v2)
to authenticated;
grant execute on function
  public.request_album_membership(text, uuid)
to authenticated;
grant execute on function
  public.review_album_join_request(uuid, boolean, public.album_role_v2)
to authenticated;
grant execute on function public.get_nearby_profiles(uuid[])
to authenticated;
grant execute on function
  public.create_nearby_invitation(uuid, uuid)
to authenticated;
grant execute on function public.get_my_nearby_invitations()
to authenticated;
grant execute on function
  public.respond_nearby_invitation(uuid, boolean)
to authenticated;
grant execute on function
  public.upsert_push_subscription(text, text, text, text)
to authenticated;
grant execute on function public.delete_push_subscription(text)
to authenticated;
grant usage on type public.album_role_v2 to authenticated;

-- --------------------------------------------------------------------------
-- 1.9 RLS and least-privilege table grants
-- Only the feature tables are changed. Existing album/photo/Storage policies
-- are not removed or replaced.
-- --------------------------------------------------------------------------

alter table public.album_invitations enable row level security;
alter table public.album_join_requests enable row level security;
alter table public.nearby_invitations enable row level security;
alter table public.push_subscriptions enable row level security;
alter table realtime.messages enable row level security;

revoke all on table public.album_invitations from anon, authenticated;
revoke all on table public.album_join_requests from anon, authenticated;
revoke all on table public.nearby_invitations from anon, authenticated;
revoke all on table public.push_subscriptions from anon, authenticated;

grant select on table public.album_invitations to authenticated;
grant select on table public.album_join_requests to authenticated;
grant select on table public.nearby_invitations to authenticated;
grant select on table public.push_subscriptions to authenticated;

grant select (owner_id, members_can_invite)
on table public.albums
to authenticated;

do $rls_policies$
begin
  -- Applicant profiles become visible only to the applicant themself or a
  -- manager reviewing that applicant's pending request.
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname =
        'mapalbum_20260725_managers_view_pending_applicant_profiles'
  ) then
    create policy
      mapalbum_20260725_managers_view_pending_applicant_profiles
    on public.profiles
    as permissive
    for select
    to authenticated
    using (
      id = auth.uid()
      or exists (
        select 1
        from public.album_join_requests as request
        where request.user_id = profiles.id
          and request.status = 'pending'
          and public.mapalbum_20260725_is_album_manager(request.album_id)
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'album_invitations'
      and policyname = 'mapalbum_20260725_invitation_select_permissive'
  ) then
    create policy mapalbum_20260725_invitation_select_permissive
    on public.album_invitations
    as permissive
    for select
    to authenticated
    using (
      public.mapalbum_20260725_is_album_manager(album_id)
      or invited_by = auth.uid()
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'album_invitations'
      and policyname = 'mapalbum_20260725_invitation_select_restrictive'
  ) then
    create policy mapalbum_20260725_invitation_select_restrictive
    on public.album_invitations
    as restrictive
    for select
    to authenticated
    using (
      public.mapalbum_20260725_is_album_manager(album_id)
      or invited_by = auth.uid()
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'album_join_requests'
      and policyname = 'mapalbum_20260725_join_request_select_permissive'
  ) then
    create policy mapalbum_20260725_join_request_select_permissive
    on public.album_join_requests
    as permissive
    for select
    to authenticated
    using (
      user_id = auth.uid()
      or public.mapalbum_20260725_is_album_manager(album_id)
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'album_join_requests'
      and policyname = 'mapalbum_20260725_join_request_select_restrictive'
  ) then
    create policy mapalbum_20260725_join_request_select_restrictive
    on public.album_join_requests
    as restrictive
    for select
    to authenticated
    using (
      user_id = auth.uid()
      or public.mapalbum_20260725_is_album_manager(album_id)
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'nearby_invitations'
      and policyname = 'mapalbum_20260725_nearby_select_permissive'
  ) then
    create policy mapalbum_20260725_nearby_select_permissive
    on public.nearby_invitations
    as permissive
    for select
    to authenticated
    using (
      invited_user_id = auth.uid()
      or (
        invited_by = auth.uid()
        and public.mapalbum_20260725_can_invite_album(album_id)
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'nearby_invitations'
      and policyname = 'mapalbum_20260725_nearby_select_restrictive'
  ) then
    create policy mapalbum_20260725_nearby_select_restrictive
    on public.nearby_invitations
    as restrictive
    for select
    to authenticated
    using (
      invited_user_id = auth.uid()
      or (
        invited_by = auth.uid()
        and public.mapalbum_20260725_can_invite_album(album_id)
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'mapalbum_20260725_push_select_permissive'
  ) then
    create policy mapalbum_20260725_push_select_permissive
    on public.push_subscriptions
    as permissive
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'mapalbum_20260725_push_select_restrictive'
  ) then
    create policy mapalbum_20260725_push_select_restrictive
    on public.push_subscriptions
    as restrictive
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;

  -- Realtime private-channel authorization for the single nearby topic.
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'mapalbum_20260725_nearby_presence_receive'
  ) then
    create policy mapalbum_20260725_nearby_presence_receive
    on realtime.messages
    as permissive
    for select
    to authenticated
    using (realtime.topic() = 'nearby-users');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'mapalbum_20260725_nearby_presence_send'
  ) then
    create policy mapalbum_20260725_nearby_presence_send
    on realtime.messages
    as permissive
    for insert
    to authenticated
    with check (realtime.topic() = 'nearby-users');
  end if;
end
$rls_policies$;

-- --------------------------------------------------------------------------
-- 1.10 Realtime publication
-- --------------------------------------------------------------------------

do $realtime_publication$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception
      'supabase_realtime publication is missing. Transaction will roll back.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'album_join_requests'
  ) then
    alter publication supabase_realtime
      add table public.album_join_requests;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'nearby_invitations'
  ) then
    alter publication supabase_realtime
      add table public.nearby_invitations;
  end if;
end
$realtime_publication$;

-- ============================================================================
-- 2. IN-TRANSACTION ASSERTIONS
-- Any failure here rolls back every change above.
-- ============================================================================

do $postflight_assertions$
declare
  missing_function_count integer;
  missing_policy_count integer;
  missing_publication_count integer;
begin
  select count(*)
    into missing_function_count
  from (
    values
      (to_regprocedure('public.get_album_invite_settings(uuid)')),
      (to_regprocedure('public.get_album_invite_code(uuid)')),
      (
        to_regprocedure(
          'public.rotate_album_invite_code(uuid,timestamp with time zone)'
        )
      ),
      (
        to_regprocedure(
          'public.update_album_invite_settings(uuid,boolean,boolean,timestamp with time zone)'
        )
      ),
      (
        to_regprocedure(
          'public.create_album_invitation(uuid,text,public.album_role_v2)'
        )
      ),
      (to_regprocedure('public.request_album_membership(text,uuid)')),
      (
        to_regprocedure(
          'public.review_album_join_request(uuid,boolean,public.album_role_v2)'
        )
      ),
      (to_regprocedure('public.get_nearby_profiles(uuid[])')),
      (to_regprocedure('public.create_nearby_invitation(uuid,uuid)')),
      (to_regprocedure('public.get_my_nearby_invitations()')),
      (to_regprocedure('public.respond_nearby_invitation(uuid,boolean)')),
      (
        to_regprocedure(
          'public.upsert_push_subscription(text,text,text,text)'
        )
      ),
      (to_regprocedure('public.delete_push_subscription(text)'))
  ) as expected(function_oid)
  where expected.function_oid is null;

  if missing_function_count <> 0 then
    raise exception
      'Postflight failed: % required function(s) are missing.',
      missing_function_count;
  end if;

  select count(*)
    into missing_policy_count
  from (
    values
      ('public', 'album_join_requests',
        'mapalbum_20260725_join_request_select_permissive'),
      ('public', 'album_join_requests',
        'mapalbum_20260725_join_request_select_restrictive'),
      ('public', 'nearby_invitations',
        'mapalbum_20260725_nearby_select_permissive'),
      ('public', 'nearby_invitations',
        'mapalbum_20260725_nearby_select_restrictive'),
      ('public', 'push_subscriptions',
        'mapalbum_20260725_push_select_permissive'),
      ('public', 'push_subscriptions',
        'mapalbum_20260725_push_select_restrictive'),
      ('realtime', 'messages',
        'mapalbum_20260725_nearby_presence_receive'),
      ('realtime', 'messages',
        'mapalbum_20260725_nearby_presence_send')
  ) as expected(schemaname, tablename, policyname)
  left join pg_policies as actual
    on actual.schemaname = expected.schemaname
    and actual.tablename = expected.tablename
    and actual.policyname = expected.policyname
  where actual.policyname is null;

  if missing_policy_count <> 0 then
    raise exception
      'Postflight failed: % required RLS policy/policies are missing.',
      missing_policy_count;
  end if;

  select count(*)
    into missing_publication_count
  from (
    values
      ('album_join_requests'),
      ('nearby_invitations')
  ) as expected(tablename)
  left join pg_publication_tables as actual
    on actual.pubname = 'supabase_realtime'
    and actual.schemaname = 'public'
    and actual.tablename = expected.tablename
  where actual.tablename is null;

  if missing_publication_count <> 0 then
    raise exception
      'Postflight failed: % required Realtime table(s) are missing.',
      missing_publication_count;
  end if;
end
$postflight_assertions$;

commit;

-- ============================================================================
-- 3. AFTER: read-only verification report
-- ============================================================================

select
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'albums',
    'album_invitations',
    'album_join_requests',
    'nearby_invitations',
    'push_subscriptions'
  )
  and (
    table_name <> 'albums'
    or column_name in (
      'owner_id',
      'members_can_invite',
      'invite_code_enabled',
      'invite_code_expires_at'
    )
  )
order by table_name, ordinal_position;

select
  namespace.nspname as function_schema,
  procedure.proname as function_name,
  pg_get_function_identity_arguments(procedure.oid) as arguments,
  procedure.prosecdef as security_definer
from pg_proc as procedure
join pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'can_invite_album',
    'get_album_invite_settings',
    'get_album_invite_code',
    'rotate_album_invite_code',
    'update_album_invite_settings',
    'create_album_invitation',
    'request_album_membership',
    'review_album_join_request',
    'get_nearby_profiles',
    'create_nearby_invitation',
    'get_my_nearby_invitations',
    'respond_nearby_invitation',
    'upsert_push_subscription',
    'delete_push_subscription'
  )
order by procedure.proname,
  pg_get_function_identity_arguments(procedure.oid);

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where policyname like 'mapalbum_20260725_%'
order by schemaname, tablename, policyname;

select
  pubname,
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'album_join_requests',
    'nearby_invitations'
  )
order by tablename;

select
  'SAFE_INVITE_NOTIFICATIONS_MIGRATION_READY' as result,
  now() as completed_at;
