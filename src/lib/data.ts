import { del, get, keys, set } from "idb-keyval";
import type {
  Album,
  AlbumInviteSettings,
  AlbumInvitation,
  AlbumJoinRequest,
  AlbumMember,
  AlbumPhoto,
  AlbumRole,
  PhotoCategory,
} from "../types";
import { compressPhoto } from "./image";
import { formatErrorMessage, toAppError } from "./errors";
import { supabase } from "./supabase";

type LoadResult<T> = {
  data: T;
  fromCache: boolean;
};

const albumCacheKey = (userID: string) => `mapalbum:albums:${userID}`;
const photoCacheKey = (userID: string, albumID: string) =>
  `mapalbum:photos:${userID}:${albumID}`;

export async function clearPrivateOfflineData() {
  try {
    const storedKeys = await keys();
    await Promise.all(
      storedKeys
        .filter(
          (key): key is string =>
            typeof key === "string" && key.startsWith("mapalbum:"),
        )
        .map((key) => del(key)),
    );
  } catch {
    // ログアウト自体は、端末キャッシュ削除の失敗で止めない。
  }

  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.allSettled(
      cacheNames
        .filter((name) => name.startsWith("mapalbum-"))
        .map((name) => caches.delete(name)),
    );
  }
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabaseが設定されていません。");
  return supabase;
}

function supabaseErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "";
  }
  return typeof error.code === "string" ? error.code : "";
}

function supabaseErrorMessage(error: unknown) {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return "";
  }
  return typeof error.message === "string" ? error.message : "";
}

function isMissingColumnError(error: unknown) {
  return (
    supabaseErrorCode(error) === "42703" &&
    /owner_id|members_can_invite|invite_code_enabled|invite_code_expires_at|cover_photo_id|visibility|theme_color|icon/i.test(
      supabaseErrorMessage(error),
    )
  );
}

function isMissingRPCError(error: unknown, functionName: string) {
  return (
    supabaseErrorCode(error) === "PGRST202" &&
    supabaseErrorMessage(error).includes(functionName)
  );
}

