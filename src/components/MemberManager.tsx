import {
  Check,
  Clock3,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  changeMemberRole,
  loadJoinRequests,
  loadMembers,
  reviewJoinRequest,
} from "../lib/data";
import type {
  Album,
  AlbumJoinRequest,
  AlbumMember,
  AlbumRole,
  AppUser,
} from "../types";
import { Modal } from "./Modal";

const ROLE_LABEL: Record<AlbumRole, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
  viewer: "閲覧のみ",
};

const ASSIGNABLE_ROLES: Exclude<AlbumRole, "owner">[] = [
  "viewer",
  "member",
  "admin",
];

const REQUEST_DATE_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface MemberManagerProps {
  album: Album;
  currentUser: AppUser;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}

export function MemberManager({
  album,
  currentUser,
  onClose,
  onChanged,
}: MemberManagerProps) {
  const [members, setMembers] = useState<AlbumMember[]>([]);
  const [requests, setRequests] = useState<AlbumJoinRequest[]>([]);
  const [requestRoles, setRequestRoles] = useState<
    Record<string, Exclude<AlbumRole, "owner">>
  >({});
  const [loading, setLoading] = useState(true);
  const [changingID, setChangingID] = useState("");
  const [error, setError] = useState("");
  const isManager = album.role === "owner" || album.role === "admin";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextMembers, nextRequests] = await Promise.all([
        loadMembers(album.id),
        isManager ? loadJoinRequests(album.id) : Promise.resolve([]),
      ]);
      setMembers(nextMembers);
      setRequests(nextRequests);
      setRequestRoles(
        Object.fromEntries(
          nextRequests.map((request) => [request.id, request.requested_role]),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "メンバー情報を取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [album.id, isManager]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setRole = async (
    member: AlbumMember,
    role: Exclude<AlbumRole, "owner">,
  ) => {
    if (!isManager || member.role === "owner") return;

    setChangingID(member.user_id);
    setError("");
    try {
      await changeMemberRole(album.id, member.user_id, role);
      setMembers((current) =>
        current.map((candidate) =>
          candidate.user_id === member.user_id ? { ...candidate, role } : candidate,
        ),
      );
      await onChanged?.();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "権限を変更できませんでした。",
      );
    } finally {
      setChangingID("");
    }
  };

  const review = async (request: AlbumJoinRequest, approve: boolean) => {
    if (!isManager) return;

    setChangingID(request.id);
    setError("");
    try {
      await reviewJoinRequest(
        request.id,
        approve,
        requestRoles[request.id] ?? request.requested_role,
      );
      await refresh();
      await onChanged?.();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "参加申請を処理できませんでした。",
      );
    } finally {
      setChangingID("");
    }
  };

  const memberCount = members.length || album.member_count || 1;

  return (
    <Modal title="参加申請とメンバー" onClose={onClose}>
      <div className="member-manager">
        <div className="member-manager__summary">
          <Users size={21} aria-hidden="true" />
          <span>
            <strong>{album.name}</strong>
            <small>
              {memberCount}人が参加中・あなたは{ROLE_LABEL[album.role]}
            </small>
          </span>
        </div>

        {loading ? (
          <p className="member-state" role="status" aria-live="polite">
            メンバーを読み込んでいます…
          </p>
        ) : null}
        {error ? (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        ) : null}

        {isManager && requests.length > 0 ? (
          <section className="approval-section" aria-labelledby="approval-heading">
            <div className="section-heading">
              <Clock3 size={18} aria-hidden="true" />
              <strong id="approval-heading">承認待ち</strong>
              <span aria-label={`${requests.length}件`}>
                {requests.length}
              </span>
            </div>
            <p className="approval-section__help">
              参加時の権限を選び、申請を承認または却下してください。
            </p>
            <div className="member-list">
              {requests.map((request) => {
                const applicantName = request.display_name || "参加希望者";
                const isChanging = changingID === request.id;

                return (
                  <article className="approval-row" key={request.id}>
                    <span className="member-avatar" aria-hidden="true">
                      {request.avatar_url ? (
                        <img src={request.avatar_url} alt="" />
                      ) : (
                        <UserRound size={20} />
                      )}
                    </span>
                    <span className="member-identity">
                      <strong>{applicantName}</strong>
                      <small>{request.email || "メールアドレス非公開"}</small>
                      <small className="approval-request-meta">
                        申請日時：
                        {REQUEST_DATE_FORMAT.format(new Date(request.created_at))}
                      </small>
                      <small className="approval-request-meta">
                        希望する権限：{ROLE_LABEL[request.requested_role]}
                      </small>
                      <small className="approval-request-meta">
                        対象アルバム：{request.album_name || album.name}
                      </small>
                    </span>
                    <label className="approval-role-field">
                      <span className="share-sr-only">
                        {applicantName}の承認後の権限
                      </span>
                      <select
                        value={
                          requestRoles[request.id] ?? request.requested_role
                        }
                        aria-label={`${applicantName}の承認後の権限`}
                        disabled={isChanging}
                        onChange={(event) =>
                          setRequestRoles((current) => ({
                            ...current,
                            [request.id]: event.target.value as Exclude<
                              AlbumRole,
                              "owner"
                            >,
                          }))
                        }
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option value={role} key={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="approval-actions">
                      <button
                        type="button"
                        className="approval-button approval-button--reject"
                        disabled={isChanging}
                        onClick={() => void review(request, false)}
                        aria-label={`${applicantName}の参加申請を拒否`}
                      >
                        <X size={17} aria-hidden="true" />
                        <span>拒否</span>
                      </button>
                      <button
                        type="button"
                        className="approval-button approval-button--approve"
                        disabled={isChanging}
                        onClick={() => void review(request, true)}
                        aria-label={`${applicantName}の参加申請を承認`}
                      >
                        <Check size={17} aria-hidden="true" />
                        <span>{isChanging ? "処理中…" : "承認"}</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {isManager && !loading && requests.length === 0 ? (
          <p className="approval-empty" role="status">
            <Check size={16} aria-hidden="true" />
            現在、参加申請はありません
          </p>
        ) : null}

        {!isManager ? (
          <div className="manager-only-note" role="note">
            <ShieldCheck size={18} aria-hidden="true" />
            参加承認と権限変更はオーナーまたは管理者のみ行えます。
          </div>
        ) : null}

        <section aria-labelledby="member-list-heading">
          <div className="section-heading">
            <Users size={18} aria-hidden="true" />
            <strong id="member-list-heading">参加メンバー</strong>
            <span aria-label={`${memberCount}人`}>{memberCount}</span>
          </div>
          <div className="member-list">
            {!loading && members.length === 0 ? (
              <p className="member-state">メンバー情報がありません。</p>
            ) : null}

            {members.map((member) => {
              const isOwner = member.role === "owner";
              const isSelf = member.user_id === currentUser.id;
              const isChanging = changingID === member.user_id;
              const memberName = member.display_name || "メンバー";

              return (
                <article className="member-row" key={member.user_id}>
                  <span className="member-avatar" aria-hidden="true">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt="" />
                    ) : isOwner ? (
                      <ShieldCheck size={20} />
                    ) : (
                      <UserRound size={20} />
                    )}
                  </span>
                  <span className="member-identity">
                    <strong>
                      {memberName}
                      {isSelf ? <small className="self-label">あなた</small> : null}
                    </strong>
                    <small>
                      {member.email ||
                        (isOwner ? "アルバムのオーナー" : "参加メンバー")}
                    </small>
                  </span>

                  {isManager && !isOwner ? (
                    <label className="member-role-field">
                      <span className="share-sr-only">{memberName}の権限</span>
                      <select
                        value={member.role}
                        aria-label={`${memberName}の権限`}
                        disabled={isChanging}
                        onChange={(event) =>
                          void setRole(
                            member,
                            event.target.value as Exclude<AlbumRole, "owner">,
                          )
                        }
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option value={role} key={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span className={`role-badge role-badge--${member.role}`}>
                      {ROLE_LABEL[member.role]}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <p className="member-help">
          オーナーはすべての操作、管理者は招待・承認・メンバー管理、メンバーは写真の投稿と自分の写真の編集、閲覧のみはアルバムの閲覧ができます。写真の削除は投稿者本人、オーナー、管理者だけが行えます。オーナーの権限は変更できません。
        </p>
      </div>
    </Modal>
  );
}
