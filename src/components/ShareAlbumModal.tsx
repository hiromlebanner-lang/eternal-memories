import {
  CheckCircle2,
  Copy,
  Link2,
  Mail,
  Send,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { createEmailInvitation } from "../lib/data";
import { buildInviteURL } from "../lib/sharing";
import type { Album, AlbumRole } from "../types";
import { InviteQRCode } from "./InviteQRCode";
import { Modal } from "./Modal";

const ROLE_LABEL: Record<AlbumRole, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
  viewer: "閲覧のみ",
};

const INVITABLE_ROLES: Exclude<AlbumRole, "owner">[] = [
  "admin",
  "member",
  "viewer",
];

interface ShareAlbumModalProps {
  album: Album;
  onClose: () => void;
  onManageMembers: () => void;
  onNotice: (message: string) => void;
}

export function ShareAlbumModal({
  album,
  onClose,
  onManageMembers,
  onNotice,
}: ShareAlbumModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] =
    useState<Exclude<AlbumRole, "owner">>("member");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    link: string;
    emailSent: boolean;
    email: string;
  }>();
  const [error, setError] = useState("");
  const isManager = album.role === "owner" || album.role === "admin";
  const genericInviteURL = useMemo(
    () => buildInviteURL("join", album.invite_code),
    [album.invite_code],
  );

  const copy = async (value: string, message: string) => {
    setError("");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const helper = document.createElement("textarea");
        helper.value = value;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.append(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        if (!copied) throw new Error("Copy failed");
      }
      onNotice(message);
    } catch {
      setError(
        "コピーできませんでした。URLを長押しして、手動でコピーしてください。",
      );
    }
  };

  const share = async () => {
    const text = `MapAlbum「${album.name}」への招待です。参加にはオーナーまたは管理者の承認が必要です。`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${album.name}への招待`,
          text,
          url: genericInviteURL,
        });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("共有メニューを開けませんでした。URLをコピーして共有してください。");
      }
      return;
    }
    await copy(`${text}\n${genericInviteURL}`, "招待URLをコピーしました");
  };

  const submitEmailInvite = async (event: FormEvent) => {
    event.preventDefault();
    const targetEmail = email.trim().toLowerCase();
    setBusy(true);
    setError("");
    setResult(undefined);

    try {
      const next = await createEmailInvitation({
        albumID: album.id,
        email: targetEmail,
        role,
      });
      const link = buildInviteURL("invite", next.invitation.token);
      setResult({ link, emailSent: next.emailSent, email: targetEmail });
      setEmail("");
      onNotice(
        next.emailSent
          ? "招待メールを送信しました"
          : "招待を作成しました。専用URLを相手へ共有してください",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "招待を作成できませんでした。時間をおいて再度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="アルバムを共有" onClose={onClose}>
      <div className="share-panel">
        <header className="share-intro">
          <span className="share-intro__icon" aria-hidden="true">
            <Users size={22} />
          </span>
          <div>
            <h3>{album.name}</h3>
            <p>
              あなたの権限：<strong>{ROLE_LABEL[album.role]}</strong>
            </p>
          </div>
        </header>

        {isManager ? (
          <>
            <div className="approval-notice" role="note">
              <ShieldCheck size={19} aria-hidden="true" />
              <span>
                <strong>参加承認制です</strong>
                <small>
                  招待された人が申請した後、オーナーまたは管理者が承認すると参加できます。
                </small>
              </span>
            </div>

            <section
              className="share-section"
              aria-labelledby="share-link-heading"
            >
              <div className="section-heading">
                <Link2 size={18} aria-hidden="true" />
                <strong id="share-link-heading">招待URL</strong>
              </div>

              <label className="invite-link-field">
                <span className="share-sr-only">参加申請用URL</span>
                <span className="invite-link-row">
                  <input
                    className="invite-link-input"
                    value={genericInviteURL}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    aria-describedby="invite-link-help"
                  />
                  <button
                    type="button"
                    className="compact-icon-button"
                    onClick={() =>
                      void copy(genericInviteURL, "招待URLをコピーしました")
                    }
                    aria-label="招待URLをコピー"
                  >
                    <Copy size={18} aria-hidden="true" />
                  </button>
                </span>
              </label>
              <small id="invite-link-help" className="share-section__help">
                URLを受け取った人は、ログイン後に参加申請できます。
              </small>

              <button
                className="primary-button"
                type="button"
                onClick={() => void share()}
              >
                <Share2 size={18} aria-hidden="true" />
                招待URLを共有
              </button>

              <InviteQRCode value={genericInviteURL} />

              <button
                type="button"
                className="invite-code"
                onClick={() =>
                  void copy(album.invite_code, "招待コードをコピーしました")
                }
                aria-label={`招待コード ${album.invite_code} をコピー`}
              >
                <span>
                  <small>招待コード</small>
                  <strong>{album.invite_code}</strong>
                </span>
                <Copy size={18} aria-hidden="true" />
              </button>
            </section>

            <section
              className="email-invite"
              aria-labelledby="email-invite-heading"
            >
              <div className="section-heading">
                <Mail size={18} aria-hidden="true" />
                <strong id="email-invite-heading">メールアドレスで招待</strong>
              </div>
              <form className="email-invite__form" onSubmit={submitEmailInvite}>
                <label className="field">
                  <span>招待するメールアドレス</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="friend@example.com"
                    autoComplete="email"
                    inputMode="email"
                    required
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  <span>承認後の権限</span>
                  <select
                    value={role}
                    onChange={(event) =>
                      setRole(
                        event.target.value as Exclude<AlbumRole, "owner">,
                      )
                    }
                    disabled={busy}
                  >
                    {INVITABLE_ROLES.map((candidate) => (
                      <option value={candidate} key={candidate}>
                        {ROLE_LABEL[candidate]}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="secondary-button"
                  type="submit"
                  disabled={busy}
                  aria-busy={busy}
                >
                  <Send size={18} aria-hidden="true" />
                  {busy ? "招待を作成中…" : "招待メールを送る"}
                </button>
              </form>

              {result ? (
                <div className="invite-result" role="status" aria-live="polite">
                  <CheckCircle2 size={19} aria-hidden="true" />
                  <span>
                    <strong>
                      {result.emailSent
                        ? `${result.email} へ送信しました`
                        : "招待メールは未送信です"}
                    </strong>
                    <small>
                      {result.emailSent
                        ? "相手が申請すると、参加承認の一覧に表示されます。"
                        : "下の専用URLをコピーして相手へ共有してください。"}
                    </small>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void copy(result.link, "専用の招待URLをコピーしました")
                    }
                  >
                    <Copy size={17} aria-hidden="true" />
                    専用URLをコピー
                  </button>
                </div>
              ) : null}
            </section>

            {error ? (
              <p
                className="form-message form-message--error share-error"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              className="secondary-button"
              type="button"
              onClick={onManageMembers}
            >
              <ShieldCheck size={18} aria-hidden="true" />
              参加申請とメンバーを管理
            </button>
          </>
        ) : (
          <div className="permission-notice" role="note">
            <ShieldCheck size={24} aria-hidden="true" />
            <div>
              <strong>招待はオーナー・管理者のみ利用できます</strong>
              <p>
                オーナーまたは管理者に、招待URLの発行を依頼してください。
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
