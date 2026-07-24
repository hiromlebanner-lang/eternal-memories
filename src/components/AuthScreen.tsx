import { ArrowRight, Chrome, LockKeyhole, Mail, Map, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

interface AuthScreenProps {
  demoMode: boolean;
  busy: boolean;
  message?: string;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailSignup: (
    displayName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onOpenDemo: () => void;
}

export function AuthScreen({
  demoMode,
  busy,
  message,
  onEmailLogin,
  onEmailSignup,
  onGoogleLogin,
  onOpenDemo,
}: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (mode === "login") await onEmailLogin(email, password);
      else await onEmailSignup(displayName, email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ログインできませんでした。");
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-hero" aria-label="MapAlbumについて">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Map size={28} strokeWidth={2.4} />
            <span>●</span>
          </span>
          <span>MapAlbum</span>
        </div>
        <div className="auth-hero-copy">
          <span className="eyebrow">
            <Sparkles size={15} />
            みんなの旅を、ひとつの地図へ
          </span>
          <h1>
            写真をひらくと、
            <br />
            あの日の場所が見える。
          </h1>
          <p>
            家族や友だちと同じアルバムに投稿。写真、ことば、撮影場所を
            かわいい丸いアイコンで日本地図に残せます。
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
            <p>おかえりなさい</p>
            <h2>{mode === "login" ? "MapAlbumにログイン" : "アカウントを作成"}</h2>
          </div>

          <div className="auth-mode" role="tablist" aria-label="認証方法">
            <button
              type="button"
              className={mode === "login" ? "is-active" : ""}
              onClick={() => setMode("login")}
            >
              ログイン
            </button>
            <button
              type="button"
              className={mode === "signup" ? "is-active" : ""}
              onClick={() => setMode("signup")}
            >
              新規登録
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "signup" ? (
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
                  required
                />
              </div>
            </label>

            <label>
              <span>パスワード</span>
              <div className="input-shell">
                <LockKeyhole size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="6文字以上"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={6}
                  required
                />
              </div>
            </label>

            {error || message ? (
              <p className={error ? "form-message form-message--error" : "form-message"}>
                {error || message}
              </p>
            ) : null}

            <button className="primary-button" type="submit" disabled={busy || demoMode}>
              {busy ? "しばらくお待ちください…" : mode === "login" ? "ログイン" : "登録する"}
              {!busy ? <ArrowRight size={18} /> : null}
            </button>
          </form>

          <div className="auth-divider">
            <span>または</span>
          </div>

          <button
            className="secondary-button"
            type="button"
            disabled={busy || demoMode}
            onClick={() => void onGoogleLogin()}
          >
            <Chrome size={19} />
            Googleで続ける
          </button>

          {demoMode ? (
            <div className="demo-entry">
              <p>
                Supabase設定前です。完成画面と操作感はデモデータで確認できます。
              </p>
              <button type="button" onClick={onOpenDemo}>
                デモを開く
                <ArrowRight size={16} />
              </button>
            </div>
          ) : null}
        </div>
        <p className="auth-footnote">
          続行すると、アルバム参加者に表示名と投稿写真が共有されます。
        </p>
      </section>
    </main>
  );
}