export async function loadAlbums(userID: string): Promise<LoadResult<Album[]>> {
  if (!userID) {
    throw new Error("ログインユーザーを確認してからアルバムを読み込んでください。");
  }
  const client = requireSupabase();

  try {
    const loadAlbumRows = async () => {
      const current = await client
        .from("albums")
        .select(
          "id, name, description, owner_id, created_by, created_at, updated_at, members_can_invite, cover_photo_id, visibility, icon, theme_color",
        )
        .order("created_at", { ascending: false });

      if (!current.error || !isMissingColumnError(current.error)) {
        return current;
      }

      // 20260725 migration適用前の既存環境でも、基本の招待コードを
      // 利用できるように従来カラムだけで再取得する。
      return client
        .from("albums")
        .select("id, name, description, created_by, created_at")
        .order("created_at", { ascending: false });
    };

    const [
      { data: albumRows, error: albumError },
      { data: membershipRows, error: membershipError },
      { data: photoRows, error: photoError },
      { data: memberRows, error: memberError },
      { data: preferenceRows, error: preferenceError },
      { data: tagRows, error: tagError },
    ] = await Promise.all([
      loadAlbumRows(),
      client
        .from("album_members")
        .select("album_id, role")
        .eq("user_id", userID),
      client
        .from("photos")
        .select(
          "id, album_id, storage_path, title, caption, captured_at, created_at",
        ),
      client
        .from("album_members")
        .select("album_id, user_id, profiles(display_name)"),
      client
        .from("user_album_preferences")
        .select("album_id, is_favorite, last_viewed_at")
        .eq("user_id", userID),
      client.from("album_tags").select("album_id, tag"),
    ]);

    if (albumError) throw albumError;
    if (membershipError) throw membershipError;
    if (photoError) throw photoError;
    if (memberError) throw memberError;
    if (preferenceError) throw preferenceError;
    if (tagError) throw tagError;

    const roleByAlbum = new Map(
      (membershipRows ?? []).map((membership) => [
        membership.album_id,
        membership.role as AlbumRole,
      ]),
    );
    const photoCounts = new Map<string, number>();
    const memberCounts = new Map<string, number>();
    const memberNames = new Map<string, string[]>();
    const photoCreatedAtByAlbum = new Map<string, number[]>();
    const photoSearchTextByAlbum = new Map<string, string[]>();
    const newestPhotoByAlbum = new Map<
      string,
      {
        id: string;
        storage_path: string;
        captured_at: string;
        created_at: string;
      }
    >();

    for (const row of photoRows ?? []) {
      if (!row.album_id) continue;
      photoCounts.set(row.album_id, (photoCounts.get(row.album_id) ?? 0) + 1);
      const createdTimes = photoCreatedAtByAlbum.get(row.album_id) ?? [];
      createdTimes.push(new Date(row.created_at).getTime());
      photoCreatedAtByAlbum.set(row.album_id, createdTimes);
      const photoText = [row.title, row.caption].filter(Boolean).join(" ");
      if (photoText) {
        const searchText = photoSearchTextByAlbum.get(row.album_id) ?? [];
        searchText.push(photoText);
        photoSearchTextByAlbum.set(row.album_id, searchText);
      }
      const current = newestPhotoByAlbum.get(row.album_id);
      if (
        !current ||
        new Date(row.captured_at ?? row.created_at).getTime() >
          new Date(current.captured_at ?? current.created_at).getTime()
      ) {
        newestPhotoByAlbum.set(row.album_id, {
          id: row.id,
          storage_path: row.storage_path,
          captured_at: row.captured_at,
          created_at: row.created_at,
        });
      }
    }
    for (const row of memberRows ?? []) {
      memberCounts.set(row.album_id, (memberCounts.get(row.album_id) ?? 0) + 1);
      const profile = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      if (profile?.display_name) {
        const names = memberNames.get(row.album_id) ?? [];
        names.push(profile.display_name);
        memberNames.set(row.album_id, names);
      }
    }

    const ownerIDs = [
      ...new Set(
        (albumRows ?? []).map((album) =>
          "owner_id" in album && typeof album.owner_id === "string"
            ? album.owner_id
            : album.created_by,
        ),
      ),
    ];
    const { data: ownerRows, error: ownerError } =
      ownerIDs.length > 0
        ? await client
            .from("profiles")
            .select("id, display_name")
            .in("id", ownerIDs)
        : { data: [], error: null };
    if (ownerError) throw ownerError;
    const ownerNames = new Map(
      (ownerRows ?? []).map((profile) => [
        profile.id,
        profile.display_name || "オーナー",
      ]),
    );

    const preferenceByAlbum = new Map(
      (preferenceRows ?? []).map((preference) => [
        preference.album_id,
        preference,
      ]),
    );
    const tagsByAlbum = new Map<string, string[]>();
    for (const row of tagRows ?? []) {
      const tags = tagsByAlbum.get(row.album_id) ?? [];
      tags.push(row.tag);
      tagsByAlbum.set(row.album_id, tags);
    }

    const coverPhotoByAlbum = new Map<
      string,
      { id: string; storagePath: string }
    >();
    for (const album of albumRows ?? []) {
      const explicitID =
        "cover_photo_id" in album && typeof album.cover_photo_id === "string"
          ? album.cover_photo_id
          : null;
      const explicit = explicitID
        ? (photoRows ?? []).find((photo) => photo.id === explicitID)
        : undefined;
      const fallback = newestPhotoByAlbum.get(album.id);
      const photo = explicit ?? fallback;
      if (photo?.storage_path) {
        coverPhotoByAlbum.set(album.id, {
          id: photo.id,
          storagePath: photo.storage_path,
        });
      }
    }
    const coverPaths = [
      ...new Set(
        [...coverPhotoByAlbum.values()].map((photo) => photo.storagePath),
      ),
    ];
    const coverURLByPath = new Map<string, string>();
    if (coverPaths.length > 0) {
      const { data: coverURLs, error: coverError } = await client.storage
        .from("album-photos")
        .createSignedUrls(coverPaths, 60 * 60 * 24);
      if (coverError) throw coverError;
      for (const cover of coverURLs ?? []) {
        if (cover.path && cover.signedUrl) {
          coverURLByPath.set(cover.path, cover.signedUrl);
        }
      }
    }

    const seenAlbumIDs = new Set<string>();
    const albums = (albumRows ?? []).reduce<Album[]>((result, album) => {
      const ownerID =
        "owner_id" in album && typeof album.owner_id === "string"
          ? album.owner_id
          : album.created_by;
      const memberRole = roleByAlbum.get(album.id);
      const role = ownerID === userID ? "owner" : memberRole;

      if (!role || seenAlbumIDs.has(album.id)) return result;
      seenAlbumIDs.add(album.id);

      const membersCanInvite =
        "members_can_invite" in album && Boolean(album.members_can_invite);
      const preference = preferenceByAlbum.get(album.id);
      const coverPhoto = coverPhotoByAlbum.get(album.id);
      const viewedAt = preference?.last_viewed_at
        ? new Date(preference.last_viewed_at).getTime()
        : 0;
      result.push({
        id: album.id,
        name: album.name,
        description: album.description ?? "",
        invite_code: "",
        created_by: album.created_by,
        owner_id: ownerID,
        created_at: album.created_at,
        updated_at:
          "updated_at" in album && typeof album.updated_at === "string"
            ? album.updated_at
            : album.created_at,
        members_can_invite: membersCanInvite,
        can_invite:
          role === "owner" ||
          role === "admin" ||
          (role === "member" && membersCanInvite),
        cover_url: coverPhoto
          ? (coverURLByPath.get(coverPhoto.storagePath) ?? null)
          : null,
        cover_photo_id:
          "cover_photo_id" in album && typeof album.cover_photo_id === "string"
            ? album.cover_photo_id
            : null,
        owner_name: ownerNames.get(ownerID) ?? "オーナー",
        visibility:
          "visibility" in album &&
          (album.visibility === "public" ||
            album.visibility === "limited" ||
            album.visibility === "private")
            ? album.visibility
            : "private",
        icon:
          "icon" in album && typeof album.icon === "string"
            ? album.icon
            : "images",
        theme_color:
          "theme_color" in album && typeof album.theme_color === "string"
            ? album.theme_color
            : "#c65476",
        is_favorite: preference?.is_favorite ?? false,
        tags: tagsByAlbum.get(album.id) ?? [],
        member_names: memberNames.get(album.id) ?? [],
        search_text: (photoSearchTextByAlbum.get(album.id) ?? []).join(" "),
        last_viewed_at: preference?.last_viewed_at ?? null,
        unread_count: (photoCreatedAtByAlbum.get(album.id) ?? []).filter(
          (createdAt) => createdAt > viewedAt,
        ).length,
        offline_enabled: false,
        role,
        photo_count: photoCounts.get(album.id) ?? 0,
        member_count: memberCounts.get(album.id) ?? 1,
      });
      return result;
    }, []);

    await set(albumCacheKey(userID), albums);
    return { data: albums, fromCache: false };
  } catch (error) {
    const cached = await get<Album[]>(albumCacheKey(userID));
    if (cached && cached.length > 0) {
      console.warn("Album loading failed; using cached albums:", {
        userID,
        error,
      });
      return { data: cached, fromCache: true };
    }
    throw error;
  }
}

