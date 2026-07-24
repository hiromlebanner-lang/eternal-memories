import { CalendarDays, MapPin } from "lucide-react";
import type { AlbumPhoto } from "../types";
import { CATEGORY_META } from "../types";

interface PhotoGridProps {
  photos: AlbumPhoto[];
  onSelect: (photo: AlbumPhoto) => void;
}

export function PhotoGrid({ photos, onSelect }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="empty-state">
        <span>🖼️</span>
        <h3>写真が見つかりません</h3>
        <p>検索条件を変えるか、新しい写真を追加してください。</p>
      </div>
    );
  }

  return (
    <div className="photo-grid">
      {photos.map((photo) => {
        const meta = CATEGORY_META[photo.category];
        return (
          <button
            type="button"
            className="photo-card"
            key={photo.id}
            onClick={() => onSelect(photo)}
          >
            <div className="photo-card__image">
              <img src={photo.image_url} alt={photo.caption || `${meta.label}の写真`} />
              <span className="photo-card__category" style={{ background: meta.color }}>
                {meta.emoji}
              </span>
            </div>
            <div className="photo-card__body">
              <strong>{photo.caption || `${meta.label}の思い出`}</strong>
              <span>
                <CalendarDays size={13} />
                {new Intl.DateTimeFormat("ja-JP", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(photo.captured_at))}
                <MapPin size={13} />
                {photo.author_name}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
