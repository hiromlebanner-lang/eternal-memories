import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authCallback: undefined as
    | ((event: string, session: Record<string, unknown> | null) => void)
    | undefined,
  realtimeHandlers: [] as Array<{
    filter: { event?: string; table?: string };
    callback: (payload: {
      new: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => void;
  }>,
}));
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
const data = vi.hoisted(() => ({
  clearPrivateOfflineData: vi.fn(async () => {}),
  createAlbum: vi.fn(),
  deletePhoto: vi.fn(),
  loadAlbumInviteCode: vi.fn(),
  loadAlbums: vi.fn(),
  loadRecentAlbumPhotos: vi.fn(),
  loadMyDirectAlbumInvitations: vi.fn(),
  loadManagedJoinRequests: vi.fn(),
  loadMyPendingJoinRequests: vi.fn(),
  loadPhotos: vi.fn(),
  requestAlbumMembership: vi.fn(),
  updatePhoto: vi.fn(),
  uploadPhoto: vi.fn(),
}));
const fetchMock = vi.fn();

vi.mock("../src/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth,
    channel: vi.fn(() => ({
      on(
        _type: string,
        filter: { event?: string; table?: string },
        callback: (payload: {
          new: Record<string, unknown>;
          old?: Record<string, unknown>;
        }) => void,
      ) {
        state.realtimeHandlers.push({ filter, callback });
        return this;
      },
      subscribe() {
        return this;
      },
    })),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn(async () => ({
        data: { role: "user", suspended: false },
        error: null,
      })),
    },
  },
}));
vi.mock("../src/lib/data", () => data);

import App from "../src/App";