export async function saveAlbumPreference(input: {
  userID: string;
  albumID: string;
  isFavorite?: boolean;
  viewedNow?: boolean;
}) {
  const client = requireSupabase();
  const updates: Record<string, unknown> = {
    user_id: input.userID,
    album_id: input.albumID,
    updated_at: new Date().toISOString(),
  };
  if (input.isFavorite !== undefined) {
    updates.is_favorite = input.isFavorite;
  }
  if (input.viewedNow) updates.last_viewed_at = new Date().toISOString();

  const { error } = await client
    .from("user_album_preferences")
    .upsert(updates, { onConflict: "user_id,album_id" });
  if (error) {
    throw toAppError(error, "アルバムの設定を保存できませんでした。");
  }
}

export async function updateAlbumPresentation(input: {
  albumID: string;
  coverPhotoID: string | null;
  visibility: "private" | "limited" | "public";
  icon: string;
  themeColor: string;
  tags: string[];
}) {
  const client = requireSupabase();
  const normalizedTags = [
    ...new Set(
      input.tags
        .map((tag) => tag.trim())
        .filter(Boolean)
      .map((tag) => tag.slice(0, 30)),
    ),
  ].slice(0, 12);
  const { error } = await client.rpc("update_album_presentation", {
    p_album_id: input.albumID,
    p_cover_photo_id: input.coverPhotoID,
    p_visibility: input.visibility,
    p_icon: input.icon,
    p_theme_color: input.themeColor,
    p_tags: normalizedTags,
  });
  if (error) {
    throw toAppError(error, "アルバムの表示設定を保存できませんでした。");
  }
}

export async function loadRecentAlbumPhotos(
  userID: string,
  limit = 12,
): Promise<LoadResult<AlbumPhoto[]>> {
  const cacheKey = `mapalbum:recent-photos:${userID}`;
  const client = requireSupabase();
  try {
    const { data, error } = await client
      .from("photos")
      .select(
        "id, album_id, author_id, author_name, storage_path, title, caption, category, captured_at, created_at, latitude, longitude, visibility",
      )
      .not("album_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = data ?? [];
    const paths = rows.map((photo) => photo.storage_path).filter(Boolean);
    const signedURLByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signedURLs, error: signedError } = await client.storage
        .from("album-photos")
        .createSignedUrls(paths, 60 * 60 * 24);
      if (signedError) throw signedError;
      for (const signed of signedURLs ?? []) {
        if (signed.path && signed.signedUrl) {
          signedURLByPath.set(signed.path, signed.signedUrl);
        }
      }
    }
    const photos = rows.map((photo) => ({
      ...photo,
      image_url: signedURLByPath.get(photo.storage_path) ?? "",
      category: photo.category as PhotoCategory,
      latitude: photo.latitude == null ? null : Number(photo.latitude),
      longitude: photo.longitude == null ? null : Number(photo.longitude),
      visibility:
        photo.visibility === "global"
          ? ("global" as const)
          : ("album_only" as const),
    }));
    await set(cacheKey, photos);
    return { data: photos, fromCache: false };
  } catch (error) {
    const cached = await get<AlbumPhoto[]>(cacheKey);
    if (cached) return { data: cached, fromCache: true };
    throw error;
  }
}

