import { act, render, screen, waitFor } from "@testing-library/react";
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
  loadManagedJoinRequests: vi.fn(),
  loadMyPendingJoinRequests: vi.fn(),
  loadPhotos: vi.fn(),
  requestAlbumMembership: vi.fn(),
  updatePhoto: vi.fn(),
  uploadPhoto: vi.fn(),
}));

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
  data.loadAlbums.mockResolvedValue({ data: [], fromCache: false });
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
    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.type(screen.getByLabelText("パスワード"), "password1");
    await user.click(
      screen.getByRole("button", { name: /登録して確認メールを受け取る/ }),
    );

    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "hana@example.com",
        options: expect.objectContaining({
          data: { display_name: "はなこ" },
          emailRedirectTo: expect.stringContaining(window.location.origin),
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("確認メール");
  });

  it("03 ログインをSupabaseへ渡し、セッション前はデータを表示しない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Eternal memoriesにログイン");
    expect(screen.queryByText("最初のアルバムを作りましょう")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.type(screen.getByLabelText("パスワード"), "password1");
    await user.click(
      screen.getAllByRole("button", { name: /^ログイン/ }).at(-1)!,
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "hana@example.com",
      password: "password1",
    });
  });

  it("Googleログインへ現在のURLを戻り先として渡す", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Eternal memoriesにログイン");

    await user.click(screen.getByRole("button", { name: "Googleで続ける" }));
    expect(auth.signInWithOAuth).toHaveBeenLastCalledWith({
      provider: "google",
      options: { redirectTo: expect.stringContaining(window.location.origin) },
    });

  });

  it("パスワード再設定にrecovery付きの戻り先を設定する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Eternal memoriesにログイン");

    await user.click(screen.getByRole("button", { name: "パスワードを忘れた場合" }));
    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.click(screen.getByRole("button", { name: /再設定メールを送信/ }));

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "hana@example.com",
      {
        redirectTo: expect.stringMatching(/[?&]auth=recovery(?:&|$)/),
      },
    );
    expect(await screen.findByRole("status")).toHaveTextContent("再設定メール");
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
    await screen.findByText("最初のアルバムを作りましょう");
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

});
