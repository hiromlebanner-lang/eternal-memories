begin;

create or replace function public.remove_album_member(
  p_album_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_role public.album_role_v2;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  perform 1
  from public.albums as album
  where album.id = p_album_id
    and album.created_by = auth.uid()
  for update;

  if not found then
    raise exception '参加者を退出させる権限がありません';
  end if;

  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'オーナー本人は退出させられません';
  end if;

  select member.role
  into target_role
  from public.album_members as member
  where member.album_id = p_album_id
    and member.user_id = p_user_id
  for update;

  if target_role is null then
    raise exception '対象の参加者が見つかりません';
  end if;

  if target_role = 'owner' then
    raise exception 'オーナーは退出させられません';
  end if;

  delete from public.album_members
  where album_id = p_album_id
    and user_id = p_user_id
    and role <> 'owner';
end
$function$;

revoke all on function public.remove_album_member(uuid, uuid) from public;
revoke all on function public.remove_album_member(uuid, uuid) from anon;
grant execute on function public.remove_album_member(uuid, uuid)
to authenticated;

commit;