export async function loadPhotos(
  userID: string,
  albumID: string,
): Promise<LoadResult<AlbumPhoto[]>> {
  const client = requireSupabase();

  try {
    const { data, error } = await client
      .from("photos")
      .select("*")
      .eq("album_id", albumID)
      .order("captured_at", { ascending: false });
    if (error) throw error;

    const rows = data ?? [];
    const authorIDs = [...new Set(rows.map((photo) => photo.author_id))];
    const { data: authorProfiles } =
      authorIDs.length > 0
        ? await client
            .from("profiles")
            .select("id, avatar_url")
            .in("id", authorIDs)
        : { data: [] };
    const avatarByAuthor = new Map(
      (authorProfiles ?? []).map((profile) => [profile.id, profile.avatar_url]),
    );
    const paths = rows.map((photo) => photo.storage_path).filter(Boolean);
    const signedURLByPath = new Map<string, string>();

    if (paths.length > 0) {
      const { data: signedData, error: signedError } = await client.storage
        .from("album-photos")
        .createSignedUrls(paths, 60 * 60);
      if (signedError) throw signedError;
      for (const signed of signedData ?? []) {
        if (signed.path && signed.signedUrl) {
          signedURLByPath.set(signed.path, signed.signedUrl);
        }
      }
    }

    const photos: AlbumPhoto[] = rows.map((photo) => ({
      id: photo.id,
      album_id: photo.album_id,
      author_id: photo.author_id,
      author_name: photo.author_name,
      author_avatar_url: avatarByAuthor.get(photo.author_id) ?? null,
      storage_path: photo.storage_path,
      image_url: signedURLByPath.get(photo.storage_path) ?? "",
      title: photo.title ?? "",
      caption: photo.caption ?? "",
      category: photo.category as PhotoCategory,
      captured_at: photo.captured_at,
      created_at: photo.created_at,
      latitude: photo.latitude == null ? null : Number(photo.latitude),
      longitude: photo.longitude == null ? null : Number(photo.longitude),
      visibility: photo.visibility === "global" ? "global" : "album_only",
    }));

    await set(photoCacheKey(userID, albumID), photos);
    return { data: photos, fromCache: false };
  } catch (error) {
    const cached = await get<AlbumPhoto[]>(photoCacheKey(userID, albumID));
    if (cached) return { data: cached, fromCache: true };
    throw error;
  }
}

export async function loadGlobalPhotos(offset = 0, limit = 24) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("photos")
    .select(
      "id, album_id, author_id, author_name, storage_path, title, caption, category, captured_at, created_at, latitude, longitude, visibility",
    )
    .eq("visibility", "global")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = data ?? [];
  const authorIDs = [...new Set(rows.map((photo) => photo.author_id))];
  const { data: authorProfiles } =
    authorIDs.length > 0
      ? await client.from("profiles").select("id, avatar_url").in("id", authorIDs)
      : { data: [] };
  const avatarByAuthor = new Map(
    (authorProfiles ?? []).map((profile) => [profile.id, profile.avatar_url]),
  );
  const paths = rows.map((photo) => photo.storage_path).filter(Boolean);
  const signedURLByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signedData, error: signedError } = await client.storage
      .from("album-photos")
      .createSignedUrls(paths, 60 * 15);
    if (signedError) throw signedError;
    for (const signed of signedData ?? []) {
      if (signed.path && signed.signedUrl) {
        signedURLByPath.set(signed.path, signed.signedUrl);
      }
    }
  }

  const photos: AlbumPhoto[] = rows.map((photo) => ({
    id: photo.id,
    album_id: photo.album_id,
    author_id: photo.author_id,
    author_name: photo.author_name,
    author_avatar_url: avatarByAuthor.get(photo.author_id) ?? null,
    storage_path: photo.storage_path,
    image_url: signedURLByPath.get(photo.storage_path) ?? "",
    title: photo.title ?? "",
    caption: photo.caption ?? "",
    category: photo.category as PhotoCategory,
    captured_at: photo.captured_at,
    created_at: photo.created_at,
    latitude: photo.latitude == null ? null : Number(photo.latitude),
    longitude: photo.longitude == null ? null : Number(photo.longitude),
    visibility: "global",
  }));
  return { photos, hasMore: rows.length === limit };
}

