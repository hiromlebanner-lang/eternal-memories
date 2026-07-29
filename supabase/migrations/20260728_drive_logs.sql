begin;

create table if not exists public.drive_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  start_latitude double precision not null check (start_latitude between -90 and 90),
  start_longitude double precision not null check (start_longitude between -180 and 180),
  end_latitude double precision not null check (end_latitude between -90 and 90),
  end_longitude double precision not null check (end_longitude between -180 and 180),
  start_label text not null default '',
  end_label text not null default '',
  distance_meters integer not null check (distance_meters >= 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  created_at timestamptz not null default now(),
  constraint drive_logs_time_check check (ended_at >= started_at)
);

create table if not exists public.drive_route_points (
  id bigint generated always as identity primary key,
  drive_log_id uuid not null references public.drive_logs(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  recorded_at timestamptz not null,
  accuracy double precision not null check (accuracy >= 0),
  speed double precision,
  heading double precision,
  altitude double precision,
  sequence_no integer not null check (sequence_no >= 0),
  unique (drive_log_id, sequence_no)
);

create index if not exists drive_logs_user_started_idx
  on public.drive_logs (user_id, started_at desc);
create index if not exists drive_route_points_log_sequence_idx
  on public.drive_route_points (drive_log_id, sequence_no);

alter table public.drive_logs enable row level security;
alter table public.drive_route_points enable row level security;

drop policy if exists "users read own drive logs" on public.drive_logs;
create policy "users read own drive logs"
on public.drive_logs for select to authenticated
using (user_id = auth.uid());

drop policy if exists "users create own drive logs" on public.drive_logs;
create policy "users create own drive logs"
on public.drive_logs for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update own drive logs" on public.drive_logs;
create policy "users update own drive logs"
on public.drive_logs for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users delete own drive logs" on public.drive_logs;
create policy "users delete own drive logs"
on public.drive_logs for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "users read own drive points" on public.drive_route_points;
create policy "users read own drive points"
on public.drive_route_points for select to authenticated
using (
  exists (
    select 1 from public.drive_logs
    where drive_logs.id = drive_route_points.drive_log_id
      and drive_logs.user_id = auth.uid()
  )
);

drop policy if exists "users create own drive points" on public.drive_route_points;
create policy "users create own drive points"
on public.drive_route_points for insert to authenticated
with check (
  exists (
    select 1 from public.drive_logs
    where drive_logs.id = drive_route_points.drive_log_id
      and drive_logs.user_id = auth.uid()
  )
);

drop policy if exists "users delete own drive points" on public.drive_route_points;
create policy "users delete own drive points"
on public.drive_route_points for delete to authenticated
using (
  exists (
    select 1 from public.drive_logs
    where drive_logs.id = drive_route_points.drive_log_id
      and drive_logs.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.drive_logs to authenticated;
grant select, insert, delete on public.drive_route_points to authenticated;
grant usage, select on sequence public.drive_route_points_id_seq to authenticated;

commit;
