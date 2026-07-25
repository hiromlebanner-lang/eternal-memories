import {
  Check,
  LocateFixed,
  QrCode,
  Radar,
  UserPlus,
  X,
} from "lucide-react";
import type {
  Album,
  NearbyInvitation,
  NearbyUser,
} from "../types";

interface NearbyPeopleSettingsProps {
  enabled: boolean;
  status: "off" | "locating" | "online" | "unavailable";
  error: string;
  album?: Album;
  canInvite: boolean;
  nearbyUsers: NearbyUser[];
  incomingInvitations: NearbyInvitation[];
  busyUserID?: string;
  busyInvitationID?: string;
  onToggle: (enabled: boolean) => void;
  onInvite: (user: NearbyUser) => void;
  onRespond: (invitation: NearbyInvitation, accept: boolean) => void;
  onOpenStandardInvite: () => void;
}

export function NearbyPeopleSettings({
  enabled,
  status,
  error,
  album,
  canInvite,
  nearbyUsers,
  incomingInvitations,
  busyUserID,
  busyInvitationID,
  onToggle,
  onInvite,
  onRespond,
  onOpenStandardInvite,
}: NearbyPeopleSettingsProps) {
  return (
    <section className="nearby-settings" aria-labelledby="nearby-heading">
      <button
        type="button"
        className="settings-row"
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
      >
        <Radar size={19} aria-hidden="true" />
        <span>
          <strong id="nearby-heading">近くの人を探す</strong>
          <small>アプリを開いている間だけ、50m以内を検索</small>
        </span>
        <span className={enabled ? "toggle is-on" : "toggle"} />
      </button>

      {enabled ? (
        <div className="nearby-panel" aria-live="polite">
          <div className="nearby-status">
            <span
              className={
                status === "online"
                  ? "nearby-status__dot is-online"
                  : "nearby-status__dot"
              }
            />
            {status === "locating"
              ? "位置情報を確認しています…"
              : status === "online"
                ? "近くのログインユーザーを検索中"
                : "検索を開始できませんでした"}
          </div>

          {incomingInvitations.map((invitation) => (
            <article className="nearby-invitation" key={invitation.id}>
              <LocateFixed size={18} aria-hidden="true" />
              <div>
                <strong>{invitation.invitedByName}さんからの招待</strong>
                <small>「{invitation.albumName}」へ参加しますか？</small>
              </div>
              <div className="nearby-invitation__actions">
                <button
                  type="button"
                  disabled={busyInvitationID === invitation.id}
                  onClick={() => onRespond(invitation, true)}
                >
                  <Check size={15} aria-hidden="true" />
                  受け取る
                </button>
                <button
                  type="button"
                  disabled={busyInvitationID === invitation.id}
                  onClick={() => onRespond(invitation, false)}
                >
                  <X size={15} aria-hidden="true" />
                  辞退
                </button>
              </div>
            </article>
          ))}

          {album && canInvite ? (
            nearbyUsers.length > 0 ? (
              <div className="nearby-list">
                {nearbyUsers.map((candidate) => (
                  <article className="nearby-person" key={candidate.id}>
                    <span className="nearby-person__avatar">
                      {candidate.displayName.slice(0, 1)}
                    </span>
                    <span>
                      <strong>
                        近くに{candidate.displayName}さんがいます
                      </strong>
                      <small>正確な位置情報は表示されません</small>
                    </span>
                    <button
                      type="button"
                      disabled={busyUserID === candidate.id}
                      onClick={() => onInvite(candidate)}
                    >
                      <UserPlus size={15} aria-hidden="true" />
                      招待する
                    </button>
                  </article>
                ))}
              </div>
            ) : status === "online" ? (
              <p className="nearby-empty">
                50m以内で検索をONにしている招待候補はまだ見つかりません。
              </p>
            ) : null
          ) : (
            <p className="nearby-empty">
              招待するには、オーナーまたは管理者としてアルバムを選択してください。
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="nearby-fallback" role="alert">
          <p>{error}</p>
          {album && canInvite ? (
            <button type="button" onClick={onOpenStandardInvite}>
              <QrCode size={16} aria-hidden="true" />
              QR・URL・招待コードを表示
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="nearby-privacy">
        位置情報は保存しません。丸めた座標と更新時刻だけを一時送信し、
        OFF・ログアウト・画面終了時に削除します。
      </p>
    </section>
  );
}
