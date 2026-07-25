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
const photoCacheKey = (albumID: string) => `mapalbum:photos:${albumID}`;

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
    await Promise.allSettled([
      caches.delete("mapalbum-photo-cache"),
      caches.delete("mapalbum-api-cache"),
    ]);
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
    /owner_id|members_can_invite|invite_code_enabled|invite_code_expires_at/i.test(
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
  const client = requireSupabase();

  try {
    const loadAlbumRows = async () => {
      const current = await client
        .from("albums")
        .select(
          "id, name, description, owner_id, created_by, created_at, members_can_invite",
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
      { data: photoRows },
      { data: memberRows },
    ] = await Promise.all([
      loadAlbumRows(),
      client
        .from("album_members")
        .select("album_id, role")
        .eq("user_id", userID),
      client.from("photos").select("album_id"),
      client.from("album_members").select("album_id"),
    ]);

    if (albumError) throw albumError;
    if (membershipError) throw membershipError;

    const roleByAlbum = new Map(
      (membershipRows ?? []).map((membership) => [
        membership.album_id,
        membership.role as AlbumRole,
      ]),
    );
    const photoCounts = new Map<string, number>();
    const memberCounts = new Map<string, number>();

    for (const row of photoRows ?? []) {
      photoCounts.set(row.album_id, (photoCounts.get(row.album_id) ?? 0) + 1);
    }
    for (const row of memberRows ?? []) {
      memberCounts.set(row.album_id, (memberCounts.get(row.album_id) ?? 0) + 1);
    }

    const albums = (albumRows ?? [])
      .filter((album) => roleByAlbum.has(album.id))
      .map(
        (album): Album => {
          const ownerID =
            "owner_id" in album && typeof album.owner_id === "string"
              ? album.owner_id
              : album.created_by;
          const membersCanInvite =
            "members_can_invite" in album &&
            Boolean(album.members_can_invite);
          const role = roleByAlbum.get(album.id) ?? "viewer";

          return {
            id: album.id,
            name: album.name,
            description: album.description ?? "",
            invite_code: "",
            created_by: album.created_by,
            owner_id: ownerID,
            created_at: album.created_at,
            members_can_invite: membersCanInvite,
            can_invite:
              role === "owner" ||
              role === "admin" ||
              (role === "member" && membersCanInvite),
            cover_url: null,
            role,
            photo_count: photoCounts.get(album.id) ?? 0,
            member_count: memberCounts.get(album.id) ?? 1,
          };
        },
      );

    await set(albumCacheKey(userID), albums);
    return { data: albums, fromCache: false };
  } catch (error) {
    const cached = await get<Album[]>(albumCacheKey(userID));
    if (cached) return { data: cached, fromCache: true };
    throw error;
  }
}

export async function loadPhotos(
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
      caption: photo.caption ?? "",
      category: photo.category as PhotoCategory,
      captured_at: photo.captured_at,
      created_at: photo.created_at,
      latitude: Number(photo.latitude),
      longitude: Number(photo.longitude),
    }));

    await set(photoCacheKey(albumID), photos);
    return { data: photos, fromCache: false };
  } catch (error) {
    const cached = await get<AlbumPhoto[]>(photoCacheKey(albumID));
    if (cached) return { data: cached, fromCache: true };
    throw error;
  }
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
  albumID: string;
  authorID: string;
  authorName: string;
  file: File;
  caption: string;
  category: PhotoCategory;
  capturedAt: string;
  latitude: number;
  longitude: number;
}) {
  const client = requireSupabase();
  const photoID = crypto.randomUUID();
  const storagePath = `${input.albumID}/${input.authorID}/${photoID}.jpg`;
  const compressed = await compressPhoto(input.file);

  const { error: uploadError } = await client.storage
    .from("album-photos")
    .upload(storagePath, compressed, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: insertError } = await client.from("photos").insert({
    id: photoID,
    album_id: input.albumID,
    author_id: input.authorID,
    author_name: input.authorName,
    storage_path: storagePath,
    caption: input.caption,
    category: input.category,
    captured_at: input.capturedAt,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  if (insertError) {
    await client.storage.from("album-photos").remove([storagePath]);
    throw insertError;
  }

  return photoID;
}

export async function updatePhoto(
  photoID: string,
  updates: {
    caption: string;
    category: PhotoCategory;
    captured_at: string;
    latitude: number;
    longitude: number;
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
