import { ShieldCheck, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { changeMemberRole, loadMembers } from "../lib/data";
import type { Album, AlbumMember, AlbumRole, AppUser } from "../types";
import { Modal } from "./Modal";

const ROLE_LABEL: Record<AlbumRole, string> = {
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者",
};

interface MemberManagerProps {
  album: Album;
  currentUser: AppUser;
  onClose: () => void;
}

export function MemberManager({
  album,
  currentUser,
  onClose,
}: MemberManagerProps) {
  const [members, setMembers] = useState<AlbumMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingID, setChangingID] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const next = await loadMembers(album.id);
        if (active) setMembers(next);
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "メンバーを取得できませんでした。");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [album.id]);

  const setRole = async (member: AlbumMember, role: AlbumRole) => {
    setChangingID(member.user_id);
    setError("");
    try {
      await changeMemberRole(album.id, member.user_id, role);
      setMembers((current) =>
        current.map((candidate) =>
          candidate.user_id === member.user_id ? { ...candidate, role } : candidate,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "権限を変更できませんでした。");
    } finally {
      setChangingID("");
    }
  };

  return (
    <Modal title="メンバーと権限" onClose={onClose}>
      <div className="member-manager">
        <div className="member-manager__summary">
          <Users size={20} />
          <span>
            <strong>{album.name}</strong>
            <small>{members.length || album.member_count || 1}人が参加中</small>
          </span>
        </div>

        {loading ? <p className="member-state">メンバーを読み込んでいます…</p> : null}
        {error ? <p className="form-message form-message--error">{error}</p> : null}

        <div className="member-list">
          {members.map((member) => {
            const isOwner = member.user_id === album.created_by;
            const isSelf = member.user_id === currentUser.id;
            return (
              <div className="member-row" key={member.user_id}>
                <span className="member-avatar">
                  {isOwner ? <ShieldCheck size={19} /> : <UserRound size={19} />}
                </span>
                <span className="member-identity">
                  <strong>
                    {member.display_name || "メンバー"}
                    {isSelf ? "（あなた）" : ""}
                  </strong>
                  <small>{member.email || (isOwner ? "アルバム作成者" : "参加メンバー")}</small>
                </span>
                <select
                  value={member.role}
                  aria-label={`${member.display_name || "メンバー"}の権限`}
                  disabled={
                    album.role !== "admin" ||
                    isOwner ||
                    changingID === member.user_id
                  }
                  onChange={(event) =>
                    void setRole(member, event.target.value as AlbumRole)
                  }
                >
                  {(Object.keys(ROLE_LABEL) as AlbumRole[]).map((role) => (
                    <option value={role} key={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <p className="member-help">
          管理者は全操作、編集者は投稿と自分の写真の編集、閲覧者は閲覧のみ行えます。
          アルバム作成者の管理者権限は固定です。
        </p>
      </div>
    </Modal>
  );
}
