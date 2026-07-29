begin;

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

  if new.owner_id is distinct from old.owner_id
    and current_user not in ('postgres', 'supabase_admin')
  then
    raise exception '既存アルバムのowner_idは変更できません';
  end if;
  return new;
end
$function$;

create or replace function public.prepare_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  owned_album record;
  successor_id uuid;
begin
  if p_user_id is null
    or not exists (select 1 from auth.users where id = p_user_id)
  then
    raise exception '削除対象のアカウントを確認できません';
  end if;

  for owned_album in
    select album.id
    from public.albums as album
    where album.owner_id = p_user_id
  loop
    select candidate.user_id
      into successor_id
    from (
      select member.user_id, 0 as priority, member.joined_at as joined_at
      from public.album_members as member
      where member.album_id = owned_album.id
        and member.user_id <> p_user_id
      union all
      select photo.author_id, 1 as priority, min(photo.created_at) as joined_at
      from public.photos as photo
      where photo.album_id = owned_album.id
        and photo.author_id <> p_user_id
      group by photo.author_id
    ) as candidate
    order by candidate.priority, candidate.joined_at
    limit 1;

    if successor_id is null then
      delete from public.albums where id = owned_album.id;
    else
      update public.albums
      set owner_id = successor_id,
          created_by = successor_id
      where id = owned_album.id;

      insert into public.album_members (album_id, user_id, role)
      values (owned_album.id, successor_id, 'owner')
      on conflict (album_id, user_id)
      do update set role = excluded.role;
    end if;
  end loop;

  delete from public.photos where author_id = p_user_id;
  delete from public.album_invitations where invited_by = p_user_id;
  delete from public.nearby_invitations
  where invited_user_id = p_user_id or invited_by = p_user_id;
  update public.album_join_requests
  set status = 'pending',
      reviewed_by = null,
      reviewed_at = null
  where reviewed_by = p_user_id;
  delete from public.album_join_requests where user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.drive_logs where user_id = p_user_id;
  delete from public.album_members where user_id = p_user_id;
end
$function$;

revoke all on function public.prepare_account_deletion(uuid) from public;
revoke all on function public.prepare_account_deletion(uuid) from anon;
revoke all on function public.prepare_account_deletion(uuid) from authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

commit;
