import { Check, Image, Palette, Save, Tags } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Album, AlbumFolder, AlbumPhoto } from "../types";
import { Modal } from "./Modal";

interface AlbumSettingsPanelProps {
  album: Album;
  photos: AlbumPhoto[];
  folders: AlbumFolder[];
  onClose: () => void;
  onSave: (input: {
    coverPhotoID: string | null;
    visibility: "private" | "limited" | "public";
    icon: string;
    themeColor: string;
    tags: string[];
    folderID: string | null;
  }) => Promise<void>;
}

export function AlbumSettingsPanel({
  album,
  photos,
  folders,
  onClose,
  onSave,
}: AlbumSettingsPanelProps) {
  const canManage = album.role === "owner" || album.role === "admin";
  const [coverPhotoID, setCoverPhotoID] = useState(
    album.cover_photo_id ?? "",
  );
  const [visibility, setVisibility] = useState<
    "private" | "limited" | "public"
  >(album.visibility ?? "private");
  const [icon, setIcon] = useState(album.icon ?? "images");
  const [themeColor, setThemeColor] = useState(
    album.theme_color ?? "#c65476",
  );
  const [tags, setTags] = useState((album.tags ?? []).join("、"));
  const [folderID, setFolderID] = useState(album.folder_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({
        coverPhotoID: coverPhotoID || null,
        visibility,
        icon,
        themeColor,
        tags: tags.split(/[、,\s]+/).filter(Boolean),
        folderID: folderID || null,
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "アルバム設定を保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="アルバム設定" size="wide" onClose={onClose}>
      <form className="album-settings-panel" onSubmit={submit}>
        <section>
          <div className="section-heading">
            <Image size={18} />
            <strong>表紙画像</strong>
          </div>
          {!canManage ? (
            <p className="site-admin__note">
              表紙や公開範囲を変更できるのはオーナーまたは管理者です。
            </p>
          ) : null}
          <div className="album-cover-picker" aria-label="表紙画像を選択">
            <button
              type="button"
              className={!coverPhotoID ? "is-selected" : ""}
              disabled={!canManage}
              onClick={() => setCoverPhotoID("")}
            >
              <span><Image size={24} /></span>
              <small>最新写真を自動表示</small>
              {!coverPhotoID ? <Check size={16} /> : null}
            </button>
            {photos.map((photo) => (
              <button
                type="button"
                key={photo.id}
                className={coverPhotoID === photo.id ? "is-selected" : ""}
                disabled={!canManage}
                onClick={() => setCoverPhotoID(photo.id)}
              >
                <img
                  src={photo.image_url}
                  alt={photo.title || photo.caption || "表紙候補"}
                  loading="lazy"
                />
                {coverPhotoID === photo.id ? <Check size={16} /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="album-settings-panel__grid">
          <label className="field">
            <span>公開範囲</span>
            <select
              value={visibility}
              disabled={!canManage}
              onChange={(event) =>
                setVisibility(
                  event.target.value as "private" | "limited" | "public",
                )
              }
            >
              <option value="private">非公開</option>
              <option value="limited">限定公開</option>
              <option value="public">公開</option>
            </select>
          </label>
          <label className="field">
            <span>フォルダ</span>
            <select
              value={folderID}
              onChange={(event) => setFolderID(event.target.value)}
            >
              <option value="">フォルダなし</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span><Palette size={15} /> テーマカラー</span>
            <input
              type="color"
              value={themeColor}
              disabled={!canManage}
              onChange={(event) => setThemeColor(event.target.value)}
            />
          </label>
          <label className="field">
            <span>アイコン</span>
            <select
              value={icon}
              disabled={!canManage}
              onChange={(event) => setIcon(event.target.value)}
            >
              <option value="images">写真</option>
              <option value="family">家族</option>
              <option value="travel">旅行</option>
              <option value="heart">大切な人</option>
              <option value="work">仕事</option>
              <option value="star">お気に入り</option>
            </select>
          </label>
        </section>

        <label className="field">
          <span><Tags size={15} /> タグ（読点またはカンマ区切り）</span>
          <input
            value={tags}
            disabled={!canManage}
            maxLength={360}
            onChange={(event) => setTags(event.target.value)}
            placeholder="家族、北海道、夏休み"
          />
        </label>

        {error ? (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary-button" type="submit" disabled={busy}>
          <Save size={17} /> {busy ? "保存中…" : "設定を保存"}
        </button>
      </form>
    </Modal>
  );
}
