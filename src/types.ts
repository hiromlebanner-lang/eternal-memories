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
  cover_photo_id?: string | null;
  owner_name?: string;
  updated_at?: string;
  visibility?: "private" | "limited" | "public";
  icon?: string;
  theme_color?: string;
  is_favorite?: boolean;
  folder_id?: string | null;
  folder_name?: string | null;
  tags?: string[];
  member_names?: string[];
  last_viewed_at?: string | null;
  offline_enabled?: boolean;
  role: AlbumRole;
  photo_count?: number;
  member_count?: number;
}

export interface AlbumFolder {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  theme_color: string;
  created_at: string;
  updated_at: string;
}

export type AlbumSort =
  | "updated"
  | "created"
  | "name"
  | "photos"
  | "favorites";

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
  album_name?: string;
  invited_by?: string;
  invited_by_name?: string;
  invited_user_name?: string | null;
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
  album_id: string | null;
  author_id: string;
  author_name: string;
  author_avatar_url?: string | null;
  storage_path: string;
  image_url: string;
  title?: string;
  caption: string;
  category: PhotoCategory;
  captured_at: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  visibility?: "album_only" | "global";
}

export interface PhotoUploadFailure {
  file: File;
  reason: string;
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

export interface DriveRoutePoint {
  latitude: number;
  longitude: number;
  recorded_at: string;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  sequence_no: number;
}

export interface DriveCoordinate {
  latitude: number;
  longitude: number;
}

export interface DriveDestination extends DriveCoordinate {
  id: string;
  name: string;
  address: string;
}

export interface PlannedDriveRoute {
  coordinates: DriveCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  fetchedAt: string;
}

export interface DriveLog {
  id: string;
  user_id: string;
  title: string;
  started_at: string;
  ended_at: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  start_label: string;
  end_label: string;
  distance_meters: number;
  actual_distance_meters?: number;
  duration_seconds: number;
  actual_duration_seconds?: number;
  destination_name: string | null;
  destination_address: string | null;
  destination_latitude: number | null;
  destination_longitude: number | null;
  planned_distance_meters: number | null;
  planned_duration_seconds: number | null;
  planned_route: DriveCoordinate[] | null;
  created_at: string;
}

export interface DriveDistanceSummary {
  todayMeters: number;
  weekMeters: number;
  monthMeters: number;
  totalMeters: number;
  weekStart: string;
  weekEnd: string;
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