export async function downloadAlbumPhoto(photoID: string) {
  const client = requireSupabase();
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw sessionError ?? new Error("ログインが必要です");
  }

  const response = await fetch("/api/photo-download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ photoId: photoID }),
  });
  if (!response.ok) {
    throw new Error(`Photo download failed: ${response.status}`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const fileName =
    disposition.match(/filename="([^"]+)"/i)?.[1] ??
    `eternal-memories_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.jpg`;
  const file = new File([blob], fileName, {
    type: blob.type || response.headers.get("Content-Type") || "image/jpeg",
  });
  const shareData: ShareData = {
    files: [file],
    title: "Eternal memories",
    text: "Eternal memoriesの写真",
  };
  const canShareFile =
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" ||
      navigator.canShare(shareData));

  if (canShareFile) {
    try {
      await navigator.share(shareData);
      return "shared" as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled" as const;
      }
      console.warn("[PhotoDownload] 共有メニューを開けないためダウンロードします", error);
    }
  }

  const objectURL = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectURL;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectURL), 1_000);
  return "downloaded" as const;
}

export async function createAlbum(name: string, description: string) {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError) {
    throw toAppError(userError, "ログイン状態を確認できませんでした。");
  }
  if (!user) {
    throw new Error("ログインし直してからアルバムを作成してください。");
  }

  // INSERT ... RETURNING はSELECTのRLSも同じ文中で評価します。
  // オーナー行はAFTER INSERTトリガーで追加されるため、作成直後のRETURNINGを
  // 避け、INSERTの完了後に別のSELECT文でIDを取得します。
  const {
    error: insertError,
    status: insertStatus,
    statusText: insertStatusText,
  } = await client
    .from("albums")
    .insert({ name, description });
  if (insertError) {
    const responseLabel = [insertStatus, insertStatusText]
      .filter(Boolean)
      .join(" ");
    const responseError = formatErrorMessage(
      insertError,
      "Supabaseからエラー内容が返されませんでした。",
    );
    throw new Error(
      [
        `albums INSERT${responseLabel ? ` (${responseLabel})` : ""}`,
        `auth.uid(): ${user.id}`,
        "owner columns: owner_id / created_by = auth.uid() (database enforced)",
        responseError,
      ].join("\n"),
    );
  }

  const { data, error: selectError } = await client
    .from("albums")
    .select("id")
    .eq("created_by", user.id)
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (selectError) {
    throw toAppError(
      selectError,
      "作成したアルバムの情報を取得できませんでした。",
    );
  }
  if (!data?.id) {
    throw new Error("作成したアルバムの情報を取得できませんでした。");
  }
  return data.id as string;
}

export async function deleteAlbum(albumID: string) {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) {
    throw new Error("ログイン状態を確認できませんでした。");
  }

  const { data: album, error: albumError } = await client
    .from("albums")
    .select("created_by")
    .eq("id", albumID)
    .maybeSingle();
  if (albumError) throw toAppError(albumError, "アルバムを確認できませんでした。");
  if (!album || album.created_by !== user.id) {
    throw new Error("アルバムを削除できるのはオーナーだけです");
  }

  const { error } = await client
    .from("albums")
    .delete()
    .eq("id", albumID);
  if (error) throw toAppError(error, "アルバムを削除できませんでした。");

  const { data: remaining, error: verifyError } = await client
    .from("albums")
    .select("id")
    .eq("id", albumID)
    .maybeSingle();
  if (verifyError) throw toAppError(verifyError, "削除結果を確認できませんでした。");
  if (remaining) throw new Error("アルバムを削除できるのはオーナーだけです");
}

async function updateOwnProfile(updates: {
  display_name?: string;
  avatar_url?: string | null;
}) {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) throw new Error("ログイン状態を確認できませんでした。");

  const { error: profileError } = await client
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
  if (profileError) throw toAppError(profileError, "プロフィールを更新できませんでした。");

  const metadata = {
    ...(updates.display_name !== undefined
      ? { display_name: updates.display_name }
      : {}),
    ...(updates.avatar_url !== undefined ? { avatar_url: updates.avatar_url } : {}),
  };
  const { error: authError } = await client.auth.updateUser({ data: metadata });
  if (authError) throw toAppError(authError, "プロフィールを更新できませんでした。");
}

export async function updateProfileDisplayName(displayName: string) {
  const value = displayName.trim();
  if (!value) throw new Error("表示名を入力してください。");
  await updateOwnProfile({ display_name: value });
}

