begin;

alter table public.albums
  add column if not exists owner_id uuid references public.profiles(id);

update public.albums
set owner_id = created_by
where owner_id is null;

alter table public.albums
  alter column owner_id set default auth.uid(),
  alter column owner_id set not null;

alter table public.albums enable row level security;

-- 既知の旧DELETEポリシーだけを安全に置き換える。
drop policy if exists "admins delete albums" on public.albums;
drop policy if exists "owners delete albums" on public.albums;
drop policy if exists "owners delete albums by owner_id" on public.albums;

create policy "owners delete albums by owner_id"
on public.albums
for delete
to authenticated
using (owner_id = (select auth.uid()));

commit;
