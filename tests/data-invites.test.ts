import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const albumsOrder = vi.hoisted(() => vi.fn());
const albumsSelect = vi.hoisted(() => vi.fn(() => ({ order: albumsOrder })));
const membershipsEq = vi.hoisted(() => vi.fn());
const albumMembersSelect = vi.hoisted(() =>
  vi.fn((columns: string) =>
    columns === "album_id, role"
      ? { eq: membershipsEq }
      : Promise.resolve({ data: [{ album_id: "album-1" }], error: null }),
  ),
);
const photosSelect = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({ data: [{ album_id: "album-1" }], error: null }),
  ),
);
const from = vi.hoisted(() =>
  vi.fn((table: string) => {
    if (table === "albums") return { select: albumsSelect };
    if (table === "album_members") return { select: albumMembersSelect };
    if (table === "photos") return { select: photosSelect };
    throw new Error(`Unexpected table: ${table}`);
  }),
);

vi.mock("idb-keyval", () => ({
  del: vi.fn(),
  get: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
  set: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/supabase", () => ({
  supabase: { from, rpc },
}));

import {
  loadAlbumInviteSettings,
  loadAlbums,
  requestAlbumMembership,
} from "../src/lib/data";

beforeEach(() => {
  vi.clearAllMocks();
  membershipsEq.mockResolvedValue({
    data: [{ album_id: "album-1", role: "owner" }],
    error: null,
  });
});

describe("招待情報の旧スキーマ互換", () => {
  it("新しい設定RPCが未適用なら従来の招待コードRPCへフォールバックする", async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.get_album_invite_settings(p_album_id) in the schema cache",
        },
      })
      .mockResolvedValueOnce({ data: "LEGACYCODE123456", error: null });

    await expect(loadAlbumInviteSettings("album-1")).resolves.toEqual(
      expect.objectContaining({
        invite_code: "LEGACYCODE123456",
        invite_code_enabled: true,
        members_can_invite: false,
        can_manage: true,
        can_invite: true,
        supports_advanced_settings: false,
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(1, "get_album_invite_settings", {
      p_album_id: "album-1",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "get_album_invite_code", {
      p_album_id: "album-1",
    });
  });

  it("予期しないPostgRESTエラーは固定文言へ置換せず詳細を保持する", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for function get_album_invite_settings",
        hint: "Check the authenticated grant",
      },
    });

    await expect(loadAlbumInviteSettings("album-1")).rejects.toThrow(
      /permission denied.*code: 42501.*Check the authenticated grant/s,
    );
  });

  it("招待URLのtokenと招待コードをRPCパラメータへそのまま渡す", async () => {
    rpc.mockResolvedValue({ data: "request-1", error: null });

    await requestAlbumMembership({
      inviteCode: "ABCD1234",
      inviteToken: "7e85cf0e-567c-4e7c-b0c3-c06f81bbf220",
    });

    expect(rpc).toHaveBeenCalledWith("request_album_membership", {
      p_invite_code: "ABCD1234",
      p_invite_token: "7e85cf0e-567c-4e7c-b0c3-c06f81bbf220",
    });
  });

  it("owner_id未作成なら従来カラムでアルバムを再取得する", async () => {
    albumsOrder
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "42703",
          message: "column albums.owner_id does not exist",
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "album-1",
            name: "思い出",
            description: "",
            created_by: "user-1",
            created_at: "2026-07-25T00:00:00.000Z",
          },
        ],
        error: null,
      });

    const result = await loadAlbums("user-1");

    expect(albumsSelect).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("owner_id"),
    );
    expect(albumsSelect).toHaveBeenNthCalledWith(
      2,
      "id, name, description, created_by, created_at",
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: "album-1",
        owner_id: "user-1",
        role: "owner",
        members_can_invite: false,
      }),
    );
  });
});