export async function uploadProfileAvatar(file: File) {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) throw new Error("ログイン状態を確認できませんでした。");

  const avatar = await compressPhoto(file, {
    square: true,
    maxDimension: 1024,
    quality: 0.82,
  });
  const path = `${user.id}.jpg`;
  const { error: uploadError } = await client.storage
    .from("avatars")
    .upload(path, avatar, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });
  if (uploadError) {
    console.error("Profile avatar upload failed:", uploadError);
    if (uploadError.message.includes("row-level security")) {
      throw new Error(
        "プロフィール画像を保存できませんでした。権限設定を確認してください",
      );
    }
    throw toAppError(uploadError, "プロフィール画像を保存できませんでした。");
  }

  const { data } = client.storage.from("avatars").getPublicUrl(path);
  const avatarURL = `${data.publicUrl}?v=${Date.now()}`;
  await updateOwnProfile({ avatar_url: avatarURL });
  return avatarURL;
}

export async function deleteProfileAvatar() {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) throw new Error("ログイン状態を確認できませんでした。");
  const { error: storageError } = await client.storage
    .from("avatars")
    .remove([`${user.id}.jpg`]);
  if (storageError) throw toAppError(storageError, "プロフィール画像を削除できませんでした。");
  await updateOwnProfile({ avatar_url: null });
}

export async function requestAlbumMembership(input: {
  inviteCode?: string;
  inviteToken?: string;
}) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("request_album_membership", {
    p_invite_code: input.inviteCode?.trim().toUpperCase() || null,
    p_invite_token: input.inviteToken || null,
  });
  if (error) {
    throw toAppError(error, "招待を確認できませんでした。");
  }
  return data as string;
}

export async function loadInviteCodePreview(inviteCode: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_album_invite_preview", {
    p_invite_code: inviteCode.trim().toUpperCase(),
  });
  if (error) {
    throw toAppError(error, "招待情報を取得できませんでした。");
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    album_id: string;
    album_name: string;
  } | null;
  if (!row?.album_id) throw new Error("招待情報を取得できませんでした。");
  return row;
}

export async function createEmailInvitation(input: {
  albumID: string;
  email: string;
  role: Exclude<AlbumRole, "owner">;
}): Promise<{
  invitation: AlbumInvitation;
  emailSent: boolean;
  emailError?: string;
}> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("create_album_invitation", {
    p_album_id: input.albumID,
    p_email: input.email.trim().toLowerCase(),
    p_role: input.role,
  });
  if (error) {
    throw toAppError(error, "招待を作成できませんでした。");
  }

  const row = (Array.isArray(data) ? data[0] : data) as AlbumInvitation | null;
  if (!row?.id || !row.token) {
    throw new Error("招待を作成できませんでした。");
  }

  const { error: emailError } = await client.functions.invoke(
    "send-album-invite",
    { body: { invitationId: row.id } },
  );

  return {
    invitation: row,
    emailSent: !emailError,
    emailError: emailError?.message,
  };
}

export async function deleteOwnAccount() {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("delete-account", {
    body: { confirmation: "DELETE_MY_ACCOUNT" },
  });
  if (error) {
    let message = "";
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const body = (await context.clone().json().catch(() => null)) as {
        error?: unknown;
      } | null;
      if (typeof body?.error === "string") message = body.error;
    }
    throw new Error(
      message ||
        "アカウントを削除できませんでした。時間を空けてもう一度お試しください。",
      { cause: error },
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    Reflect.get(data, "deleted") !== true
  ) {
    throw new Error("アカウントを削除できませんでした。");
  }
}

export async function loadMyDirectAlbumInvitations() {
  const client = requireSupabase();
  const { data, error } = await client.rpc(
    "get_my_direct_album_invitations",
  );
  if (error) {
    throw toAppError(error, "招待情報を取得できませんでした。");
  }
  return (data ?? []) as AlbumInvitation[];
}

export async function respondToDirectAlbumInvitation(
  invitationID: string,
  accept: boolean,
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc(
    "respond_to_album_invitation",
    {
      p_invitation_id: invitationID,
      p_accept: accept,
    },
  );
  if (error) {
    throw toAppError(error, "招待を処理できませんでした。");
  }
  return data as string | null;
}

export async function loadSentAlbumInvitations(albumID: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc(
    "get_album_direct_invitations",
    { p_album_id: albumID },
  );
  if (error) {
    throw toAppError(error, "招待済み一覧を取得できませんでした。");
  }
  return (data ?? []) as AlbumInvitation[];
}

export async function revokeDirectAlbumInvitation(invitationID: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("revoke_album_invitation", {
    p_invitation_id: invitationID,
  });
  if (error) {
    throw toAppError(error, "招待を取り消せませんでした。");
  }
}

export async function loadAlbumInviteCode(albumID: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_album_invite_code", {
    p_album_id: albumID,
  });
  if (error) {
    throw toAppError(error, "招待コードを取得できませんでした。");
  }
  if (typeof data !== "string" || !data) {
    throw new Error("招待コードを取得できませんでした。");
  }
  return data;
}

