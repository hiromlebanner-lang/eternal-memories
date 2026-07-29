begin;

do $type$
begin
  create type public.site_role as enum ('site_admin', 'moderator', 'user');
exception
  when duplicate_object then null;
end
$type$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.site_role not null default 'user',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  suspended_at timestamptz not null default now(),
  suspended_by uuid not null references auth.users(id) on delete restrict,
  suspended_until timestamptz,
  active boolean not null default true,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (
    (active and ended_at is null)
    or
    (not active and ended_at is not null)
  )
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 3 and 80),
  before_value jsonb,
  after_value jsonb,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists user_roles_role_idx
  on public.user_roles(role);
create index if not exists user_suspensions_active_idx
  on public.user_suspensions(active, suspended_until);
create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_admin_idx
  on public.admin_audit_logs(admin_user_id, created_at desc);
create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs(target_user_id, created_at desc);

create or replace function public.current_site_role()
returns public.site_role
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select role
      from public.user_roles
      where user_id = auth.uid()
    ),
    'user'::public.site_role
  );
$function$;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and public.current_site_role() = 'site_admin'::public.site_role;
$function$;

alter table public.user_roles enable row level security;
alter table public.user_suspensions enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on table public.user_roles from anon, authenticated;
revoke all on table public.user_suspensions from anon, authenticated;
revoke all on table public.admin_audit_logs from anon, authenticated;

grant select on table public.user_roles to authenticated;
grant select on table public.user_suspensions to authenticated;
grant select on table public.admin_audit_logs to authenticated;
grant all on table public.user_roles to service_role;
grant all on table public.user_suspensions to service_role;
grant all on table public.admin_audit_logs to service_role;

drop policy if exists "users read own site role" on public.user_roles;
create policy "users read own site role"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid() or public.is_site_admin());

drop policy if exists "users read own suspension" on public.user_suspensions;
create policy "users read own suspension"
on public.user_suspensions
for select
to authenticated
using (user_id = auth.uid() or public.is_site_admin());

drop policy if exists "site admins read audit logs" on public.admin_audit_logs;
create policy "site admins read audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.is_site_admin());

revoke all on function public.current_site_role() from public, anon;
revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.current_site_role() to authenticated;
grant execute on function public.is_site_admin() to authenticated;

do $seed$
declare
  initial_admin_id constant uuid := 'a0b096e5-e9ca-4403-ba4e-202d1bb9aa55';
  exact_match_count integer;
begin
  select count(*)
  into exact_match_count
  from auth.users
  where id = initial_admin_id
    and lower(email) = lower('noguo_vimukty@icloud.com')
    and deleted_at is null;

  if exact_match_count <> 1 then
    raise exception 'Initial site administrator could not be uniquely verified';
  end if;

  insert into public.user_roles (user_id, role, created_by)
  values (
    initial_admin_id,
    'site_admin'::public.site_role,
    initial_admin_id
  )
  on conflict (user_id)
  do update
  set role = excluded.role,
      updated_at = now()
  where public.user_roles.role <> 'site_admin'::public.site_role;

  insert into public.admin_audit_logs (
    admin_user_id,
    target_user_id,
    action,
    before_value,
    after_value,
    reason
  )
  select
    initial_admin_id,
    initial_admin_id,
    'initial_site_admin_granted',
    null,
    jsonb_build_object('role', 'site_admin'),
    'Initial site administrator setup'
  where not exists (
    select 1
    from public.admin_audit_logs as audit
    where action = 'initial_site_admin_granted'
      and audit.target_user_id = initial_admin_id
  );
end
$seed$;

commit;
