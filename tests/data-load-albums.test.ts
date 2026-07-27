import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  albumRows: [] as Array<Record<string, unknown>>,
  albumError: null as unknown,
  membershipRows: [] as Array<Record<string, unknown>>,
  membershipError: null as unknown,
  photoRows: [] as Array<Record<string, unknown>>,
  photoError: null as unknown,
  memberRows: [] as Array<Record<string, unknown>>,
  memberError: null as unknown,
}));

const cache = vi.hoisted(() => ({
  albums: undefined as unknown,
}));

const supabase = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("idb-keyval", () => ({
  del: vi.fn(),
  get: vi.fn(async () => cache.albums),
  keys: vi.fn(async () => []),
  set: vi.fn(async () => undefined),
}));

vi.mock("../src/lib/supabase", () => ({ supabase }));

import { loadAlbums } from "../src/lib/data";

beforeEach(() => {
  database.albumRows = [];
  database.albumError = null;
  database.membershipRows = [];
  database.membershipError = null;
  database.photoRows = [];
  database.photoError = null;
  database.memberRows = [];
  database.memberError = null;
  cache.albums = undefined;

  supabase.from.mockImplementation((table: string) => ({
    select(columns: string) {
      if (table === "albums") {
        return {
          order: vi.fn(async () => ({
            data: database.albumRows,
            error: database.albumError,
          })),
        };
      }
      if (table === "album_members" && columns === "album_id, role") {
        return {
          eq: vi.fn(async () => ({
            data: database.membershipRows,
            error: database.membershipError,
          })),
        };
      }
      if (table === "album_members") {
        return Promise.resolve({
          data: database.memberRows,
          error: database.memberError,
        });
      }
      if (table === "photos") {
        return Promise.resolve({
          data: database.photoRows,
          error: database.photoError,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }));
});

describe("アルバム一覧取得", () => {
  it("メンバー行がなくてもowner_idが一致するアルバムを表示する", async () => {
    database.albumRows = [
      {
        id: "owned",
        name: "オーナーのアルバム",
        description: "",
        owner_id: "user-1",
        created_by: "user-1",
        created_at: "2026-07-27T00:00:00Z",
        members_can_invite: false,
      },
    ];

    const result = await loadAlbums("user-1");

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "owned", role: "owner" });
  });

  it("オーナーと参加メンバーのアルバムを重複なしで返す", async () => {
    database.albumRows = [
      {
        id: "owned",
        name: "オーナーのアルバム",
        description: "",
        owner_id: "user-1",
        created_by: "user-1",
        created_at: "2026-07-27T00:00:00Z",
        members_can_invite: false,
      },
      {
        id: "joined",
        name: "参加中のアルバム",
        description: "",
        owner_id: "user-2",
        created_by: "user-2",
        created_at: "2026-07-26T00:00:00Z",
        members_can_invite: true,
      },
      {
        id: "joined",
        name: "参加中のアルバム",
        description: "",
        owner_id: "user-2",
        created_by: "user-2",
        created_at: "2026-07-26T00:00:00Z",
        members_can_invite: true,
      },
    ];
    database.membershipRows = [{ album_id: "joined", role: "member" }];

    const result = await loadAlbums("user-1");

    expect(result.data.map(({ id, role }) => ({ id, role }))).toEqual([
      { id: "owned", role: "owner" },
      { id: "joined", role: "member" },
    ]);
  });

  it("取得エラーをアルバム0件として扱わない", async () => {
    database.membershipError = {
      code: "42501",
      message: "row-level security denied",
    };

    await expect(loadAlbums("user-1")).rejects.toMatchObject({
      code: "42501",
    });
  });
});
