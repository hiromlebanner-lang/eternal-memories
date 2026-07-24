export type AlbumRole = "admin" | "editor" | "viewer";

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
  created_at: string;
  cover_url?: string | null;
  role: AlbumRole;
  photo_count?: number;
  member_count?: number;
}

export interface AlbumMember {
  album_id: string;
  user_id: string;
  role: AlbumRole;
  joined_at: string;
  display_name?: string;
  email?: string;
}

export interface AlbumPhoto {
  id: string;
  album_id: string;
  author_id: string;
  author_name: string;
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
