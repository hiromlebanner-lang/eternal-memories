import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  MapPin,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import type { AlbumPhoto } from "../types";
import { CATEGORY_META } from "../types";
import { Modal } from "./Modal";

interface PhotoDetailProps {
  photos: AlbumPhoto[];
  initialPhotoID?: string;
  canEdit: (photo: AlbumPhoto) => boolean;
  canDelete: (photo: AlbumPhoto) => boolean;
  onClose: () => void;
  onEdit: (photo: AlbumPhoto) => void;
  onDelete: (photo: AlbumPhoto) => Promise<void>;
}

export function PhotoDetail({
  photos,
  initialPhotoID,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onDelete,
}: PhotoDetailProps) {
  const [index, setIndex] = useState(() => {
    const found = photos.findIndex((photo) => photo.id === initialPhotoID);
    return found >= 0 ? found : 0;
  });
  const [deleting, setDeleting] = useState(false);

  const resolvedIndex = Math.min(index, Math.max(0, photos.length - 1));
  const photo = photos[resolvedIndex];
  if (!photo) return null;
  const meta = CATEGORY_META[photo.category];

  const remove = async () => {
    if (!window.confirm("この写真を削除しますか？この操作は取り消せません。")) return;
    setDeleting(true);
    try {
      await onDelete(photo);
      if (photos.length <= 1) onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title={photos.length > 1 ? `この場所の写真 ${photos.length}枚` : "写真の詳細"}
      onClose={onClose}
      size="wide"
    >
      <div className="photo-detail">
        <div className="photo-detail__visual">
          <img src={photo.image_url} alt={photo.caption || "アルバムの写真"} />
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="photo-detail__nav photo-detail__nav--left"
                disabled={resolvedIndex === 0}
                onClick={() => setIndex(Math.max(0, resolvedIndex - 1))}
                aria-label="前の写真"
              >
                <ChevronLeft />
              </button>
              <button
                type="button"
                className="photo-detail__nav photo-detail__nav--right"
                disabled={resolvedIndex === photos.length - 1}
                onClick={() =>
                  setIndex(Math.min(photos.length - 1, resolvedIndex + 1))
                }
                aria-label="次の写真"
              >
                <ChevronRight />
              </button>
              <span className="photo-detail__counter">
                {index + 1} / {photos.length}
              </span>
            </>
          ) : null}
        </div>

        <div className="photo-detail__info">
          <div className="photo-detail__category" style={{ color: meta.color }}>
            <span>{meta.emoji}</span>
            {meta.label}
          </div>
          <p className="photo-detail__caption">
            {photo.caption || "この写真にはまだコメントがありません。"}
          </p>

          <dl className="photo-meta-list">
            <div>
              <dt>
                <UserRound size={17} />
                投稿者
              </dt>
              <dd>{photo.author_name}</dd>
            </div>
            <div>
              <dt>
                <CalendarDays size={17} />
                撮影日
              </dt>
              <dd>
                {new Intl.DateTimeFormat("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }).format(new Date(photo.captured_at))}
              </dd>
            </div>
            <div>
              <dt>
                <Clock3 size={17} />
                時刻
              </dt>
              <dd>
                {new Intl.DateTimeFormat("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(photo.captured_at))}
              </dd>
            </div>
            <div>
              <dt>
                <MapPin size={17} />
                撮影位置
              </dt>
              <dd>
                {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
              </dd>
            </div>
          </dl>

          {canEdit(photo) || canDelete(photo) ? (
            <div className="photo-detail__actions">
              {canEdit(photo) ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onEdit(photo)}
                >
                  <Edit3 size={17} />
                  編集
                </button>
              ) : null}
              {canDelete(photo) ? (
                <button
                  className="danger-button"
                  type="button"
                  disabled={deleting}
                  onClick={() => void remove()}
                >
                  <Trash2 size={17} />
                  {deleting ? "削除中…" : "削除"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
