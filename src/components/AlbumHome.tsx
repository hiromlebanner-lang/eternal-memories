import {
  CalendarClock,
  Cloud,
  CloudDownload,
  Folder,
  FolderCog,
  Image,
  Images,
  Map,
  Plus,
  Search,
  Star,
  Users,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type {
  Album,
  AlbumFolder,
  AlbumPhoto,
  AlbumSort,
} from "../types";
import { Modal } from "./Modal";

const ROLE_LABEL: Record<Album["role"], string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
  viewer: "閲覧者",
};

const VISIBILITY_LABEL: Record<
  NonNullable<Album["visibility"]>,
  string
> = {
  private: "非公開",
  limited: "限定公開",
  public: "公開",
};

interface AlbumHomeProps {
  userID: string;
  albums: Album[];
  recentPhotos: AlbumPhoto[];
  folders: AlbumFolder[];
  loading: boolean;
  onOpen: (albumID: string) => void;
  onOpenPhoto: (photo: AlbumPhoto) => void;
  onOpenMap: () => void;
  onCreate: () => void;
  onToggleFavorite: (album: Album) => Promise<void>;
  onToggleOffline: (album: Album) => Promise<void>;
  onCreateFolder: (name: string, color: string) => Promise<void>;
  onUpdateFolder: (
    folderID: string,
    name: string,
    color: string,
  ) => Promise<void>;
  onDeleteFolder: (folderID: string) => Promise<void>;
}

