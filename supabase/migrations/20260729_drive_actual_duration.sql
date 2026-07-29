begin;

alter table public.drive_logs
  add column if not exists actual_duration_seconds integer;

update public.drive_logs
set actual_duration_seconds = duration_seconds
where actual_duration_seconds is null;

create or replace function public.set_drive_actual_duration()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.actual_duration_seconds is null then
    new.actual_duration_seconds := new.duration_seconds;
  end if;
  return new;
end
$function$;

drop trigger if exists mapalbum_set_drive_actual_duration
on public.drive_logs;

create trigger mapalbum_set_drive_actual_duration
before insert or update of duration_seconds, actual_duration_seconds
on public.drive_logs
for each row
execute function public.set_drive_actual_duration();

alter table public.drive_logs
  alter column actual_duration_seconds set not null,
  drop constraint if exists drive_logs_actual_duration_check,
  add constraint drive_logs_actual_duration_check
  check (actual_duration_seconds >= 0);

commit;
