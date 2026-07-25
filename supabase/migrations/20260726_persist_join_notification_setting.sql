begin;

alter table public.profiles
  add column if not exists
  join_request_notifications_enabled boolean not null default false;

create or replace function public.get_join_request_notifications_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select profile.join_request_notifications_enabled
      from public.profiles as profile
      where profile.id = auth.uid()
    ),
    false
  );
$function$;

create or replace function public.set_join_request_notifications_enabled(
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です';
  end if;

  update public.profiles
  set join_request_notifications_enabled = p_enabled
  where id = auth.uid();

  if not found then
    raise exception 'プロフィールが見つかりません';
  end if;

  return p_enabled;
end
$function$;

revoke all on function
  public.get_join_request_notifications_enabled()
from public;
revoke all on function
  public.set_join_request_notifications_enabled(boolean)
from public;

grant execute on function
  public.get_join_request_notifications_enabled()
to authenticated;
grant execute on function
  public.set_join_request_notifications_enabled(boolean)
to authenticated;

commit;
