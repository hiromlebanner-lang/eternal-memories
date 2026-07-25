import type { Album, AlbumPhoto, AlbumRole } from "../src/types";

export function album(role: AlbumRole = "owner"): Album {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "北海道旅行",
    description: "夏の思い出",
    invite_code: "ABCD1234",
    created_by: "owner-1",
    created_at: "2026-07-01T00:00:00.000Z",
    role,
    photo_count: 2,
    member_count: 3,
  };
}

export function photo(
  overrides: Partial<AlbumPhoto> = {},
): AlbumPhoto {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    album_id: "11111111-1111-4111-8111-111111111111",
    author_id: "member-1",
    author_name: "はなこ",
    storage_path:
      "11111111-1111-4111-8111-111111111111/member-1/22222222-2222-4222-8222-222222222222.jpg",
    image_url: "https://example.test/photo.jpg",
    caption: "きれいな景色",
    category: "scenery",
    captured_at: "2026-07-01T03:00:00.000Z",
    created_at: "2026-07-01T04:00:00.000Z",
    latitude: 35.681236,
    longitude: 139.767125,
    ...overrides,
  };
}
