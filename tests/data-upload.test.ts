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

  const id = await uploadPhoto({
    albumID: "11111111-1111-4111-8111-111111111111",
    authorID: "member-1",
    authorName: "はなこ",
    file,
    caption: "東京駅",
    category: "scenery",
    capturedAt: "2026-07-25T01:00:00.000Z",
    latitude: 35.681236,
    longitude: 139.767125,
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
      id,
      storage_path: storagePath,
      caption: "東京駅",
      latitude: 35.681236,
      longitude: 139.767125,
    }),
  );
  expect(id).toBe("44444444-4444-4444-8444-444444444444");
});

it("DB登録に失敗した写真をStorageからロールバックする", async () => {
  photos.insert.mockResolvedValueOnce({
    error: new Error("insert failed"),
  });

  await expect(
    uploadPhoto({
      albumID: "11111111-1111-4111-8111-111111111111",
      authorID: "member-1",
      authorName: "はなこ",
      file: new File(["photo"], "tokyo.jpg", { type: "image/jpeg" }),
      caption: "",
      category: "other",
      capturedAt: "2026-07-25T01:00:00.000Z",
      latitude: 35.681236,
      longitude: 139.767125,
    }),
  ).rejects.toThrow("insert failed");

  expect(storage.remove).toHaveBeenCalledWith([
    "11111111-1111-4111-8111-111111111111/member-1/44444444-4444-4444-8444-444444444444.jpg",
  ]);
});
