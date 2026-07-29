begin;

-- Existing installations use least-privilege column grants on albums.
-- Expose only the new presentation columns to authenticated album members;
-- row visibility remains controlled by the existing albums RLS policy.
grant select (updated_at, cover_photo_id, visibility, icon, theme_color)
  on table public.albums to authenticated;

-- The function validates is_album_manager before writing. Running the
-- validated transaction as its owner avoids granting broad direct UPDATE
-- rights for presentation fields to every authenticated client.
alter function public.update_album_presentation(
  uuid, uuid, text, text, text, text[]
) security definer;
alter function public.update_album_presentation(
  uuid, uuid, text, text, text, text[]
) set search_path = '';

revoke all on function public.update_album_presentation(
  uuid, uuid, text, text, text, text[]
) from public, anon;
grant execute on function public.update_album_presentation(
  uuid, uuid, text, text, text, text[]
) to authenticated;

commit;
