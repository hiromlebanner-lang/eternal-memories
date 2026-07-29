import {
  ChevronLeft,
  ChevronRight,
  History,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  changeSiteRole,
  deleteManagedUser,
  loadAdminAuditLogs,
  loadManagedUsers,
  reactivateManagedUser,
  suspendManagedUser,
} from "../lib/siteAdmin";
import type {
  AdminAuditLog,
  ManagedUser,
  SiteAdminContext,
  SiteRole,
} from "../lib/siteAdmin";
import { Modal } from "./Modal";

const ROLE_LABEL: Record<SiteRole, string> = {
  site_admin: "サイト管理者",
  moderator: "モデレーター",
  user: "一般ユーザー",
};

const ACTION_LABEL: Record<string, string> = {
  initial_site_admin_granted: "初期サイト管理者を設定",
  role_changed: "権限を変更",
  user_suspended: "アカウントを停止",
  user_reactivated: "アカウント停止を解除",
  user_deleted: "ユーザーを登録解除",
};

type Confirmation =
  | { kind: "role"; user: ManagedUser; nextRole: SiteRole; text: string }
  | { kind: "suspend"; user: ManagedUser; reason: string; until: string }
  | { kind: "reactivate"; user: ManagedUser; reason: string }
  | { kind: "delete-first"; user: ManagedUser }
  | { kind: "delete-final"; user: ManagedUser; text: string; reason: string };

interface SiteAdminPanelProps {
  context: SiteAdminContext;
  onNotice: (message: string) => void;
}

function formatDate(value: string | null) {
  if (!value) return "未確認";
  return new Date(value).toLocaleString("ja-JP");
}