export async function loadAlbumInviteSettings(
  albumID: string,
): Promise<AlbumInviteSettings> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_album_invite_settings", {
    p_album_id: albumID,
  });
  if (error && isMissingRPCError(error, "get_album_invite_settings")) {
    const inviteCode = await loadAlbumInviteCode(albumID);
    return {
      invite_code: inviteCode,
      invite_code_enabled: true,
      invite_code_expires_at: "2099-12-31T23:59:59.999Z",
      members_can_invite: false,
      can_manage: true,
      can_invite: true,
      supports_advanced_settings: false,
    };
  }
  if (error) {
    throw toAppError(error, "招待情報を取得できませんでした。");
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | Omit<AlbumInviteSettings, "supports_advanced_settings">
    | null;
  if (!row?.invite_code) {
    throw new Error("招待設定を取得できませんでした。");
  }
  return {
    ...row,
    supports_advanced_settings: true,
  };
}

export async function updateAlbumInviteSettings(input: {
  albumID: string;
  membersCanInvite: boolean;
  enabled: boolean;
  expiresAt: string;
}) {
  const client = requireSupabase();
  const { error } = await client.rpc("update_album_invite_settings", {
    p_album_id: input.albumID,
    p_members_can_invite: input.membersCanInvite,
    p_invite_code_enabled: input.enabled,
    p_invite_code_expires_at: input.expiresAt,
  });
  if (error) {
    throw toAppError(error, "招待設定を保存できませんでした。");
  }
}

export async function rotateAlbumInviteCode(
  albumID: string,
  expiresAt: string,
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("rotate_album_invite_code", {
    p_album_id: albumID,
    p_expires_at: expiresAt,
  });
  if (error) {
    throw toAppError(error, "招待コードを再発行できませんでした。");
  }
  if (typeof data !== "string" || !data) {
    throw new Error("招待コードを再発行できませんでした。");
  }
  return data;
}

export async function uploadPhoto(input: {
  albumID: string | null;
  authorID: string;
  authorName: string;
  file: File;
  title: string;
  caption: string;
  category: PhotoCategory;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  visibility: "album_only" | "global";
  photoID?: string;
}) {
  const client = requireSupabase();
  const photoID = input.photoID ?? crypto.randomUUID();
  if (input.photoID) {
    const { data: existingPhoto, error: existingError } = await client
      .from("photos")
      .select("id, storage_path")
      .eq("id", photoID)
      .maybeSingle();
    if (existingError) {
      throw toAppError(existingError, "写真の同期状態を確認できませんでした。");
    }
    if (existingPhoto) {
      return {
        photoID: existingPhoto.id,
        storagePath: existingPhoto.storage_path,
      };
    }
  }
  const storagePath = input.albumID
    ? `${input.albumID}/${input.authorID}/${photoID}.jpg`
    : `global/${input.authorID}/${photoID}.jpg`;
  console.info("[PhotoUpload] Storage開始", {
    fileName: input.file.name,
    storagePath,
  });
  let uploadBody: Blob;
  let contentType = "image/jpeg";
  try {
    uploadBody = await compressPhoto(input.file);
  } catch (compressionError) {
    console.warn("[PhotoUpload] 画像変換失敗・原本を使用", {
      fileName: input.file.name,
      error: compressionError,
    });
    const originalType = input.file.type.toLowerCase();
    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]);
    if (!allowedTypes.has(originalType)) {
      throw new Error(
        `Image Conversion Failed: ${input.file.name}（対応していない画像形式です）`,
        { cause: compressionError },
      );
    }
    if (input.file.size > 15 * 1024 * 1024) {
      throw new Error(
        `Storage Upload Failed: ${input.file.name}（15MBの上限を超えています）`,
        { cause: compressionError },
      );
    }
    uploadBody = input.file;
    contentType = originalType;
  }

  const { error: uploadError } = await client.storage
    .from("album-photos")
    .upload(storagePath, uploadBody, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadError) {
    console.error("[PhotoUpload] Storage失敗理由", {
      fileName: input.file.name,
      error: uploadError,
    });
    throw new Error(`Storage Upload Failed: ${uploadError.message}`);
  }
  console.info("[PhotoUpload] Storage成功", {
    fileName: input.file.name,
    storagePath,
  });

  console.info("[PhotoUpload] DB登録開始", {
    fileName: input.file.name,
    photoID,
  });
  const { error: insertError } = await client.from("photos").insert({
    id: photoID,
    album_id: input.albumID,
    author_id: input.authorID,
    author_name: input.authorName,
    storage_path: storagePath,
    title: input.title,
    caption: input.caption,
    category: input.category,
    captured_at: input.capturedAt,
    latitude: input.latitude,
    longitude: input.longitude,
    visibility: input.visibility,
  });

  if (insertError) {
    console.error("[PhotoUpload] DB登録失敗理由", {
      fileName: input.file.name,
      error: insertError,
    });
    const { error: rollbackError } = await client.storage
      .from("album-photos")
      .remove([storagePath]);
    if (rollbackError) {
      console.error("[PhotoUpload] Storageロールバック失敗", {
        fileName: input.file.name,
        storagePath,
        error: rollbackError,
      });
    }
    const permissionDenied =
      supabaseErrorCode(insertError) === "42501" ||
      /permission denied|row-level security/i.test(
        supabaseErrorMessage(insertError),
      );
    throw new Error(
      permissionDenied
        ? input.albumID
          ? "写真を保存できませんでした。ログイン状態またはアルバムの参加権限を確認してください。"
          : "写真を投稿できませんでした。ログイン状態をご確認ください。"
        : "写真を投稿できませんでした。もう一度お試しください。",
    );
  }
  console.info("[PhotoUpload] DB登録成功", {
    fileName: input.file.name,
    photoID,
  });

  return { photoID, storagePath };
}

