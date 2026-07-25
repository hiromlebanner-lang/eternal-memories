import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthScreen } from "../src/components/AuthScreen";

function authProps(recoveryMode = false) {
  return {
    configured: true,
    busy: false,
    message: "",
    recoveryMode,
    onEmailLogin: vi.fn(async () => {}),
    onEmailSignup: vi.fn(async () => {}),
    onPasswordResetRequest: vi.fn(async () => {}),
    onPasswordUpdate: vi.fn(async () => {}),
    onGoogleLogin: vi.fn(async () => {}),
    onAppleLogin: vi.fn(async () => {}),
  };
}

describe("認証画面", () => {
  it("01 新規登録で表示名・メール・パスワードを渡す", async () => {
    const user = userEvent.setup();
    const props = authProps();
    render(<AuthScreen {...props} />);

    await user.click(screen.getByRole("button", { name: "新規登録" }));
    await user.type(screen.getByLabelText("表示名"), "はなこ");
    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.type(screen.getByLabelText("パスワード"), "password1");
    await user.click(
      screen.getByRole("button", { name: /登録して確認メールを受け取る/ }),
    );

    expect(props.onEmailSignup).toHaveBeenCalledWith(
      "はなこ",
      "hana@example.com",
      "password1",
    );
  });

  it("03 ログイン情報を送信する", async () => {
    const user = userEvent.setup();
    const props = authProps();
    render(<AuthScreen {...props} />);

    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.type(screen.getByLabelText("パスワード"), "password1");
    await user.click(
      screen.getAllByRole("button", { name: /^ログイン/ }).at(-1)!,
    );

    expect(props.onEmailLogin).toHaveBeenCalledWith(
      "hana@example.com",
      "password1",
    );
  });

  it("05 パスワード再設定メールを要求する", async () => {
    const user = userEvent.setup();
    const props = authProps();
    render(<AuthScreen {...props} />);

    await user.click(screen.getByRole("button", { name: "パスワードを忘れた場合" }));
    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.click(screen.getByRole("button", { name: /再設定メールを送信/ }));

    expect(props.onPasswordResetRequest).toHaveBeenCalledWith("hana@example.com");
  });

  it("05 新しいパスワードの一致を検証して更新する", async () => {
    const user = userEvent.setup();
    const props = authProps(true);
    render(<AuthScreen {...props} />);

    await user.type(screen.getByLabelText("新しいパスワード"), "newpass12");
    await user.type(
      screen.getByLabelText("新しいパスワード（確認）"),
      "newpass12",
    );
    await user.click(screen.getByRole("button", { name: /パスワードを更新/ }));

    expect(props.onPasswordUpdate).toHaveBeenCalledWith("newpass12");
  });

  it("未設定時は全認証操作を無効化して設定警告を出す", () => {
    render(<AuthScreen {...authProps()} configured={false} />);
    expect(screen.getByText(/Supabaseが未設定です/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^ログイン/ }).at(-1),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Googleで続ける" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Appleで続ける" })).toBeDisabled();
  });
});
