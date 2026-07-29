import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";

type AuthMode = "login" | "signup" | "forgot";

function localizedAuthError(caught: unknown, mode: AuthMode) {
  const error = caught as { code?: string; message?: string };
  const detail = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();

  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(error.message ?? "")) {
    return error.message!;
  }
  if (detail.includes("invalid login credentials")) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  if (detail.includes("email not confirmed")) {
    return "メールアドレスの確認が完了していません。確認メールをご確認ください。";
  }
  if (
    detail.includes("too many requests") ||
    detail.includes("rate limit") ||
    detail.includes("over_email_send_rate_limit")
  ) {
    return "時間を空けてもう一度お試しください。";
  }
  if (
    detail.includes("network") ||
    detail.includes("failed to fetch") ||
    detail.includes("load failed")
  ) {
    return "通信に失敗しました。通信環境をご確認ください。";
  }
  if (detail.includes("user already registered")) {
    return "このメールアドレスはすでに登録されています。";
  }
  if (detail.includes("password") && detail.includes("least")) {
    return "パスワードは8文字以上で入力してください。";
  }
  if (detail.includes("signup") && detail.includes("disabled")) {
    return "現在、新規登録を利用できません。";
  }
  if (
    detail.includes("otp_expired") ||
    detail.includes("token") ||
    detail.includes("expired")
  ) {
    return "リンクの有効期限が切れているか、無効です。もう一度お試しください。";
  }
  return mode === "login"
    ? "ログインできませんでした。時間を空けてもう一度お試しください。"
    : "認証処理に失敗しました。時間を空けてもう一度お試しください。";
}

interface AuthScreenProps {
  configured: boolean;
  busy: boolean;
  message?: string;
  recoveryMode: boolean;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailSignup: (
    displayName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  onPasswordResetRequest: (email: string) => Promise<void>;
  onPasswordUpdate: (password: string) => Promise<void>;
  onGoogleLogin?: () => Promise<void>;
}

export function AuthScreen({
  configured,
  busy,
  message,
  recoveryMode,
  onEmailLogin,
  onEmailSignup,
  onPasswordResetRequest,
  onPasswordUpdate,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useLayoutEffect(() => {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      formRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (recoveryMode) {
        if (password.length < 8) {
          throw new Error("新しいパスワードは8文字以上で入力してください。");
        }
        if (password !== passwordConfirmation) {
          throw new Error("確認用パスワードが一致しません。");
        }
        await onPasswordUpdate(password);
      } else if (mode === "forgot") {
        await onPasswordResetRequest(email);
      } else if (mode === "login") {
        await onEmailLogin(email, password);
      } else {
        await onEmailSignup(displayName, email, password);
      }
    } catch (caught) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        formRef.current?.contains(activeElement)
      ) {
        activeElement.blur();
      }
      setError(localizedAuthError(caught, mode));
    }
  };

  const heading = recoveryMode
    ? "新しいパスワードを設定"
    : mode === "signup"
      ? "アカウントを作成"
      : mode === "forgot"
        ? "パスワードを再設定"
        : "Eternal memoriesにログイン";

  return (
    <main className="auth-screen">
      <section className="auth-hero" aria-label="Eternal memoriesについて">
        <div className="brand-lockup">
          <span className="brand-mark">
            <img
              className="brand-app-icon"
              src="/eternal-memories-map-pin.jpg"
              alt=""
            />
          </span>
          <span>Eternal memories</span>
        </div>
        <div className="auth-hero-copy">
          <span className="eyebrow">
            <Sparkles size={15} />
            みんなの旅を、みんなの思い出に
          </span>
          <h1>
            <span>思い出は</span>
            <span className="auth-title-detail">写真をひらくたびに色づいていく。</span>
          </h1>
        </div>
      </section>

      <section className="auth-panel">
        <p className="auth-description">
          Eternal memoriesは、撮影場所と一緒に大切な思い出を地図へ残し、
          <br />
          家族や友人と共有できる写真アルバムです。
        </p>
        <div className="auth-card">
          <div className="auth-heading">
            <p>{recoveryMode ? "安全なパスワードへ更新" : "おかえりなさい"}</p>
            <h2>{heading}</h2>
          </div>

          {!recoveryMode && mode !== "forgot" ? (
            <div className="auth-mode" role="tablist" aria-label="認証方法">
              <button
                type="button"
                className={mode === "login" ? "is-active" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                ログイン
              </button>
              <button
                type="button"
                className={mode === "signup" ? "is-active" : ""}
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
              >
                新規登録
              </button>
            </div>
          ) : null}

          {mode === "forgot" && !recoveryMode ? (
            <p className="auth-intro">
              登録したメールアドレスへ、パスワード再設定リンクを送信します。
            </p>
          ) : null}

          {recoveryMode ? (
            <p className="auth-intro">
              8文字以上の新しいパスワードを入力してください。更新後は一度ログアウトします。
            </p>
          ) : null}

          <form ref={formRef} className="auth-form" onSubmit={submit}>
            {mode === "signup" && !recoveryMode ? (
              <label>
                <span>表示名</span>
                <div className="input-shell">
                  <Sparkles size={18} />
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="例：はなこ"
                    autoComplete="name"
                    required
                  />
                </div>
              </label>
            ) : null}

            {!recoveryMode ? (
              <label>
                <span>メールアドレス</span>
                <div className="input-shell">
                  <Mail size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    onInvalid={(event) => {
                      if (mode === "forgot") {
                        event.preventDefault();
                        setError("正しいメールアドレスを入力してください");
                      }
                    }}
                    inputMode="email"
                    required
                  />
                </div>
              </label>
            ) : null}

            {mode !== "forgot" || recoveryMode ? (
              <label>
                <span>{recoveryMode ? "新しいパスワード" : "パスワード"}</span>
                <div className="input-shell">
                  <LockKeyhole size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={recoveryMode ? "8文字以上" : "8文字以上"}
                    autoComplete={
                      recoveryMode || mode === "signup"
                        ? "new-password"
                        : "current-password"
                    }
                    minLength={8}
                    required
                  />
                </div>
              </label>
            ) : null}

            {recoveryMode ? (
              <label>
                <span>新しいパスワード（確認）</span>
                <div className="input-shell">
                  <KeyRound size={18} />
                  <input
                    type="password"
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    placeholder="もう一度入力"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </label>
            ) : null}

            {mode === "login" && !recoveryMode ? (
              <button
                className="forgot-password-button"
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                }}
              >
                パスワードを忘れた場合
              </button>
            ) : null}

            {error || message ? (
              <p
                role={error ? "alert" : "status"}
                className={error ? "form-message form-message--error" : "form-message"}
              >
                {error || message}
              </p>
            ) : null}

            {!configured ? (
              <p className="form-message form-message--error">
                Supabaseが未設定です。管理者はREADMEの手順で接続情報を設定してください。
              </p>
            ) : null}

            <button className="primary-button" type="submit" disabled={busy || !configured}>
              {busy
                ? "しばらくお待ちください…"
                : recoveryMode
                  ? "パスワードを更新"
                  : mode === "forgot"
                    ? "再設定メールを送信"
                    : mode === "login"
                      ? "ログイン"
                      : "登録してはじめる"}
              {!busy ? <ArrowRight size={18} /> : null}
            </button>

            {mode === "forgot" && !recoveryMode ? (
              <button
                className="back-to-login"
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                <ArrowLeft size={16} />
                ログインへ戻る
              </button>
            ) : null}
          </form>
        </div>
      </section>
    </main>
  );
}
