begin;

alter table public.drive_logs
  add column if not exists actual_distance_meters integer;

update public.drive_logs
set actual_distance_meters = distance_meters
where actual_distance_meters is null;

create or replace function public.set_drive_actual_distance()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.actual_distance_meters is null then
    new.actual_distance_meters := new.distance_meters;
  end if;
  return new;
end
$function$;

drop trigger if exists mapalbum_set_drive_actual_distance
on public.drive_logs;

create trigger mapalbum_set_drive_actual_distance
before insert or update of distance_meters, actual_distance_meters
on public.drive_logs
for each row
execute function public.set_drive_actual_distance();

alter table public.drive_logs
  alter column actual_distance_meters set not null,
  drop constraint if exists drive_logs_actual_distance_check,
  add constraint drive_logs_actual_distance_check
  check (actual_distance_meters >= 0);

commit;
