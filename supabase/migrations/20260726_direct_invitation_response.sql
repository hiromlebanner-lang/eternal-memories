begin;

create table if not exists public.nearby_invitations (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  responded_at timestamptz
);

create unique index if not exists
  nearby_invitations_one_pending_per_user_album
on public.nearby_invitations(album_id, invited_user_id)
where status = 'pending';

alter table public.nearby_invitations enable row level security;
revoke all on table public.nearby_invitations from anon, authenticated;

create or replace function public.get_my_direct_album_invitations()
returns table (
  id uuid,
  album_id uuid,
  email text,
  token uuid,
  role public.album_role_v2,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  album_name text,
  invited_by uuid,
  invited_by_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    invitation.id,
    invitation.album_id,
    invitation.email,
    invitation.token,
    invitation.role,
    invitation.status,
    invitation.created_at,
    invitation.expires_at,
    album.name,
    invitation.invited_by,
    inviter.display_name
  from public.album_invitations as invitation
  join public.albums as album on album.id = invitation.album_id
  join public.profiles as inviter on inviter.id = invitation.invited_by
  where auth.uid() is not null
    and lower(invitation.email) =
      lower(coalesce(auth.jwt() ->> 'email', ''))
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  order by invitation.created_at desc;
$function$;

create or replace function public.respond_to_album_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.album_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select invitation.*
  into target
  from public.album_invitations as invitation
  where invitation.id = p_invitation_id
    and lower(invitation.email) =
      lower(coalesce(auth.jwt() ->> 'email', ''))
  for update;

  if target.id is null or target.status <> 'pending' then
    raise exception '承認待ちの招待が見つかりません';
  end if;
  if target.expires_at <= now() then
    raise exception '招待の有効期限が切れています';
  end if;

  if not p_accept then
    update public.album_invitations
    set status = 'rejected'
    where id = target.id and status = 'pending';
    return null;
  end if;

  if target.role = 'owner'::public.album_role_v2 then
    raise exception 'オーナー権限は招待で付与できません';
  end if;

  insert into public.album_members (album_id, user_id, role)
  values (target.album_id, auth.uid(), target.role)
  on conflict (album_id, user_id) do nothing;

  update public.album_invitations
  set status = 'accepted'
  where id = target.id and status = 'pending';

  if not found then
    raise exception 'この招待はすでに処理されています';
  end if;
  return target.album_id;
end
$function$;

create or replace function public.get_album_direct_invitations(
  p_album_id uuid
)
returns table (
  id uuid,
  album_id uuid,
  email text,
  token uuid,
  role public.album_role_v2,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  invited_user_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.mapalbum_20260725_is_album_manager(p_album_id) then
    raise exception '招待一覧を表示する権限がありません';
  end if;

  return query
  select
    invitation.id,
    invitation.album_id,
    invitation.email,
    invitation.token,
    invitation.role,
    invitation.status,
    invitation.created_at,
    invitation.expires_at,
    profile.display_name
  from public.album_invitations as invitation
  left join auth.users as invited_user
    on lower(invited_user.email) = lower(invitation.email)
  left join public.profiles as profile on profile.id = invited_user.id
  where invitation.album_id = p_album_id
  order by invitation.created_at desc;
end
$function$;

create or replace function public.revoke_album_invitation(
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.album_invitations%rowtype;
begin
  select invitation.*
  into target
  from public.album_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if target.id is null
    or not public.mapalbum_20260725_is_album_manager(target.album_id) then
    raise exception '招待を取り消す権限がありません';
  end if;
  if target.status <> 'pending' then
    raise exception '承認待ちの招待だけ取り消せます';
  end if;

  update public.album_invitations
  set status = 'revoked'
  where id = target.id and status = 'pending';
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
    select 1 from public.profiles where id = p_invited_user_id
  ) then
    raise exception '招待するユーザーが見つかりません';
  end if;
  if exists (
    select 1
    from public.album_members
    where album_id = p_album_id and user_id = p_invited_user_id
  ) then
    raise exception 'このユーザーはすでにアルバムへ参加しています';
  end if;

  update public.nearby_invitations
  set status = 'expired', responded_at = now()
  where album_id = p_album_id
    and invited_user_id = p_invited_user_id
    and status = 'pending'
    and expires_at <= now();

  insert into public.nearby_invitations (
    album_id,
    invited_user_id,
    invited_by
  )
  values (p_album_id, p_invited_user_id, auth.uid())
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
  set status = 'expired', responded_at = now()
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
  join public.albums as album on album.id = invitation.album_id
  join public.profiles as inviter on inviter.id = invitation.invited_by
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
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  select invitation.*
  into target
  from public.nearby_invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.invited_user_id = auth.uid()
  for update;

  if target.id is null or target.status <> 'pending' then
    raise exception '承認待ちの招待が見つかりません';
  end if;
  if target.expires_at <= now() then
    update public.nearby_invitations
    set status = 'expired', responded_at = now()
    where id = target.id;
    raise exception '招待の有効期限が切れています';
  end if;

  if not p_accept then
    update public.nearby_invitations
    set status = 'declined', responded_at = now()
    where id = target.id and status = 'pending';
    return null;
  end if;

  insert into public.album_members (album_id, user_id, role)
  values (
    target.album_id,
    auth.uid(),
    'member'::public.album_role_v2
  )
  on conflict (album_id, user_id) do nothing;

  update public.nearby_invitations
  set status = 'accepted', responded_at = now()
  where id = target.id and status = 'pending';

  if not found then
    raise exception 'この招待はすでに処理されています';
  end if;
  return target.album_id;
end
$function$;

revoke all on function
  public.get_my_direct_album_invitations()
from public;
revoke all on function
  public.respond_to_album_invitation(uuid, boolean)
from public;
revoke all on function
  public.get_album_direct_invitations(uuid)
from public;
revoke all on function
  public.revoke_album_invitation(uuid)
from public;
revoke all on function
  public.create_nearby_invitation(uuid, uuid)
from public;
revoke all on function
  public.get_my_nearby_invitations()
from public;
revoke all on function
  public.respond_nearby_invitation(uuid, boolean)
from public;

grant execute on function
  public.get_my_direct_album_invitations()
to authenticated;
grant execute on function
  public.respond_to_album_invitation(uuid, boolean)
to authenticated;
grant execute on function
  public.get_album_direct_invitations(uuid)
to authenticated;
grant execute on function
  public.revoke_album_invitation(uuid)
to authenticated;
grant execute on function
  public.create_nearby_invitation(uuid, uuid)
to authenticated;
grant execute on function
  public.get_my_nearby_invitations()
to authenticated;
grant execute on function
  public.respond_nearby_invitation(uuid, boolean)
to authenticated;

commit;
