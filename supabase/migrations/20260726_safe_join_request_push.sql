-- MapAlbum: additive migration for join-request notifications only.
-- This migration does not remove or rewrite albums, photos, users, members,
-- join requests, Storage objects, or existing RLS policies.

begin;

-- Fail before changing anything when the sharing foundation is not installed.
do $preflight$
begin
  if to_regclass('public.album_join_requests') is null then
    raise exception
      'public.album_join_requests is missing. Install the safe invite migration first.';
  end if;
  if to_regclass('public.albums') is null
    or to_regclass('public.album_members') is null
    or to_regclass('public.profiles') is null
  then
    raise exception
      'Required MapAlbum sharing tables are missing. Transaction rolled back.';
  end if;
end
$preflight$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists endpoint text,
  add column if not exists p256dh text,
  add column if not exists auth_key text,
  add column if not exists user_agent text default '',
  add column if not exists enabled boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Existing rows are never modified. Roll back if they prevent safe uniqueness.
do $push_preflight$
declare
  duplicate_endpoints bigint;
  null_required_values bigint;
begin
  select count(*)
  into duplicate_endpoints
  from (
    select endpoint
    from public.push_subscriptions
    where endpoint is not null
    group by endpoint
    having count(*) > 1
  ) as duplicates;

  if duplicate_endpoints > 0 then
    raise exception
      'Cannot add Push endpoint uniqueness: % duplicate endpoint(s) exist.',
      duplicate_endpoints;
  end if;

  select count(*)
  into null_required_values
  from public.push_subscriptions
  where id is null
    or user_id is null
    or endpoint is null
    or p256dh is null
    or auth_key is null;

  if null_required_values > 0 then
    raise exception
      'Cannot secure push_subscriptions: % incomplete existing row(s) exist.',
      null_required_values;
  end if;
end
$push_preflight$;

create unique index if not exists
  mapalbum_20260726_push_subscriptions_endpoint_uidx
on public.push_subscriptions(endpoint);

create index if not exists
  mapalbum_20260726_push_subscriptions_user_enabled_idx
on public.push_subscriptions(user_id, enabled);

create table if not exists public.join_request_push_deliveries (
  request_id uuid not null references public.album_join_requests(id),
  subscription_id uuid not null references public.push_subscriptions(id),
  status text not null default 'processing',
  attempt_count integer not null default 1,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (request_id, subscription_id)
);

alter table public.join_request_push_deliveries
  add column if not exists request_id uuid,
  add column if not exists subscription_id uuid,
  add column if not exists status text default 'processing',
  add column if not exists attempt_count integer default 1,
  add column if not exists last_error text default '',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists delivered_at timestamptz;

create unique index if not exists
  mapalbum_20260726_push_delivery_request_subscription_uidx
on public.join_request_push_deliveries(request_id, subscription_id);

