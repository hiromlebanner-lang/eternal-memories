import {
  CheckCircle2,
  CalendarDays,
  Clock3,
  Copy,
  Link2,
  Mail,
  RefreshCw,
  Save,
  Send,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createEmailInvitation,
  loadSentAlbumInvitations,
  revokeDirectAlbumInvitation,
  rotateAlbumInviteCode,
  updateAlbumInviteSettings,
} from "../lib/data";
import { buildInviteURL } from "../lib/sharing";
import type { Album, AlbumInvitation, AlbumRole } from "../types";
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

function isShareCancellation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function invitationStatus(invitation: AlbumInvitation, now: number) {
  if (
    invitation.status === "pending" &&
    new Date(invitation.expires_at).getTime() <= now
  )
    return "期限切れ";
  return {
    pending: "回答待ち",
    accepted: "参加済み",
    rejected: "辞退",
    revoked: "無効",
  }[invitation.status];
}

interface ShareAlbumModalProps {
  album: Album;
  onClose: () => void;
  onManageMembers: () => void;
  onNotice: (message: string) => void;
  onSettingsChanged?: () => void | Promise<void>;
}

function dateTimeLocalValue(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 86_400_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ShareAlbumModal({
  album,
  onClose,
  onManageMembers,
  onNotice,
  onSettingsChanged,
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
  const [sentInvitations, setSentInvitations] = useState<AlbumInvitation[]>(
    [],
  );
  const canInvite = isManager || Boolean(album.can_invite);
  const supportsAdvancedInviteSettings =
    album.invite_settings_supported !== false;
  const [inviteCode, setInviteCode] = useState(album.invite_code);
  const [membersCanInvite, setMembersCanInvite] = useState(
    Boolean(album.members_can_invite),
  );
  const [codeEnabled, setCodeEnabled] = useState(
    album.invite_code_enabled ?? true,
  );
  const [expiresAt, setExpiresAt] = useState(() =>
    dateTimeLocalValue(album.invite_code_expires_at),
  );
  const [openedAt] = useState(() => Date.now());
  const [settingsBusy, setSettingsBusy] = useState(false);
  const inviteActive =
    codeEnabled &&
    new Date(expiresAt).getTime() > openedAt &&
    Boolean(inviteCode);
  const genericInviteURL = useMemo(
    () => buildInviteURL("join", inviteCode),
    [inviteCode],
  );
  const invitableRoles = isManager ? INVITABLE_ROLES : ["member" as const];

  useEffect(() => {
    if (!isManager) return;
    let active = true;
    void loadSentAlbumInvitations(album.id)
      .then((invitations) => {
        if (active) setSentInvitations(invitations);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [album.id, isManager]);

  const saveInviteSettings = async () => {
    setSettingsBusy(true);
    setError("");
    try {
      await updateAlbumInviteSettings({
        albumID: album.id,
        membersCanInvite,
        enabled: codeEnabled,
        expiresAt: new Date(expiresAt).toISOString(),
      });
      await onSettingsChanged?.();
      onNotice("このアルバムの招待設定を保存しました");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "招待設定を保存できませんでした。",
      );
    } finally {
      setSettingsBusy(false);
    }
  };

  const rotateInviteCode = async () => {
    setSettingsBusy(true);
    setError("");
    try {
      const nextCode = await rotateAlbumInviteCode(
        album.id,
        new Date(expiresAt).toISOString(),
      );
      setInviteCode(nextCode);
      setCodeEnabled(true);
      await onSettingsChanged?.();
      onNotice("古い招待コードを無効化し、新しいコードを発行しました");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "招待コードを再発行できませんでした。",
      );
    } finally {
      setSettingsBusy(false);
    }
  };

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
    const text = `MapAlbum「${album.name}」への招待です。リンクを開いて参加するか選択してください。`;
    setError("");

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `${album.name}への招待`,
          text,
          url: genericInviteURL,
        });
        onNotice("招待URLを共有しました");
      } catch (caught) {
        if (isShareCancellation(caught)) return;
        setError("共有メニューを開けませんでした。URLをコピーして共有してください。");
      }
      return;
    }

    await copy(genericInviteURL, "招待URLをコピーしました");
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
      if (isManager) {
        setSentInvitations(await loadSentAlbumInvitations(album.id));
      }
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

  const revokeInvitation = async (invitationID: string) => {
    setBusy(true);
    setError("");
    try {
      await revokeDirectAlbumInvitation(invitationID);
      setSentInvitations(await loadSentAlbumInvitations(album.id));
      onNotice("招待を取り消しました");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "招待を取り消せませんでした。",
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

        {canInvite ? (
          <>
            {isManager ? (
              <>
                <button
                  type="button"
                  className="join-request-shortcut"
                  onClick={onManageMembers}
                >
                  <span
                    className="join-request-shortcut__icon"
                    aria-hidden="true"
                  >
                    <Clock3 size={20} />
                  </span>
                  <span>
                    <strong>メンバー管理</strong>
                    <small>参加中のメンバーと権限を確認します</small>
                  </span>
                </button>

                <div className="approval-notice" role="note">
                  <ShieldCheck size={19} aria-hidden="true" />
                  <span>
                    <strong>参加の再承認は不要です</strong>
                    <small>
                      メール・URL・QR・招待コードのどれでも、招待された人が「参加する」を選ぶとすぐ参加できます。
                    </small>
                  </span>
                </div>

                {supportsAdvancedInviteSettings ? (
                  <section
                    className="share-section invite-settings"
                    aria-labelledby="invite-settings-heading"
                  >
                    <div className="section-heading">
                      <CalendarDays size={18} aria-hidden="true" />
                      <strong id="invite-settings-heading">
                        このアルバムの招待設定
                      </strong>
                    </div>
                    <label className="invite-setting-toggle">
                      <span>
                        <strong>一般メンバーの招待を許可</strong>
                        <small>初期値はOFFです。閲覧のみの人は招待できません。</small>
                      </span>
                      <input
                        type="checkbox"
                        aria-label="一般メンバーの招待を許可"
                        checked={membersCanInvite}
                        onChange={(event) =>
                          setMembersCanInvite(event.target.checked)
                        }
                        disabled={settingsBusy}
                      />
                    </label>
                    <label className="field">
                      <span>招待コードの有効期限</span>
                      <input
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                        disabled={settingsBusy}
                      />
                    </label>
                    <label className="invite-setting-toggle">
                      <span>
                        <strong>招待コードを有効にする</strong>
                        <small>OFFにすると現在のURL・QR・コードを停止します。</small>
                      </span>
                      <input
                        type="checkbox"
                        aria-label="招待コードを有効にする"
                        checked={codeEnabled}
                        onChange={(event) =>
                          setCodeEnabled(event.target.checked)
                        }
                        disabled={settingsBusy}
                      />
                    </label>
                    <div className="invite-settings__actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={settingsBusy}
                        onClick={() => void saveInviteSettings()}
                      >
                        <Save size={17} aria-hidden="true" />
                        設定を保存
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={settingsBusy}
                        onClick={() => void rotateInviteCode()}
                      >
                        <RefreshCw size={16} aria-hidden="true" />
                        古いコードを無効化して再発行
                      </button>
                    </div>
                  </section>
                ) : (
                  <div className="approval-notice" role="note">
                    <ShieldCheck size={19} aria-hidden="true" />
                    <span>
                      <strong>基本の招待機能を利用中です</strong>
                      <small>
                        URL・QR・招待コードは利用できます。期限設定とコード再発行はデータベース更新後に利用できます。
                      </small>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="approval-notice" role="note">
                <ShieldCheck size={19} aria-hidden="true" />
                <span>
                  <strong>このアルバムではメンバー招待が許可されています</strong>
                  <small>メールで直接招待した相手は、本人の承諾だけでメンバーとして参加できます。</small>
                </span>
              </div>
            )}

            {!inviteActive ? (
              <p className="form-message form-message--error" role="status">
                このアルバムの招待コードは停止中または期限切れです。管理者が有効化・再発行してください。
              </p>
            ) : null}

            <section
              className="share-section"
              aria-labelledby="share-link-heading"
            >
              <div className="section-heading">
                <Link2 size={18} aria-hidden="true" />
                <strong id="share-link-heading">招待URL</strong>
              </div>

              <label className="invite-link-field">
                <span className="share-sr-only">アルバム参加用URL</span>
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
                    disabled={!inviteActive}
                    aria-label="招待URLをコピー"
                  >
                    <Copy size={18} aria-hidden="true" />
                  </button>
                </span>
              </label>
              <small id="invite-link-help" className="share-section__help">
                URLを受け取った人は、ログイン後に参加するか選択できます。
              </small>

              <button
                className="primary-button"
                type="button"
                onClick={() => void share()}
                disabled={!inviteActive}
              >
                <Share2 size={18} aria-hidden="true" />
                招待URLを共有
              </button>

              {inviteActive ? <InviteQRCode value={genericInviteURL} /> : null}

              <button
                type="button"
                className="invite-code"
                onClick={() =>
                  void copy(inviteCode, "招待コードをコピーしました")
                }
                aria-label={`招待コード ${inviteCode} をコピー`}
                disabled={!inviteActive}
              >
                <span>
                  <small>招待コード</small>
                  <strong>{inviteCode}</strong>
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
                  <span>参加時の権限</span>
                  <select
                    value={role}
                    onChange={(event) =>
                      setRole(
                        event.target.value as Exclude<AlbumRole, "owner">,
                      )
                    }
                    disabled={busy}
                  >
                    {invitableRoles.map((candidate) => (
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
                        ? "相手が「参加する」を押すと、再承認なしでアルバムへ参加します。"
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

              {isManager && sentInvitations.length > 0 ? (
                <div className="stack-form" aria-label="招待済み一覧">
                  <strong>招待済み一覧</strong>
                  {sentInvitations.map((invitation) => (
                    <div className="invite-result" key={invitation.id}>
                      <Mail size={18} aria-hidden="true" />
                      <span>
                        <strong>
                          {invitation.invited_user_name || invitation.email}
                        </strong>
                        <small>
                          {invitation.email}・
                          {ROLE_LABEL[invitation.role]}・
                          {invitationStatus(invitation, openedAt)}・
                          {new Date(invitation.created_at).toLocaleString(
                            "ja-JP",
                          )}
                        </small>
                      </span>
                      {invitation.status === "pending" &&
                      new Date(invitation.expires_at).getTime() > openedAt ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void revokeInvitation(invitation.id)}
                        >
                          取り消す
                        </button>
                      ) : null}
                    </div>
                  ))}
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
          </>
        ) : (
          <div className="permission-notice" role="note">
            <ShieldCheck size={24} aria-hidden="true" />
            <div>
              <strong>このアルバムでは招待が許可されていません</strong>
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
