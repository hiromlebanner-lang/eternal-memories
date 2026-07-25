import { BellRing, Clock3 } from "lucide-react";
import type { AlbumJoinRequest } from "../types";
import { Modal } from "./Modal";

interface JoinRequestPopupProps {
  requests: AlbumJoinRequest[];
  onView: () => void;
  onLater: () => void;
}

export function JoinRequestPopup({
  requests,
  onView,
  onLater,
}: JoinRequestPopupProps) {
  const first = requests[0];
  const message =
    requests.length === 1
      ? `${first.display_name || "参加希望者"}さんから「${
          first.album_name || "アルバム"
        }」への参加申請が届きました`
      : `参加申請が${requests.length}件届いています`;

  return (
    <Modal title="新しい参加申請" onClose={onLater}>
      <div className="join-request-popup">
        <span className="join-request-popup__icon" aria-hidden="true">
          <BellRing size={27} />
        </span>
        <p>{message}</p>
        <small>
          <Clock3 size={14} aria-hidden="true" />
          承認するまでアルバムには参加しません
        </small>
        <div className="join-request-popup__actions">
          <button type="button" className="primary-button" onClick={onView}>
            申請を見る
          </button>
          <button type="button" className="text-button" onClick={onLater}>
            あとで
          </button>
        </div>
      </div>
    </Modal>
  );
}
