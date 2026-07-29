begin;

alter table public.drive_logs
  add column if not exists destination_name text,
  add column if not exists destination_address text,
  add column if not exists destination_latitude double precision,
  add column if not exists destination_longitude double precision,
  add column if not exists planned_distance_meters integer,
  add column if not exists planned_duration_seconds integer,
  add column if not exists planned_route jsonb;

alter table public.drive_logs
  drop constraint if exists drive_logs_destination_coordinates_check,
  add constraint drive_logs_destination_coordinates_check
  check (
    (destination_latitude is null and destination_longitude is null)
    or (
      destination_latitude between -90 and 90
      and destination_longitude between -180 and 180
    )
  ),
  drop constraint if exists drive_logs_planned_distance_check,
  add constraint drive_logs_planned_distance_check
  check (planned_distance_meters is null or planned_distance_meters >= 0),
  drop constraint if exists drive_logs_planned_duration_check,
  add constraint drive_logs_planned_duration_check
  check (planned_duration_seconds is null or planned_duration_seconds >= 0);

commit;