export async function updatePhoto(
  photoID: string,
  updates: {
    caption: string;
    title: string;
    category: PhotoCategory;
    captured_at: string;
    latitude: number | null;
    longitude: number | null;
    visibility: "album_only" | "global";
  },
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("photos")
    .update(updates)
    .eq("id", photoID)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("写真が見つからないか、編集する権限がありません。");
  }
}

export async function deletePhoto(photo: AlbumPhoto) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("photos")
    .delete()
    .eq("id", photo.id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error("写真が見つからないか、削除する権限がありません。");
  }
  if (photo.storage_path) {
    const { error: storageError } = await client.storage
      .from("album-photos")
      .remove([photo.storage_path]);
    return { storageRemoved: !storageError, storageError: storageError?.message };
  }
  return { storageRemoved: true };
}

export async function loadMembers(albumID: string): Promise<AlbumMember[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("album_members")
    .select("album_id, user_id, role, joined_at, profiles(display_name, email, avatar_url)")
    .eq("album_id", albumID)
    .order("joined_at");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      album_id: row.album_id,
      user_id: row.user_id,
      role: row.role as AlbumRole,
      joined_at: row.joined_at,
      display_name: profile?.display_name ?? "メンバー",
      email: profile?.email ?? "",
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

export async function loadJoinRequests(
  albumID: string,
): Promise<AlbumJoinRequest[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("album_join_requests")
    .select(
      "id, album_id, user_id, invitation_id, requested_role, status, created_at, profiles(display_name, email, avatar_url)",
    )
    .eq("album_id", albumID)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      album_id: row.album_id,
      user_id: row.user_id,
      invitation_id: row.invitation_id,
      requested_role: row.requested_role as Exclude<AlbumRole, "owner">,
      status: row.status as AlbumJoinRequest["status"],
      created_at: row.created_at,
      display_name: profile?.display_name ?? "参加希望者",
      email: profile?.email ?? "",
      avatar_url: profile?.avatar_url ?? null,
    };
  });
}

export async function loadMyPendingJoinRequests(
  userID: string,
): Promise<AlbumJoinRequest[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("album_join_requests")
    .select(
      "id, album_id, user_id, invitation_id, requested_role, status, created_at",
    )
    .eq("user_id", userID)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as AlbumJoinRequest[];
}

export async function loadManagedJoinRequests(albums: Album[]) {
  const managedAlbums = albums.filter(
    (album) => album.role === "owner" || album.role === "admin",
  );
  const rows = await Promise.all(
    managedAlbums.map(async (album) =>
      (await loadJoinRequests(album.id)).map((request) => ({
        ...request,
        album_name: album.name,
      })),
    ),
  );
  return rows
    .flat()
    .sort(
      (first, second) =>
        Date.parse(first.created_at) - Date.parse(second.created_at),
    );
}

export async function reviewJoinRequest(
  requestID: string,
  approve: boolean,
  role: Exclude<AlbumRole, "owner">,
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc("review_album_join_request", {
    p_request_id: requestID,
    p_approve: approve,
    p_role: role,
  });
  if (error) throw error;
  return data as string;
}

export async function changeMemberRole(
  albumID: string,
  userID: string,
  role: Exclude<AlbumRole, "owner">,
) {
  const client = requireSupabase();
  const { error } = await client.rpc("change_album_member_role", {
    p_album_id: albumID,
    p_user_id: userID,
    p_role: role,
  });
  if (error) throw error;
}

export async function removeAlbumMember(albumID: string, userID: string) {
  const client = requireSupabase();
  const { error } = await client.rpc("remove_album_member", {
    p_album_id: albumID,
    p_user_id: userID,
  });
  if (error) throw error;
}