function shortID(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function SiteAdminPanel({
  context,
  onNotice,
}: SiteAdminPanelProps) {
  const [tab, setTab] = useState<"users" | "audit">("users");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<SiteRole>("user");
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const perPage = 20;

  const refreshUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadManagedUsers({
        page,
        perPage,
        search,
        sort,
      });
      setUsers(result.users);
      setTotal(result.total);
      setSelectedUser((current) =>
        current
          ? (result.users.find((user) => user.id === current.id) ?? null)
          : null,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "ユーザー情報を取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, sort]);

  const refreshAudit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loadAdminAuditLogs(auditPage, perPage);
      setLogs(result.logs);
      setAuditTotal(result.total);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "管理操作履歴を取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [auditPage]);

  useEffect(() => {
    if (tab === "users") void refreshUsers();
    else void refreshAudit();
  }, [refreshAudit, refreshUsers, tab]);

  useEffect(() => {
    if (selectedUser) setSelectedRole(selectedUser.role);
  }, [selectedUser]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const auditPages = Math.max(1, Math.ceil(auditTotal / perPage));
  const selfSelected = selectedUser?.id === context.userId;
  const protectedAdmin = selectedUser?.role === "site_admin";
  const statusLabel = selectedUser?.suspended ? "停止中" : "有効";

  const confirmAction = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    setError("");
    try {
      if (confirmation.kind === "role") {
        await changeSiteRole(
          confirmation.user.id,
          confirmation.nextRole,
          confirmation.nextRole === "site_admin"
            ? confirmation.text === "site_admin"
              ? "GRANT_SITE_ADMIN"
              : ""
            : undefined,
        );
        onNotice("サイト権限を変更しました。");
      } else if (confirmation.kind === "suspend") {
        await suspendManagedUser(
          confirmation.user.id,
          confirmation.reason,
          confirmation.until
            ? new Date(confirmation.until).toISOString()
            : null,
        );
        onNotice("アカウントを停止しました。");
      } else if (confirmation.kind === "reactivate") {
        await reactivateManagedUser(
          confirmation.user.id,
          confirmation.reason,
        );
        onNotice("アカウント停止を解除しました。");
      } else if (confirmation.kind === "delete-final") {
        await deleteManagedUser(
          confirmation.user.id,
          confirmation.text,
          confirmation.reason,
        );
        setSelectedUser(null);
        onNotice("ユーザーを登録解除しました。");
      }
      setConfirmation(null);
      await Promise.all([refreshUsers(), refreshAudit()]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "管理操作を完了できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const roleConfirmationReady = useMemo(() => {
    if (confirmation?.kind !== "role") return false;
    return (
      confirmation.nextRole !== "site_admin" ||
      confirmation.text === "site_admin"
    );
  }, [confirmation]);

  return (
    <div className="site-admin">
      <header className="site-admin__header">
        <ShieldCheck size={24} aria-hidden="true" />
        <span>
          <strong>サイト管理者</strong>
          <small>{context.email}</small>
          <small>すべての管理操作は履歴へ記録されます。</small>
        </span>
      </header>

      <div className="site-admin__tabs" role="tablist" aria-label="サイト管理">
        <button
          type="button"
          className={tab === "users" ? "is-active" : ""}
          onClick={() => setTab("users")}
        >
          <Users size={17} /> ユーザー
        </button>
        <button
          type="button"
          className={tab === "audit" ? "is-active" : ""}
          onClick={() => setTab("audit")}
        >
          <History size={17} /> 操作履歴
        </button>
      </div>

      {error ? (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      ) : null}

      {tab === "users" ? (
        <>
          <form
            className="site-admin__filters"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(searchInput.trim());
            }}
          >
            <label>
              <span className="share-sr-only">表示名またはメールアドレス</span>
              <Search size={17} />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="表示名・メールアドレスで検索"
              />
            </label>
            <button type="submit">検索</button>
            <select
              value={sort}
              aria-label="登録日時の並び順"
              onChange={(event) => {
                setPage(1);
                setSort(event.target.value as "newest" | "oldest");
              }}
            >
              <option value="newest">新しい順</option>
              <option value="oldest">古い順</option>
            </select>
          </form>

          {loading ? (
            <p className="site-admin__state">ユーザーを読み込んでいます…</p>
          ) : users.length === 0 ? (
            <p className="site-admin__state">該当するユーザーはいません。</p>
          ) : (
            <div className="site-admin__users">
              {users.map((managedUser) => (
                <article key={managedUser.id}>
                  <span>
                    <strong>{managedUser.displayName}</strong>
                    <small>{managedUser.email}</small>
                    <small>ID: {shortID(managedUser.id)}</small>
                  </span>
                  <span className={`site-role site-role--${managedUser.role}`}>
                    {ROLE_LABEL[managedUser.role]}
                  </span>
                  <span
                    className={
                      managedUser.suspended
                        ? "account-state is-suspended"
                        : "account-state"
                    }
                  >
                    {managedUser.suspended ? "停止中" : "有効"}
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSelectedUser(managedUser)}
                  >
                    詳細
                  </button>
                </article>
              ))}
            </div>
          )}

          <nav className="site-admin__pagination" aria-label="ユーザー一覧ページ">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft size={17} /> 前へ
            </button>
            <span>
              {page} / {totalPages}（{total}人）
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              次へ <ChevronRight size={17} />
            </button>
          </nav>

          {selectedUser ? (
            <section className="site-admin__detail" aria-label="ユーザー詳細">
              <div className="section-heading">
                <UserCheck size={18} />
                <strong>ユーザー詳細</strong>
              </div>
              <dl>
                <div><dt>表示名</dt><dd>{selectedUser.displayName}</dd></div>
                <div><dt>メール</dt><dd>{selectedUser.email}</dd></div>
                <div><dt>ユーザーID</dt><dd>{shortID(selectedUser.id)}</dd></div>
                <div><dt>登録日時</dt><dd>{formatDate(selectedUser.createdAt)}</dd></div>
                <div><dt>最終ログイン</dt><dd>{formatDate(selectedUser.lastSignInAt)}</dd></div>
                <div><dt>メール確認</dt><dd>{selectedUser.emailConfirmed ? "確認済み" : "未確認"}</dd></div>
                <div><dt>状態</dt><dd>{statusLabel}</dd></div>
              </dl>

              <label className="field">
                <span>サイト権限</span>
                <select
                  value={selectedRole}
                  disabled={selfSelected}
                  onChange={(event) =>
                    setSelectedRole(event.target.value as SiteRole)
                  }
                >
                  <option value="user">一般ユーザー</option>
                  <option value="moderator">モデレーター</option>
                  <option value="site_admin">サイト管理者</option>
                </select>
              </label>
              <button
                className="secondary-button"
                type="button"
                disabled={selfSelected || selectedRole === selectedUser.role}
                onClick={() =>
                  setConfirmation({
                    kind: "role",
                    user: selectedUser,
                    nextRole: selectedRole,
                    text: "",
                  })
                }
              >
                権限を変更
              </button>

              <div className="site-admin__danger-actions">
                {selectedUser.suspended ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={selfSelected || protectedAdmin}
                    onClick={() =>
                      setConfirmation({
                        kind: "reactivate",
                        user: selectedUser,
                        reason: "",
                      })
                    }
                  >
                    <UserCheck size={17} /> 停止を解除
                  </button>
                ) : (
                  <button
                    className="danger-button"
                    type="button"
                    disabled={selfSelected || protectedAdmin}
                    onClick={() =>
                      setConfirmation({
                        kind: "suspend",
                        user: selectedUser,
                        reason: "",
                        until: "",
                      })
                    }
                  >
                    <UserRoundX size={17} /> アカウント停止
                  </button>
                )}
                <button
                  className="danger-button"
                  type="button"
                  disabled={selfSelected || protectedAdmin}
                  onClick={() =>
                    setConfirmation({ kind: "delete-first", user: selectedUser })
                  }
                >
                  <Trash2 size={17} /> 登録解除
                </button>
              </div>
              {selfSelected ? (
                <p className="site-admin__note">
                  自分自身の権限変更・停止・登録解除はできません。
                </p>
              ) : null}
              {protectedAdmin && !selfSelected ? (
                <p className="site-admin__note">
                  サイト管理者の停止・登録解除はできません。
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : (
        <>
          {loading ? (
            <p className="site-admin__state">操作履歴を読み込んでいます…</p>
          ) : logs.length === 0 ? (
            <p className="site-admin__state">管理操作履歴はありません。</p>
          ) : (
            <div className="site-admin__audit">
              {logs.map((log) => (
                <article key={log.id}>
                  <strong>{ACTION_LABEL[log.action] ?? log.action}</strong>
                  <small>{formatDate(log.created_at)}</small>
                  <small>
                    対象: {log.target_user_id ? shortID(log.target_user_id) : "登録解除済み"}
                  </small>
                  {log.reason ? <p>{log.reason}</p> : null}
                </article>
              ))}
            </div>
          )}
          <nav className="site-admin__pagination" aria-label="操作履歴ページ">
            <button
              type="button"
              disabled={auditPage <= 1 || loading}
              onClick={() => setAuditPage((current) => current - 1)}
            >
              <ChevronLeft size={17} /> 前へ
            </button>
            <span>{auditPage} / {auditPages}</span>
            <button
              type="button"
              disabled={auditPage >= auditPages || loading}
              onClick={() => setAuditPage((current) => current + 1)}
            >
              次へ <ChevronRight size={17} />
            </button>
          </nav>
        </>
      )}

      {confirmation?.kind === "role" ? (
        <Modal
          title={`このユーザーの権限を${ROLE_LABEL[confirmation.nextRole]}へ変更しますか？`}
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
          footer={
            <div className="logout-confirm-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setConfirmation(null)}>キャンセル</button>
              <button className="primary-button" type="button" disabled={busy || !roleConfirmationReady} onClick={() => void confirmAction()}>
                {busy ? "変更中…" : "変更する"}
              </button>
            </div>
          }
        >
          <p className="site-admin__confirm-text">
            アルバム内の権限は変更されません。
          </p>
          {confirmation.nextRole === "site_admin" ? (
            <label className="field">
              <span>確認のため「site_admin」と入力してください</span>
              <input
                value={confirmation.text}
                onChange={(event) =>
                  setConfirmation({ ...confirmation, text: event.target.value })
                }
              />
            </label>
          ) : null}
        </Modal>
      ) : null}

      {confirmation?.kind === "suspend" ? (
        <Modal
          title="このユーザーの利用を停止しますか？"
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
          footer={
            <div className="logout-confirm-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setConfirmation(null)}>キャンセル</button>
              <button className="danger-button" type="button" disabled={busy || confirmation.reason.trim().length < 3} onClick={() => void confirmAction()}>
                {busy ? "停止中…" : "停止する"}
              </button>
            </div>
          }
        >
          <div className="stack-form">
            <label className="field">
              <span>停止理由</span>
              <textarea
                value={confirmation.reason}
                maxLength={500}
                onChange={(event) =>
                  setConfirmation({ ...confirmation, reason: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>停止期限（未入力の場合は期限なし）</span>
              <input
                type="datetime-local"
                value={confirmation.until}
                onChange={(event) =>
                  setConfirmation({ ...confirmation, until: event.target.value })
                }
              />
            </label>
          </div>
        </Modal>
      ) : null}

      {confirmation?.kind === "reactivate" ? (
        <Modal
          title="このユーザーの利用停止を解除しますか？"
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
          footer={
            <div className="logout-confirm-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setConfirmation(null)}>キャンセル</button>
              <button className="primary-button" type="button" disabled={busy} onClick={() => void confirmAction()}>
                {busy ? "解除中…" : "解除する"}
              </button>
            </div>
          }
        >
          <label className="field">
            <span>解除理由（任意）</span>
            <textarea
              value={confirmation.reason}
              maxLength={500}
              onChange={(event) =>
                setConfirmation({ ...confirmation, reason: event.target.value })
              }
            />
          </label>
        </Modal>
      ) : null}

      {confirmation?.kind === "delete-first" ? (
        <Modal
          title="このユーザーを登録解除しますか？"
          onClose={() => setConfirmation(null)}
          footer={
            <div className="logout-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setConfirmation(null)}>キャンセル</button>
              <button
                className="danger-button"
                type="button"
                onClick={() =>
                  setConfirmation({
                    kind: "delete-final",
                    user: confirmation.user,
                    text: "",
                    reason: "",
                  })
                }
              >
                確認を続ける
              </button>
            </div>
          }
        >
          <p className="site-admin__confirm-text">
            この操作は元に戻せません。所有アルバムや共有写真がある場合は安全のため拒否されます。通常はアカウント停止を優先してください。
          </p>
        </Modal>
      ) : null}

      {confirmation?.kind === "delete-final" ? (
        <Modal
          title="登録解除の最終確認"
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
          footer={
            <div className="logout-confirm-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setConfirmation(null)}>キャンセル</button>
              <button className="danger-button" type="button" disabled={busy || confirmation.text !== "削除する"} onClick={() => void confirmAction()}>
                {busy ? "登録解除中…" : "登録解除する"}
              </button>
            </div>
          }
        >
          <div className="stack-form">
            <p className="site-admin__confirm-text">{confirmation.user.email}</p>
            <label className="field">
              <span>確認のため「削除する」と入力してください</span>
              <input
                value={confirmation.text}
                onChange={(event) =>
                  setConfirmation({ ...confirmation, text: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>登録解除理由（任意）</span>
              <textarea
                value={confirmation.reason}
                maxLength={500}
                onChange={(event) =>
                  setConfirmation({ ...confirmation, reason: event.target.value })
                }
              />
            </label>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
