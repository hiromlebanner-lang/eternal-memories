begin;

alter table public.albums
  add column if not exists theme_template_id text,
  add column if not exists theme_settings jsonb;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_theme_template_id_format_check'
      and conrelid = 'public.albums'::regclass
  ) then
    alter table public.albums
      add constraint albums_theme_template_id_format_check
      check (
        theme_template_id is null
        or theme_template_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'albums_theme_settings_object_check'
      and conrelid = 'public.albums'::regclass
  ) then
    alter table public.albums
      add constraint albums_theme_settings_object_check
      check (
        theme_settings is null
        or (
          jsonb_typeof(theme_settings) = 'object'
          and octet_length(theme_settings::text) <= 16384
        )
      );
  end if;
end
$block$;

create or replace function public.update_album_presentation_v2(
  p_album_id uuid,
  p_cover_photo_id uuid,
  p_visibility text,
  p_icon text,
  p_theme_color text,
  p_tags text[],
  p_theme_template_id text,
  p_theme_settings jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_album_manager(p_album_id) then
    raise exception 'このアルバムの表示設定を変更する権限がありません';
  end if;

  if (p_theme_template_id is null) <> (p_theme_settings is null) then
    raise exception 'テーマテンプレートの設定が正しくありません';
  end if;

  if p_theme_template_id is not null and (
    p_theme_template_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    or jsonb_typeof(p_theme_settings) <> 'object'
    or octet_length(p_theme_settings::text) > 16384
  ) then
    raise exception 'テーマテンプレートの設定が正しくありません';
  end if;

  update public.albums
  set cover_photo_id = p_cover_photo_id,
      visibility = p_visibility,
      icon = left(trim(p_icon), 32),
      theme_color = p_theme_color,
      theme_template_id = p_theme_template_id,
      theme_settings = p_theme_settings,
      updated_at = now()
  where id = p_album_id;

  if not found then
    raise exception 'アルバムが見つかりません';
  end if;

  delete from public.album_tags
  where album_id = p_album_id;

  insert into public.album_tags (album_id, tag, added_by)
  select p_album_id, normalized.tag, auth.uid()
  from (
    select distinct left(trim(value), 30) as tag
    from unnest(coalesce(p_tags, array[]::text[])) as value
    where trim(value) <> ''
    limit 12
  ) as normalized;
end
$function$;

revoke all on function public.update_album_presentation_v2(
  uuid, uuid, text, text, text, text[], text, jsonb
) from public, anon;
grant execute on function public.update_album_presentation_v2(
  uuid, uuid, text, text, text, text[], text, jsonb
) to authenticated;

grant select (theme_template_id, theme_settings)
  on table public.albums to authenticated;

commit;