function formatDate(value?: string | null) {
  if (!value) return "未更新";
  return new Date(value).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function AlbumCard({
  album,
  busy,
  onOpen,
  onToggleFavorite,
  onToggleOffline,
}: {
  album: Album;
  busy: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onToggleOffline: () => void;
}) {
  return (
    <article
      className="album-card"
      style={{ "--album-accent": album.theme_color ?? "#c65476" } as CSSProperties}
    >
      <button
        type="button"
        className="album-card__open"
        onClick={onOpen}
        aria-label={`${album.name}を開く`}
      >
        <span
          className="album-card__cover"
          style={
            album.cover_url
              ? { backgroundImage: `url("${encodeURI(album.cover_url)}")` }
              : undefined
          }
        >
          {!album.cover_url ? <Images size={30} aria-hidden="true" /> : null}
          <span className="album-card__visibility">
            {VISIBILITY_LABEL[album.visibility ?? "private"]}
          </span>
          {album.offline_enabled ? (
            <span className="album-card__offline">
              <Cloud size={14} /> 保存済み
            </span>
          ) : null}
        </span>
        <span className="album-card__body">
          <span className="album-card__title">
            <strong>{album.name}</strong>
            {album.folder_name ? (
              <small><Folder size={13} /> {album.folder_name}</small>
            ) : null}
          </span>
          <small className="album-card__owner">
            {album.owner_name ?? "オーナー"}・{ROLE_LABEL[album.role]}
          </small>
          <span className="album-card__stats">
            <small><Image size={13} /> {album.photo_count ?? 0}枚</small>
            <small><Users size={13} /> {album.member_count ?? 1}人</small>
            <small><CalendarClock size={13} /> {formatDate(album.updated_at)}</small>
          </span>
          {(album.tags?.length ?? 0) > 0 ? (
            <span className="album-card__tags">
              {album.tags?.slice(0, 3).map((tag) => (
                <small key={tag}>#{tag}</small>
              ))}
            </span>
          ) : null}
        </span>
      </button>
      <div className="album-card__actions">
        <button
          type="button"
          disabled={busy}
          className={album.is_favorite ? "is-favorite" : ""}
          onClick={onToggleFavorite}
          aria-label={
            album.is_favorite ? "お気に入りを解除" : "お気に入りに追加"
          }
        >
          <Star size={18} fill={album.is_favorite ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          disabled={busy}
          className={album.offline_enabled ? "is-offline" : ""}
          onClick={onToggleOffline}
          aria-label={
            album.offline_enabled
              ? "オフライン保存を解除"
              : "オフライン保存"
          }
        >
          <CloudDownload size={18} />
        </button>
      </div>
    </article>
  );
}

export function AlbumHome({
  userID,
  albums,
  recentPhotos,
  folders,
  loading,
  onOpen,
  onOpenPhoto,
  onOpenMap,
  onCreate,
  onToggleFavorite,
  onToggleOffline,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
}: AlbumHomeProps) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDeferredValue(searchInput.trim().toLocaleLowerCase("ja-JP"));
  const [sort, setSort] = useState<AlbumSort>(() => {
    const stored = localStorage.getItem(`mapalbum:album-sort:${userID}`);
    return stored === "created" ||
      stored === "name" ||
      stored === "photos" ||
      stored === "favorites"
      ? stored
      : "updated";
  });
  const [folderFilter, setFolderFilter] = useState("");
  const [busyAlbumID, setBusyAlbumID] = useState("");
  const [showsFolders, setShowsFolders] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderColor, setFolderColor] = useState("#c65476");
  const [editingFolder, setEditingFolder] = useState<AlbumFolder | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<AlbumFolder | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const filteredAlbums = useMemo(() => {
    const result = albums.filter((album) => {
      if (folderFilter && album.folder_id !== folderFilter) return false;
      if (!search) return true;
      return [
        album.name,
        album.owner_name,
        album.folder_name,
        ...(album.tags ?? []),
        ...(album.member_names ?? []),
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("ja-JP").includes(search),
        );
    });
    return result.sort((left, right) => {
      if (sort === "favorites") {
        return Number(Boolean(right.is_favorite)) -
          Number(Boolean(left.is_favorite));
      }
      if (sort === "name") return left.name.localeCompare(right.name, "ja");
      if (sort === "photos") {
        return (right.photo_count ?? 0) - (left.photo_count ?? 0);
      }
      const leftDate =
        sort === "created" ? left.created_at : left.updated_at ?? left.created_at;
      const rightDate =
        sort === "created"
          ? right.created_at
          : right.updated_at ?? right.created_at;
      return new Date(rightDate).getTime() - new Date(leftDate).getTime();
    });
  }, [albums, folderFilter, search, sort]);

  const favorites = albums.filter((album) => album.is_favorite).slice(0, 6);
  const recentlyViewed = [...albums]
    .filter((album) => album.last_viewed_at)
    .sort(
      (left, right) =>
        new Date(right.last_viewed_at ?? 0).getTime() -
        new Date(left.last_viewed_at ?? 0).getTime(),
    )
    .slice(0, 6);

  const runAlbumAction = async (
    album: Album,
    action: (album: Album) => Promise<void>,
  ) => {
    setBusyAlbumID(album.id);
    setActionError("");
    try {
      await action(album);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "アルバムを更新できませんでした。",
      );
    } finally {
      setBusyAlbumID("");
    }
  };

  const submitFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!folderName.trim()) return;
    setFolderBusy(true);
    setActionError("");
    try {
      if (editingFolder) {
        await onUpdateFolder(
          editingFolder.id,
          folderName.trim(),
          folderColor,
        );
      } else {
        await onCreateFolder(folderName.trim(), folderColor);
      }
      setFolderName("");
      setFolderColor("#c65476");
      setEditingFolder(null);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "フォルダを更新できませんでした。",
      );
    } finally {
      setFolderBusy(false);
    }
  };

  return (
    <div className="album-home">
      <section className="album-home__intro">
        <div>
          <span className="eyebrow">あなたの思い出</span>
          <h1>専用アルバム</h1>
          <p>家族や友人との写真を、アルバムごとに大切に残せます。</p>
        </div>
        <button className="primary-button" type="button" onClick={onCreate}>
          <Plus size={18} /> 新しいアルバム
        </button>
      </section>

      <section className="album-home__tools" aria-label="アルバム検索">
        <label className="search-box">
          <Search size={18} />
          <input
            value={searchInput}
            type="search"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="アルバム・人・タグを検索"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="検索をクリア"
            >
              <X size={16} />
            </button>
          ) : null}
        </label>
        <select
          value={sort}
          aria-label="アルバムの並び順"
          onChange={(event) => {
            const next = event.target.value as AlbumSort;
            setSort(next);
            localStorage.setItem(`mapalbum:album-sort:${userID}`, next);
          }}
        >
          <option value="updated">最終更新日が新しい順</option>
          <option value="created">作成日が新しい順</option>
          <option value="name">名前順</option>
          <option value="photos">写真枚数順</option>
          <option value="favorites">お気に入り優先</option>
        </select>
        <select
          value={folderFilter}
          aria-label="フォルダで絞り込み"
          onChange={(event) => setFolderFilter(event.target.value)}
        >
          <option value="">すべてのフォルダ</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <button
          className="secondary-button"
          type="button"
          onClick={() => setShowsFolders(true)}
        >
          <FolderCog size={17} /> フォルダ管理
        </button>
      </section>

      <section className="album-home__section">
        <div className="section-heading">
          <Images size={19} />
          <strong>アルバム一覧</strong>
          <small>{filteredAlbums.length}件</small>
        </div>
        {loading && albums.length === 0 ? (
          <p className="album-home__state">アルバムを読み込んでいます…</p>
        ) : filteredAlbums.length === 0 ? (
          <p className="album-home__state">
            {search ? "検索に一致するアルバムはありません。" : "アルバムはまだありません。"}
          </p>
        ) : (
          <div className="album-card-grid">
            {filteredAlbums.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                busy={busyAlbumID === album.id}
                onOpen={() => onOpen(album.id)}
                onToggleFavorite={() =>
                  void runAlbumAction(album, onToggleFavorite)
                }
                onToggleOffline={() =>
                  void runAlbumAction(album, onToggleOffline)
                }
              />
            ))}
          </div>
        )}
        {actionError ? (
          <p className="form-message form-message--error" role="alert">
            {actionError}
          </p>
        ) : null}
      </section>

      {recentPhotos.length > 0 ? (
        <section className="album-home__section">
          <div className="section-heading">
            <Image size={19} />
            <strong>最近追加された写真</strong>
          </div>
          <div className="album-home__recent-photos">
            {recentPhotos.slice(0, 8).map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => onOpenPhoto(photo)}
              >
                <img
                  src={photo.image_url}
                  alt={photo.title || photo.caption || "最近追加された写真"}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {favorites.length > 0 ? (
        <section className="album-home__section album-home__compact-section">
          <div className="section-heading">
            <Star size={19} fill="currentColor" />
            <strong>お気に入りアルバム</strong>
          </div>
          <div className="album-home__quick-list">
            {favorites.map((album) => (
              <button key={album.id} type="button" onClick={() => onOpen(album.id)}>
                <span style={{ background: album.theme_color ?? "#c65476" }}>
                  <Star size={15} fill="currentColor" />
                </span>
                <strong>{album.name}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {recentlyViewed.length > 0 ? (
        <section className="album-home__section album-home__compact-section">
          <div className="section-heading">
            <CalendarClock size={19} />
            <strong>最近見たアルバム</strong>
          </div>
          <div className="album-home__quick-list">
            {recentlyViewed.map((album) => (
              <button key={album.id} type="button" onClick={() => onOpen(album.id)}>
                <span style={{ background: album.theme_color ?? "#c65476" }}>
                  <Images size={15} />
                </span>
                <strong>{album.name}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <button className="album-home__map-link" type="button" onClick={onOpenMap}>
        <Map size={20} />
        <span>
          <strong>写真を地図で見る</strong>
          <small>現在地とアルバムの思い出を確認します</small>
        </span>
      </button>

      {showsFolders ? (
        <Modal title="フォルダ管理" onClose={() => setShowsFolders(false)}>
          <form className="stack-form" onSubmit={submitFolder}>
            <label className="field">
              <span>フォルダ名</span>
              <input
                value={folderName}
                maxLength={40}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="例：家族、旅行、仕事"
                required
              />
            </label>
            <label className="field">
              <span>テーマカラー</span>
              <input
                type="color"
                value={folderColor}
                onChange={(event) => setFolderColor(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit" disabled={folderBusy}>
              {editingFolder ? "変更を保存" : "フォルダを追加"}
            </button>
            {editingFolder ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setEditingFolder(null);
                  setFolderName("");
                  setFolderColor("#c65476");
                }}
              >
                編集をキャンセル
              </button>
            ) : null}
          </form>
          <div className="folder-manager__list">
            {folders.map((folder) => (
              <article key={folder.id}>
                <span style={{ background: folder.theme_color }}>
                  <Folder size={17} />
                </span>
                <strong>{folder.name}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setEditingFolder(folder);
                    setFolderName(folder.name);
                    setFolderColor(folder.theme_color);
                  }}
                >
                  編集
                </button>
                <button
                  className="danger-text-button"
                  type="button"
                  onClick={() => setDeleteFolder(folder)}
                >
                  削除
                </button>
              </article>
            ))}
          </div>
        </Modal>
      ) : null}

      {deleteFolder ? (
        <Modal
          title="このフォルダを削除しますか？"
          onClose={() => setDeleteFolder(null)}
          footer={
            <div className="logout-confirm-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDeleteFolder(null)}
              >
                キャンセル
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  const target = deleteFolder;
                  setDeleteFolder(null);
                  setActionError("");
                  void onDeleteFolder(target.id).catch((caught) =>
                    setActionError(
                      caught instanceof Error
                        ? caught.message
                        : "フォルダを削除できませんでした。",
                    ),
                  );
                }}
              >
                実行する
              </button>
            </div>
          }
        >
          <p>
            フォルダ内のアルバムは削除されません。フォルダ分けだけが解除されます。
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
