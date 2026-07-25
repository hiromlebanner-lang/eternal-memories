import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
}));
const albumInsert = vi.hoisted(() => vi.fn());
const albumSingle = vi.hoisted(() => vi.fn());
const albumLimit = vi.hoisted(() => vi.fn());
const albumOrder = vi.hoisted(() => vi.fn());
const albumEqName = vi.hoisted(() => vi.fn());
const albumEqCreator = vi.hoisted(() => vi.fn());
const albumSelect = vi.hoisted(() => vi.fn());
const albums = vi.hoisted(() => ({
  insert: albumInsert,
  select: albumSelect,
}));

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    auth,
    from: vi.fn((table: string) => {
      if (table !== "albums") throw new Error(`Unexpected table: ${table}`);
      return albums;
    }),
  },
}));

import { createAlbum } from "../src/lib/data";

beforeEach(() => {
  auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  albumInsert.mockResolvedValue({ error: null, status: 201, statusText: "Created" });
  albumSelect.mockReturnValue({ eq: albumEqCreator });
  albumEqCreator.mockReturnValue({ eq: albumEqName });
  albumEqName.mockReturnValue({ order: albumOrder });
  albumOrder.mockReturnValue({ limit: albumLimit });
  albumLimit.mockReturnValue({ single: albumSingle });
  albumSingle.mockResolvedValue({
    data: { id: "album-1" },
    error: null,
  });
});

describe("アルバム作成", () => {
  it("RETURNINGを使わずINSERT完了後の別SELECTでIDを取得する", async () => {
    await expect(createAlbum("夏の旅行", "北海道")).resolves.toBe("album-1");

    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(albumInsert).toHaveBeenCalledWith({
      name: "夏の旅行",
      description: "北海道",
    });
    expect(albumSelect).toHaveBeenCalledWith("id");
    expect(albumEqCreator).toHaveBeenCalledWith("created_by", "user-1");
    expect(albumEqName).toHaveBeenCalledWith("name", "夏の旅行");
  });

  it("PostgRESTの構造化エラーを画面へ表示できるErrorへ変換する", async () => {
    albumInsert.mockResolvedValueOnce({
      error: {
        code: "42501",
        message: "new row violates row-level security policy",
      },
    });

    await expect(createAlbum("夏の旅行", "")).rejects.toThrow(
      /albums INSERT.*auth\.uid\(\): user-1.*created_by = auth\.uid\(\).*new row violates row-level security policy/s,
    );
  });

  it("セッションがない場合はINSERTしない", async () => {
    auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    await expect(createAlbum("夏の旅行", "")).rejects.toThrow(
      "ログインし直してからアルバムを作成してください。",
    );
    expect(albumInsert).not.toHaveBeenCalled();
  });
});
