import { del, get, keys, set } from "idb-keyval";
import type {
  Album,
  AlbumInvitation,
  AlbumJoinRequest,
  AlbumMember,
  AlbumPhoto,
  AlbumRole,
  PhotoCategory,
} from "../types";
import { compressPhoto } from "./image";
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

export async function loadAlbums(userID: string): Promise<LoadResult<Album[]>> {
  const client = requireSupabase();

  try {
    const [
      { data: albumRows, error: albumError },
      { data: membershipRows, error: membershipError },
      { data: photoRows },
      { data: memberRows },
    ] = await Promise.all([
      client.from("albums").select("*").order("created_at", { ascending: false }),
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
        (album): Album => ({
          id: album.id,
          name: album.name,
          description: album.description ?? "",
          invite_code: album.invite_code,
          created_by: album.created_by,
          created_at: album.created_at,
          cover_url: null,
          role: roleByAlbum.get(album.id) ?? "viewer",
          photo_count: photoCounts.get(album.id) ?? 0,
          member_count: memberCounts.get(album.id) ?? 1,
        }),
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
  const { data, error } = await client
    .from("albums")
    .insert({ name, description })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
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
  if (error) throw error;
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
  if (error) throw error;

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
  const { error } = await client.from("photos").update(updates).eq("id", photoID);
  if (error) throw error;
}

export async function deletePhoto(photo: AlbumPhoto) {
  const client = requireSupabase();
  const { error } = await client.from("photos").delete().eq("id", photo.id);
  if (error) throw error;
  if (photo.storage_path) {
    await client.storage.from("album-photos").remove([photo.storage_path]);
  }
}

export async function loadMembers(albumID: string): Promise<AlbumMember[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("album_members")
    .select("album_id, user_id, role, joined_at, profiles(display_name, email)")
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
      "id, album_id, user_id, invitation_id, requested_role, status, created_at, profiles(display_name, email)",
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
    };
  });
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
