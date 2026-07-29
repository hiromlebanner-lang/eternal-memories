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
  };
}

describe("認証画面", () => {
  it("初回表示では入力欄へフォーカスせず、自動入力設定を維持する", () => {
    render(<AuthScreen {...authProps()} />);
    const email = screen.getByLabelText("メールアドレス");
    const password = screen.getByLabelText("パスワード");

    expect(document.activeElement).not.toBe(email);
    expect(document.activeElement).not.toBe(password);
    expect(email).not.toHaveAttribute("readonly");
    expect(password).not.toHaveAttribute("readonly");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(password).toHaveAttribute("autocomplete", "current-password");
  });

  it("01 新規登録で表示名・メール・パスワードを渡す", async () => {
    const user = userEvent.setup();
    const props = authProps();
    render(<AuthScreen {...props} />);

    await user.click(screen.getByRole("button", { name: "新規登録" }));
    await user.type(screen.getByLabelText("表示名"), "はなこ");
    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.type(screen.getByLabelText("パスワード"), "password1");
    await user.click(
      screen.getByRole("button", { name: /登録してはじめる/ }),
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

  it("ログインエラーを日本語で表示する", async () => {
    const user = userEvent.setup();
    const props = authProps();
    props.onEmailLogin.mockRejectedValueOnce(
      new Error("Invalid login credentials"),
    );
    render(<AuthScreen {...props} />);

    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.type(screen.getByLabelText("パスワード"), "incorrect");
    await user.click(
      screen.getAllByRole("button", { name: /^ログイン/ }).at(-1)!,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "メールアドレスまたはパスワードが正しくありません。",
    );
    expect(screen.queryByText("Invalid login credentials")).not.toBeInTheDocument();
  });

  it("メール未確認エラーを日本語で表示する", async () => {
    const user = userEvent.setup();
    const props = authProps();
    props.onEmailLogin.mockRejectedValueOnce(new Error("Email not confirmed"));
    render(<AuthScreen {...props} />);

    await user.type(screen.getByLabelText("メールアドレス"), "hana@example.com");
    await user.type(screen.getByLabelText("パスワード"), "password1");
    await user.click(
      screen.getAllByRole("button", { name: /^ログイン/ }).at(-1)!,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "メールアドレスの確認が完了していません。確認メールをご確認ください。",
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

  it("不正なメールアドレスでは再設定処理を呼ばない", async () => {
    const user = userEvent.setup();
    const props = authProps();
    render(<AuthScreen {...props} />);

    await user.click(screen.getByRole("button", { name: "パスワードを忘れた場合" }));
    await user.type(screen.getByLabelText("メールアドレス"), "invalid-email");
    await user.click(screen.getByRole("button", { name: /再設定メールを送信/ }));

    expect(props.onPasswordResetRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "正しいメールアドレスを入力してください",
    );
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
  });
});