do $delivery_constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.join_request_push_deliveries'::regclass
      and conname = 'mapalbum_20260726_push_delivery_status_check'
  ) then
    alter table public.join_request_push_deliveries
      add constraint mapalbum_20260726_push_delivery_status_check
      check (status in ('processing', 'delivered', 'failed', 'invalid'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.join_request_push_deliveries'::regclass
      and conname = 'mapalbum_20260726_push_delivery_attempt_check'
  ) then
    alter table public.join_request_push_deliveries
      add constraint mapalbum_20260726_push_delivery_attempt_check
      check (attempt_count > 0);
  end if;
end
$delivery_constraints$;

create or replace function public.mapalbum_20260726_is_album_manager(
  p_album_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and (
      exists (
        select 1
        from public.albums as album
        where album.id = p_album_id
          and album.created_by = auth.uid()
      )
      or exists (
        select 1
        from public.album_members as member
        where member.album_id = p_album_id
          and member.user_id = auth.uid()
          and member.role::text in ('owner', 'admin')
      )
    );
$function$;

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
    or length(p_auth) < 8
  then
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

create or replace function public.claim_join_request_push_delivery(
  p_request_id uuid,
  p_subscription_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_rows integer;
begin
  insert into public.join_request_push_deliveries (
    request_id,
    subscription_id
  )
  values (
    p_request_id,
    p_subscription_id
  )
  on conflict (request_id, subscription_id) do nothing;

  get diagnostics affected_rows = row_count;
  if affected_rows = 1 then
    return true;
  end if;

  update public.join_request_push_deliveries
  set
    status = 'processing',
    attempt_count = attempt_count + 1,
    last_error = '',
    updated_at = now()
  where request_id = p_request_id
    and subscription_id = p_subscription_id
    and (
      status = 'failed'
      or (
        status = 'processing'
        and updated_at < now() - interval '10 minutes'
      )
    );

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end
$function$;

create or replace function public.finish_join_request_push_delivery(
  p_request_id uuid,
  p_subscription_id uuid,
  p_status text,
  p_error text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_status not in ('delivered', 'failed', 'invalid') then
    raise exception 'Invalid Push delivery status';
  end if;

  update public.join_request_push_deliveries
  set
    status = p_status,
    last_error = left(coalesce(p_error, ''), 500),
    updated_at = now(),
    delivered_at = case
      when p_status = 'delivered' then now()
      else delivered_at
    end
  where request_id = p_request_id
    and subscription_id = p_subscription_id;
end
$function$;

revoke all on function
  public.mapalbum_20260726_is_album_manager(uuid)
from public, anon;
grant execute on function
  public.mapalbum_20260726_is_album_manager(uuid)
to authenticated;

revoke all on function
  public.upsert_push_subscription(text, text, text, text)
from public, anon;
revoke all on function
  public.delete_push_subscription(text)
from public, anon;
grant execute on function
  public.upsert_push_subscription(text, text, text, text)
to authenticated;
grant execute on function
  public.delete_push_subscription(text)
to authenticated;

revoke all on function
  public.claim_join_request_push_delivery(uuid, uuid)
from public, anon, authenticated;
revoke all on function
  public.finish_join_request_push_delivery(uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function
  public.claim_join_request_push_delivery(uuid, uuid)
to service_role;
grant execute on function
  public.finish_join_request_push_delivery(uuid, uuid, text, text)
to service_role;

alter table public.push_subscriptions enable row level security;
alter table public.join_request_push_deliveries enable row level security;
alter table public.album_join_requests enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.join_request_push_deliveries
from anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
grant select on table public.album_join_requests to authenticated;

do $notification_policies$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'mapalbum_20260726_users_view_own_push_subscriptions'
  ) then
    create policy mapalbum_20260726_users_view_own_push_subscriptions
    on public.push_subscriptions
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'album_join_requests'
      and policyname = 'mapalbum_20260726_join_request_notification_select'
  ) then
    create policy mapalbum_20260726_join_request_notification_select
    on public.album_join_requests
    for select
    to authenticated
    using (
      user_id = auth.uid()
      or public.mapalbum_20260726_is_album_manager(album_id)
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname =
        'mapalbum_20260726_managers_view_join_request_applicants'
  ) then
    create policy mapalbum_20260726_managers_view_join_request_applicants
    on public.profiles
    for select
    to authenticated
    using (
      id = auth.uid()
      or exists (
        select 1
        from public.album_join_requests as request
        where request.user_id = profiles.id
          and request.status = 'pending'
          and public.mapalbum_20260726_is_album_manager(request.album_id)
      )
    );
  end if;
end
$notification_policies$;

do $realtime_publication$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception
      'supabase_realtime publication is missing. Transaction rolled back.';
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
end
$realtime_publication$;

-- Verify only objects created or required by this notification migration.
do $postflight$
begin
  if to_regclass('public.push_subscriptions') is null
    or to_regclass('public.join_request_push_deliveries') is null
  then
    raise exception
      'Join-request Push tables were not created. Transaction rolled back.';
  end if;
  if to_regprocedure(
    'public.upsert_push_subscription(text,text,text,text)'
  ) is null
    or to_regprocedure(
      'public.claim_join_request_push_delivery(uuid,uuid)'
    ) is null
  then
    raise exception
      'Join-request Push RPCs were not created. Transaction rolled back.';
  end if;
end
$postflight$;

commit;

-- External configuration intentionally remains outside this transaction:
-- 1. Deploy the send-join-request-push Edge Function.
-- 2. Set VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
--    JOIN_REQUEST_WEBHOOK_SECRET and APP_ORIGIN as Edge Function secrets.
-- 3. Create an INSERT-only Database Webhook for public.album_join_requests
--    with the same x-mapalbum-webhook-secret header.
