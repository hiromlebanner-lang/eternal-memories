begin;

create or replace function public.get_album_invite_preview(
  p_invite_code text
)
returns table (
  album_id uuid,
  album_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select album.id, album.name
  from public.albums as album
  where auth.uid() is not null
    and upper(album.invite_code) = upper(trim(p_invite_code))
  limit 1;
$function$;

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
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;
  if p_invite_token is not null then
    raise exception 'メール招待は専用の参加画面から回答してください';
  end if;

  select album.id
  into target_album_id
  from public.albums as album
  where upper(album.invite_code) = upper(trim(p_invite_code))
  for update;

  if target_album_id is null then
    raise exception '招待コードが無効か、有効期限が切れています';
  end if;

  insert into public.album_members (album_id, user_id, role)
  values (
    target_album_id,
    auth.uid(),
    'member'::public.album_role_v2
  )
  on conflict (album_id, user_id) do nothing;

  return target_album_id;
end
$function$;

-- Users who already chose to join before this migration no longer require
-- an owner approval.
insert into public.album_members (album_id, user_id, role)
select
  request.album_id,
  request.user_id,
  'member'::public.album_role_v2
from public.album_join_requests as request
where request.status = 'pending'
on conflict (album_id, user_id) do nothing;

revoke all on function public.get_album_invite_preview(text) from public;
revoke all on function
  public.request_album_membership(text, uuid)
from public;

grant execute on function public.get_album_invite_preview(text)
to authenticated;
grant execute on function
  public.request_album_membership(text, uuid)
to authenticated;

commit;
