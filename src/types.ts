export type AlbumRole = "owner" | "admin" | "member" | "viewer";

export type PhotoCategory =
  | "scenery"
  | "food"
  | "activity"
  | "stay"
  | "people"
  | "other";

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface Album {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_by: string;
  owner_id?: string;
  created_at: string;
  members_can_invite?: boolean;
  can_invite?: boolean;
  invite_code_enabled?: boolean;
  invite_code_expires_at?: string;
  invite_settings_supported?: boolean;
  cover_url?: string | null;
  role: AlbumRole;
  photo_count?: number;
  member_count?: number;
}

export interface AlbumInviteSettings {
  invite_code: string;
  invite_code_enabled: boolean;
  invite_code_expires_at: string;
  members_can_invite: boolean;
  can_manage: boolean;
  can_invite: boolean;
  supports_advanced_settings: boolean;
}

export interface AlbumMember {
  album_id: string;
  user_id: string;
  role: AlbumRole;
  joined_at: string;
  display_name?: string;
  email?: string;
  avatar_url?: string | null;
}

export interface AlbumInvitation {
  id: string;
  album_id: string;
  email: string;
  token: string;
  role: Exclude<AlbumRole, "owner">;
  status: "pending" | "accepted" | "rejected" | "revoked";
  created_at: string;
  expires_at: string;
}

export interface AlbumJoinRequest {
  id: string;
  album_id: string;
  user_id: string;
  invitation_id?: string | null;
  requested_role: Exclude<AlbumRole, "owner">;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  album_name?: string;
  display_name?: string;
  email?: string;
  avatar_url?: string | null;
}

export interface NearbyUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface NearbyInvitation {
  id: string;
  albumId: string;
  albumName: string;
  invitedBy: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
}

export interface AlbumPhoto {
  id: string;
  album_id: string;
  author_id: string;
  author_name: string;
  author_avatar_url?: string | null;
  storage_path: string;
  image_url: string;
  caption: string;
  category: PhotoCategory;
  captured_at: string;
  created_at: string;
  latitude: number;
  longitude: number;
}

export interface PhotoDraft {
  file: File;
  previewUrl: string;
  caption: string;
  category: PhotoCategory;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
}

export interface PhotoLocationGroup {
  id: string;
  latitude: number;
  longitude: number;
  photos: AlbumPhoto[];
}

export const CATEGORY_META: Record<
  PhotoCategory,
  { label: string; emoji: string; color: string }
> = {
  scenery: { label: "景色", emoji: "🌿", color: "#52a86b" },
  food: { label: "グルメ", emoji: "🍜", color: "#f09a3e" },
  activity: { label: "体験", emoji: "🎒", color: "#4e94d4" },
  stay: { label: "宿泊", emoji: "🏡", color: "#7a6cc7" },
  people: { label: "人物", emoji: "😊", color: "#ed7397" },
  other: { label: "その他", emoji: "✨", color: "#9b72cf" },
};
