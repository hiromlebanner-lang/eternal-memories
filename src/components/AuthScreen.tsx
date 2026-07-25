import {
  ArrowLeft,
  ArrowRight,
  Chrome,
  KeyRound,
  LockKeyhole,
  Mail,
  Map,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";

type AuthMode = "login" | "signup" | "forgot";

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
  onGoogleLogin: () => Promise<void>;
  onAppleLogin: () => Promise<void>;
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
  onGoogleLogin,
  onAppleLogin,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");

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
      setError(caught instanceof Error ? caught.message : "認証処理に失敗しました。");
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
            <Map size={28} strokeWidth={2.4} />
            <span>●</span>
          </span>
          <span>Eternal memories</span>
        </div>
        <div className="auth-hero-copy">
          <span className="eyebrow">
            <Sparkles size={15} />
            みんなの旅を、みんなの思い出に
          </span>
          <h1>
            <span>思い出は、</span>
            <span className="auth-title-detail">写真をひらくたびに色づいていく。</span>
          </h1>
          <p>
            家族や友だちと、旅の景色や笑顔をひとつのアルバムに。
            <br />
            あの日の写真も、その時の想いも、いつまでも色あせない思い出として残せます。
          </p>
        </div>
        <div className="auth-mini-map" aria-hidden="true">
          <span className="mini-route" />
          <span className="mini-photo mini-photo--one">🌸</span>
          <span className="mini-photo mini-photo--two">🍜</span>
          <span className="mini-photo mini-photo--three">⛩️</span>
        </div>
      </section>

      <section className="auth-panel">
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

          <form className="auth-form" onSubmit={submit}>
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
                      : "登録して確認メールを受け取る"}
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

          {!recoveryMode && mode !== "forgot" ? (
            <>
              <div className="auth-divider">
                <span>または</span>
              </div>

              <div className="social-auth-buttons">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || !configured}
                  onClick={() => void onGoogleLogin()}
                >
                  <Chrome size={19} />
                  Googleで続ける
                </button>
                <button
                  className="secondary-button apple-auth-button"
                  type="button"
                  disabled={busy || !configured}
                  onClick={() => void onAppleLogin()}
                >
                  <span className="apple-mark" aria-hidden="true">
                    
                  </span>
                  Appleで続ける
                </button>
              </div>
            </>
          ) : null}
        </div>
        <p className="auth-footnote">
          アルバムの内容は、ログイン済みかつ参加権限を持つメンバーだけが閲覧できます。
        </p>
      </section>
    </main>
  );
}
