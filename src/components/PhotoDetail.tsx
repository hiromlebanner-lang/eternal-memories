import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  MapPin,
  Share2,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  canSharePhoto,
  savePreparedPhotoAsFile,
  savePhotoToDevice,
  type PhotoSaveProgress,
  type PhotoSaveResult,
} from "../lib/photoSave";
import type { AlbumPhoto } from "../types";
import { CATEGORY_META } from "../types";
import { Modal } from "./Modal";

interface PhotoDetailProps {
  photos: AlbumPhoto[];
  initialPhotoID?: string;
  canEdit: (photo: AlbumPhoto) => boolean;
  canDelete: (photo: AlbumPhoto) => boolean;
  canDownload?: boolean;
  protectImage?: boolean;
  onClose: () => void;
  onEdit: (photo: AlbumPhoto) => void;
  onDelete: (photo: AlbumPhoto) => Promise<void>;
  onDownload?: (
    photo: AlbumPhoto,
    onProgress?: (progress: PhotoSaveProgress) => void,
  ) => Promise<PhotoSaveResult>;
}

const SAVE_PROGRESS_LABEL: Record<PhotoSaveProgress, string> = {
  preparing: "画像を準備しています…",
  generating: "保存用画像を作成しています…",
  sharing: "共有画面を開きます…",
};

export function PhotoDetail({
  photos,
  initialPhotoID,
  canEdit,
  canDelete,
  canDownload = false,
  protectImage = false,
  onClose,
  onEdit,
  onDelete,
  onDownload,
}: PhotoDetailProps) {
  const [index, setIndex] = useState(() => {
    const found = photos.findIndex((photo) => photo.id === initialPhotoID);
    return found >= 0 ? found : 0;
  });
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");
  const [manualSave, setManualSave] = useState<{
    file: File;
    previewURL: string;
  } | null>(null);
  const [showsSaveHelp, setShowsSaveHelp] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const downloadingRef = useRef(false);

  const resolvedIndex = Math.min(index, Math.max(0, photos.length - 1));
  const photo = photos[resolvedIndex];
  useEffect(
    () => () => {
      if (manualSave?.previewURL) URL.revokeObjectURL(manualSave.previewURL);
    },
    [manualSave],
  );
  if (!photo) return null;
  const meta = CATEGORY_META[photo.category];

  const remove = async () => {
    setDeleting(true);
    try {
      await onDelete(photo);
      if (photos.length <= 1) onClose();
    } finally {
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  const download = async () => {
    if (!onDownload || downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true);
    setDownloadMessage("");
    try {
      const result = await onDownload(photo, (progress) => {
        setDownloadMessage(SAVE_PROGRESS_LABEL[progress]);
      });
      if (result.status === "shared") {
        setDownloadMessage(
          "共有画面を開きました。「画像を保存」を選択してください。",
        );
      } else if (result.status === "cancelled") {
        setDownloadMessage("保存操作がキャンセルされました。");
      } else {
        setManualSave({
          file: result.file,
          previewURL: URL.createObjectURL(result.file),
        });
        setDownloadMessage(
          "この端末ではファイル共有を利用できません。画像を長押しして保存してください。",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setDownloadMessage(
        /[\u3000-\u9fff\u3040-\u30ff]/.test(message)
          ? message
          : "写真を保存できませんでした。通信状態を確認して、もう一度お試しください。",
      );
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  };

  return (
    <>
    <Modal
      title={photos.length > 1 ? `この場所の写真 ${photos.length}枚` : "写真の詳細"}
      onClose={onClose}
      size="wide"
    >
      <div className="photo-detail">
        <div className="photo-detail__visual">
          <img
            className={protectImage ? "protected-image" : undefined}
            src={photo.image_url}
            alt={photo.caption || "アルバムの写真"}
            draggable={!protectImage}
            onContextMenu={
              protectImage ? (event) => event.preventDefault() : undefined
            }
          />
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
          {photo.title ? (
            <h3 className="photo-detail__title">{photo.title}</h3>
          ) : null}
          <p className="photo-detail__caption">
            {photo.caption || "この写真にはまだコメントがありません。"}
          </p>

          <dl className="photo-meta-list">
            <div>
              <dt>
                <UserRound size={17} />
                投稿者
              </dt>
              <dd className="photo-author">
                <span className="photo-author-avatar">
                  {photo.author_avatar_url ? (
                    <img src={photo.author_avatar_url} alt="" />
                  ) : (
                    photo.author_name.slice(0, 1)
                  )}
                </span>
                {photo.author_name}
              </dd>
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
            {photo.latitude != null && photo.longitude != null ? (
              <div>
                <dt>
                  <MapPin size={17} />
                  撮影位置
                </dt>
                <dd>
                  {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
                </dd>
              </div>
            ) : null}
          </dl>

          {canDownload || canEdit(photo) || canDelete(photo) ? (
            <div className="photo-detail__actions">
              {canDownload && onDownload ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={downloading}
                  onClick={() => void download()}
                >
                  <Share2 size={17} />
                  {downloading ? "画像を準備中…" : "写真アプリに保存"}
                </button>
              ) : null}
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
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={17} />
                  {deleting ? "削除中…" : "削除"}
                </button>
              ) : null}
            </div>
          ) : null}
          {downloadMessage ? (
            <p className="photo-detail__download-message" role="status">
              {downloadMessage}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
    {confirmDelete ? (
      <Modal
        title="この写真を削除しますか？"
        onClose={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        footer={
          <div className="logout-confirm-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              キャンセル
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting ? "削除中…" : "実行する"}
            </button>
          </div>
        }
      >
        <p>この操作は元に戻せません。</p>
      </Modal>
    ) : null}
    {manualSave ? (
      <Modal
        title="写真アプリに保存"
        size="wide"
        onClose={() => setManualSave(null)}
        footer={
          <div className="manual-photo-save__actions">
            {canSharePhoto(manualSave.file) ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  void savePhotoToDevice(manualSave.file, (progress) => {
                    setDownloadMessage(SAVE_PROGRESS_LABEL[progress]);
                  }).then((result) => {
                    if (result.status === "shared") {
                      setManualSave(null);
                      setDownloadMessage(
                        "共有画面を開きました。「画像を保存」を選択してください。",
                      );
                    } else if (result.status === "cancelled") {
                      setDownloadMessage("保存操作がキャンセルされました。");
                    }
                  });
                }}
              >
                <Share2 size={17} />
                共有画面を開く
              </button>
            ) : null}
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowsSaveHelp((current) => !current)}
            >
              保存方法を見る
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                savePreparedPhotoAsFile(manualSave.file);
                setDownloadMessage(
                  "ファイル保存を開始しました。写真アプリへの保存状況は端末でご確認ください。",
                );
              }}
            >
              ファイルとして保存
            </button>
          </div>
        }
      >
        <div className="manual-photo-save">
          <p>画像を長押しして「写真に保存」を選択してください。</p>
          {showsSaveHelp ? (
            <ol>
              <li>下の画像を長押しします。</li>
              <li>表示されたメニューから「写真に保存」を選びます。</li>
              <li>選択肢がない場合は「ファイルとして保存」をご利用ください。</li>
            </ol>
          ) : null}
          <img
            src={manualSave.previewURL}
            alt="写真アプリへ保存する画像"
            draggable
          />
        </div>
      </Modal>
    ) : null}
    </>
  );
}