beforeEach(() => {
  state.authCallback = undefined;
  state.realtimeHandlers.length = 0;
  localStorage.clear();
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockImplementation(
    (callback: typeof state.authCallback) => {
      state.authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  );
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.signInWithOAuth.mockResolvedValue({ error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        message:
          "入力内容を確認しました。登録済みのメールアドレスには、パスワード再設定メールを送信します。",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  data.loadAlbums.mockResolvedValue({ data: [], fromCache: false });
  data.loadRecentAlbumPhotos.mockResolvedValue({
    data: [],
    fromCache: false,
  });
  data.loadMyDirectAlbumInvitations.mockResolvedValue([]);
  data.loadManagedJoinRequests.mockResolvedValue([]);
  data.loadMyPendingJoinRequests.mockResolvedValue([]);
  data.loadPhotos.mockResolvedValue({ data: [], fromCache: false });
});

describe("Supabase Auth連携", () => {
  it("01/02 新規登録に確認メール戻り先を設定し、確認案内を表示する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Eternal memoriesにログイン");
    await user.click(screen.getByRole("button", { name: "新規登録" }));
    await user.type(screen.getByLabelText("表示名"), "はなこ");
    await user.type(screen.getByLabelText("メールアドレス"), " Hana@Example.COM ");
    await user.type(screen.getByLabelText("パスワード"), "password1");
    await user.click(
      screen.getByRole("button", { name: /登録してはじめる/ }),
    );

    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "hana@example.com",
        options: expect.objectContaining({
          data: { display_name: "はなこ" },
          emailRedirectTo: "http://localhost:3000/auth/callback",
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("確認メール");
  });

  it("03 ログインをSupabaseへ渡し、セッション前はデータを表示しない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Eternal memoriesにログイン");
    expect(screen.queryByText("まだアルバムがありません")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("メールアドレス"), " Hana@Example.COM ");
    await user.type(screen.getByLabelText("パスワード"), " Password1 ");
    await user.click(
      screen.getAllByRole("button", { name: /^ログイン/ }).at(-1)!,
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "hana@example.com",
      password: " Password1 ",
    });
  });

  it("SIGNED_IN後に遅れて返った初回セッションでログイン状態を上書きしない", async () => {
    let resolveSession:
      | ((value: { data: { session: null }; error: null }) => void)
      | undefined;
    auth.getSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    data.loadAlbums.mockClear();

    render(<App />);
    await waitFor(() => expect(state.authCallback).toBeTypeOf("function"));

    await act(async () => {
      state.authCallback?.("SIGNED_IN", {
        access_token: "signed-in-token",
        user: {
          id: "user-1",
          email: "hana@example.com",
          user_metadata: { display_name: "はなこ" },
        },
      });
    });

    await screen.findByText("まだアルバムがありません");
    expect(data.loadAlbums).toHaveBeenCalledWith("user-1");

    await act(async () => {
      resolveSession?.({ data: { session: null }, error: null });
    });

    expect(
      screen.queryByText("Eternal memoriesにログイン"),
    ).not.toBeInTheDocument();
    expect(data.loadAlbums).toHaveBeenCalledTimes(1);
  });

  it("アルバム取得中と取得成功0件を区別する", async () => {
    let resolveAlbums:
      | ((value: { data: []; fromCache: false }) => void)
      | undefined;
    data.loadAlbums.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAlbums = resolve;
      }),
    );

    render(<App />);
    await waitFor(() => expect(state.authCallback).toBeTypeOf("function"));
    await act(async () => {
      state.authCallback?.("SIGNED_IN", {
        access_token: "slow-login-token",
        user: {
          id: "user-1",
          email: "hana@example.com",
          user_metadata: { display_name: "はなこ" },
        },
      });
    });

    expect(
      await screen.findByText("アルバムを読み込んでいます…"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("まだアルバムがありません"),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveAlbums?.({ data: [], fromCache: false });
    });

    expect(
      await screen.findByText("まだアルバムがありません"),
    ).toBeInTheDocument();
  });

  it("パスワード再設定をSupabaseへ正規化して依頼する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Eternal memoriesにログイン");

    await user.click(screen.getByRole("button", { name: "パスワードを忘れた方" }));
    await user.type(screen.getByLabelText("メールアドレス"), "Hana@Example.COM");
    await user.click(screen.getByRole("button", { name: /再設定メールを送信/ }));

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "hana@example.com",
      {
        redirectTo: "http://localhost:3000/reset-password",
      },
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "迷惑メールフォルダ",
    );
  });

  it("04 セッション確立後にダッシュボードを表示しログアウトする", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Eternal memoriesにログイン");
    await act(async () => {
      state.authCallback?.("SIGNED_IN", {
        user: {
          id: "user-1",
          email: "hana@example.com",
          user_metadata: { display_name: "はなこ" },
        },
      });
    });
    await screen.findByText("まだアルバムがありません");
    await user.click(screen.getAllByRole("button", { name: "設定" })[0]);
    await user.click(screen.getByRole("button", { name: /ログアウト/ }));
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(
      screen.getByText("現在のアカウントからログアウトします。よろしいですか？"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ログアウト" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(data.clearPrivateOfflineData).toHaveBeenCalled();
  });

  it("下部ナビから専用アルバム一覧へ移動できる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Eternal memoriesにログイン");
    await act(async () => {
      state.authCallback?.("SIGNED_IN", {
        user: {
          id: "user-1",
          email: "hana@example.com",
          user_metadata: { display_name: "はなこ" },
        },
      });
    });

    await screen.findByText("まだアルバムがありません");
    const navigation = screen.getByRole("navigation", {
      name: "メインメニュー",
    });
    const buttons = within(navigation).getAllByRole("button");

    expect(buttons[0]).toHaveAccessibleName("地図");
    expect(buttons[1]).toHaveAccessibleName("みんな");
    expect(buttons[2]).toHaveAccessibleName("写真を追加");
    expect(buttons[3]).toHaveAccessibleName("アルバム");
    expect(buttons[4]).toHaveAccessibleName("設定");
    expect(buttons[3]).toHaveClass("is-active");

    await user.click(buttons[0]);
    expect(buttons[0]).toHaveClass("is-active");
    await user.click(buttons[3]);

    expect(buttons[3]).toHaveClass("is-active");
    expect(
      screen.getByRole("heading", { name: "専用アルバム" }),
    ).toBeVisible();
  });

});
