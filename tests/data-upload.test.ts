import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
}));
const photos = vi.hoisted(() => ({
  insert: vi.fn(),
}));
const compressPhotoMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/image", () => ({
  compressPhoto: compressPhotoMock,
}));
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => storage),
    },
    from: vi.fn((table: string) => {
      if (table !== "photos") throw new Error(`Unexpected table: ${table}`);
      return photos;
    }),
  },
}));

import { uploadPhoto } from "../src/lib/data";

beforeEach(() => {
  compressPhotoMock.mockResolvedValue(
    new Blob(["compressed"], { type: "image/jpeg" }),
  );
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
  photos.insert.mockResolvedValue({ error: null });
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "44444444-4444-4444-8444-444444444444",
  );
});

it("写真をPrivate Storageへ保存し、位置情報をDBへ登録する", async () => {
  const file = new File(["photo"], "tokyo.png", { type: "image/png" });

  const result = await uploadPhoto({
    albumID: "11111111-1111-4111-8111-111111111111",
    authorID: "member-1",
    authorName: "はなこ",
    file,
    title: "東京旅行",
    caption: "東京駅",
    category: "scenery",
    capturedAt: "2026-07-25T01:00:00.000Z",
    latitude: 35.681236,
    longitude: 139.767125,
    visibility: "album_only",
  });

  const storagePath =
    "11111111-1111-4111-8111-111111111111/member-1/44444444-4444-4444-8444-444444444444.jpg";
  expect(compressPhotoMock).toHaveBeenCalledWith(file);
  expect(storage.upload).toHaveBeenCalledWith(
    storagePath,
    expect.any(Blob),
    expect.objectContaining({
      contentType: "image/jpeg",
      upsert: false,
    }),
  );
  expect(photos.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      id: result.photoID,
      storage_path: storagePath,
      title: "東京旅行",
      caption: "東京駅",
      latitude: 35.681236,
      longitude: 139.767125,
    }),
  );
  expect(result.photoID).toBe("44444444-4444-4444-8444-444444444444");
});

it("DB登録に失敗した写真をStorageからロールバックする", async () => {
  photos.insert.mockResolvedValueOnce({
    error: {
      code: "42501",
      message: "permission denied for table photos",
    },
  });

  await expect(
    uploadPhoto({
      albumID: "11111111-1111-4111-8111-111111111111",
      authorID: "member-1",
      authorName: "はなこ",
      file: new File(["photo"], "tokyo.jpg", { type: "image/jpeg" }),
      title: "",
      caption: "",
      category: "other",
      capturedAt: "2026-07-25T01:00:00.000Z",
      latitude: 35.681236,
      longitude: 139.767125,
      visibility: "album_only",
    }),
  ).rejects.toThrow(
    "写真を保存できませんでした。ログイン状態またはアルバムの参加権限を確認してください。",
  );

  expect(storage.remove).toHaveBeenCalledWith([
    "11111111-1111-4111-8111-111111111111/member-1/44444444-4444-4444-8444-444444444444.jpg",
  ]);
});
