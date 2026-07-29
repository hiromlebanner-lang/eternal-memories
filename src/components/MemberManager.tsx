import {
  ShieldCheck,
  UserRound,
  UserRoundMinus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  changeMemberRole,
  loadMembers,
  removeAlbumMember,
} from "../lib/data";
import type {
  Album,
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
  const [loading, setLoading] = useState(true);
  const [changingID, setChangingID] = useState("");
  const [removingMember, setRemovingMember] = useState<AlbumMember | null>(null);
  const [error, setError] = useState("");
  const isManager = album.role === "owner" || album.role === "admin";
  const isAlbumOwner = album.role === "owner";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextMembers = await loadMembers(album.id);
      setMembers(nextMembers);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "メンバー情報を取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [album.id]);

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

  const removeMember = async () => {
    if (!isAlbumOwner || !removingMember || removingMember.role === "owner") {
      return;
    }

    setChangingID(removingMember.user_id);
    setError("");
    try {
      await removeAlbumMember(album.id, removingMember.user_id);
      setMembers((current) =>
        current.filter((member) => member.user_id !== removingMember.user_id),
      );
      setRemovingMember(null);
      await onChanged?.();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "参加者を退出させられませんでした。",
      );
    } finally {
      setChangingID("");
    }
  };

  const memberCount = members.length || album.member_count || 1;

  return (
    <Modal title="参加者管理" onClose={onClose}>
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

        {!isManager ? (
          <div className="manager-only-note" role="note">
            <ShieldCheck size={18} aria-hidden="true" />
            権限変更はオーナーまたは管理者のみ行えます。
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
                    <small>
                      参加日: {new Date(member.joined_at).toLocaleDateString("ja-JP")}
                    </small>
                  </span>

                  <span className="member-row__actions">
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
                    {isAlbumOwner && !isOwner && !isSelf ? (
                      <button
                        className="member-remove-button"
                        type="button"
                        disabled={isChanging}
                        onClick={() => setRemovingMember(member)}
                      >
                        <UserRoundMinus size={16} />
                        退出
                      </button>
                    ) : null}
                  </span>
                </article>
              );
            })}
          </div>
        </section>

        <p className="member-help">
          オーナーはすべての操作、管理者は招待・承認・メンバー管理、メンバーは写真の投稿と自分の写真の編集、閲覧のみはアルバムの閲覧ができます。写真の削除は投稿者本人、オーナー、管理者だけが行えます。オーナーの権限は変更できません。
        </p>
      </div>
      {removingMember ? (
        <Modal
          title="この参加者をアルバムから退出させますか？"
          onClose={() => {
            if (!changingID) setRemovingMember(null);
          }}
          footer={
            <div className="logout-confirm-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={Boolean(changingID)}
                onClick={() => setRemovingMember(null)}
              >
                キャンセル
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={Boolean(changingID)}
                onClick={() => void removeMember()}
              >
                {changingID ? "退出処理中…" : "退出させる"}
              </button>
            </div>
          }
        >
          <p className="member-remove-confirm">
            退出後、この参加者はアルバムの写真や情報を閲覧・投稿できなくなります。
            過去に投稿した写真は削除されません。
          </p>
        </Modal>
      ) : null}
    </Modal>
  );
}
