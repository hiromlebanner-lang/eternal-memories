import {
  CalendarClock,
  Cloud,
  CloudDownload,
  Filter,
  Image,
  Images,
  LayoutGrid,
  List,
  Map as MapIcon,
  Plus,
  Search,
  Star,
  Tag,
  Users,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import type { Album, AlbumPhoto, AlbumSort } from "../types";

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

type AlbumFilter =
  | "owner"
  | "participating"
  | "favorites"
  | "unread"
  | "offline"
  | "public"
  | "private"
  | "withPhotos"
  | "withoutPhotos";

const FILTER_OPTIONS: Array<{ value: AlbumFilter; label: string }> = [
  { value: "owner", label: "自分がオーナー" },
  { value: "participating", label: "参加中" },
  { value: "favorites", label: "お気に入り" },
  { value: "unread", label: "新着あり" },
  { value: "offline", label: "オフライン保存済み" },
  { value: "public", label: "公開" },
  { value: "private", label: "非公開・限定公開" },
  { value: "withPhotos", label: "写真あり" },
  { value: "withoutPhotos", label: "写真なし" },
];

const PAGE_SIZE = 40;

interface AlbumHomeProps {
  userID: string;
  albums: Album[];
  recentPhotos: AlbumPhoto[];
  loading: boolean;
  hasPendingInvitations?: boolean;
  onOpen: (albumID: string) => void;
  onOpenPhoto: (photo: AlbumPhoto) => void;
  onOpenMap: () => void;
  onCreate: () => void;
  onOpenInvitations?: () => void;
  onToggleFavorite: (album: Album) => Promise<void>;
  onToggleOffline: (album: Album) => Promise<void>;
}

function formatDate(value?: string | null) {
  if (!value) return "未更新";
  return new Date(value).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function updatedAt(album: Album) {
  return new Date(album.updated_at ?? album.created_at).getTime();
}

function AlbumCard({
  album,
  compact,
  busy,
  onOpen,
  onToggleFavorite,
  onToggleOffline,
}: {
  album: Album;
  compact: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onToggleOffline: () => void;
}) {
  const unreadCount = album.unread_count ?? 0;
  return (
    <article
      className={`album-card${compact ? " album-card--compact" : ""}`}
      style={{ "--album-accent": album.theme_color ?? "#c65476" } as CSSProperties}
    >
      <button
        type="button"
        className="album-card__open"
        onClick={onOpen}
        title={album.name}
        aria-label={`${album.name}を開く。${unreadCount > 0 ? `未確認の新着写真${unreadCount}枚。` : ""}${ROLE_LABEL[album.role]}`}
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
          {unreadCount > 0 ? (
            <span className="album-card__unread">新着{unreadCount}枚</span>
          ) : null}
        </span>
        <span className="album-card__body">
          <span className="album-card__title">
            <strong>{album.name}</strong>
          </span>
          <small className="album-card__owner">
            {album.owner_name ?? "オーナー"}・{ROLE_LABEL[album.role]}
          </small>
          <small className="album-card__updated">
            <CalendarClock size={13} />
            {formatDate(album.updated_at)}
          </small>
          <span className="album-card__stats">
            <small><Image size={13} /> {album.photo_count ?? 0}枚</small>
            <small><Users size={13} /> {album.member_count ?? 1}人</small>
          </span>
          {!compact && (album.tags?.length ?? 0) > 0 ? (
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
  loading,
  hasPendingInvitations = false,
  onOpen,
  onOpenPhoto,
  onOpenMap,
  onCreate,
  onOpenInvitations,
  onToggleFavorite,
  onToggleOffline,
}: AlbumHomeProps) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDeferredValue(searchInput.trim().toLocaleLowerCase("ja-JP"));
  const [sort, setSort] = useState<AlbumSort>(() => {
    const stored = localStorage.getItem(`mapalbum:album-sort:${userID}`);
    return stored === "updated" ||
      stored === "created" ||
      stored === "name" ||
      stored === "photos" ||
      stored === "unread" ||
      stored === "recent" ||
      stored === "favorites"
      ? stored
      : "favorites";
  });
  const [view, setView] = useState<"cards" | "compact">(() =>
    localStorage.getItem(`mapalbum:album-view:${userID}`) === "compact"
      ? "compact"
      : "cards",
  );
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(`mapalbum:album-searches:${userID}`) ?? "[]",
      );
      return Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === "string").slice(0, 5)
        : [];
    } catch {
      return [];
    }
  });
  const [selectedTag, setSelectedTag] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AlbumFilter[]>([]);
  const [busyAlbumID, setBusyAlbumID] = useState("");
  const [actionError, setActionError] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const album of albums) {
      for (const tag of album.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts]
      .sort(
        ([leftTag, leftCount], [rightTag, rightCount]) =>
          rightCount - leftCount || leftTag.localeCompare(rightTag, "ja"),
      )
      .map(([tag]) => tag);
  }, [albums]);

  const filteredAlbums = useMemo(() => {
    const matchesFilter = (album: Album, filter: AlbumFilter) => {
      switch (filter) {
        case "owner":
          return album.role === "owner";
        case "participating":
          return album.role !== "owner";
        case "favorites":
          return Boolean(album.is_favorite);
        case "unread":
          return (album.unread_count ?? 0) > 0;
        case "offline":
          return Boolean(album.offline_enabled);
        case "public":
          return album.visibility === "public";
        case "private":
          return album.visibility !== "public";
        case "withPhotos":
          return (album.photo_count ?? 0) > 0;
        case "withoutPhotos":
          return (album.photo_count ?? 0) === 0;
      }
    };

    const result = albums.filter((album) => {
      if (selectedTag && !album.tags?.includes(selectedTag)) return false;
      if (!filters.every((filter) => matchesFilter(album, filter))) return false;
      if (!search) return true;
      return [
        album.name,
        album.owner_name,
        album.description,
        album.search_text,
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
        const favoriteDifference =
          Number(Boolean(right.is_favorite)) -
          Number(Boolean(left.is_favorite));
        return favoriteDifference || updatedAt(right) - updatedAt(left);
      }
      if (sort === "unread") {
        return (
          (right.unread_count ?? 0) - (left.unread_count ?? 0) ||
          updatedAt(right) - updatedAt(left)
        );
      }
      if (sort === "recent") {
        return (
          new Date(right.last_viewed_at ?? 0).getTime() -
          new Date(left.last_viewed_at ?? 0).getTime()
        );
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
  }, [albums, filters, search, selectedTag, sort]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters, search, selectedTag, sort, view]);

  const favorites = albums.filter((album) => album.is_favorite).slice(0, 6);
  const recentlyViewed = [...albums]
    .filter((album) => album.last_viewed_at)
    .sort(
      (left, right) =>
        new Date(right.last_viewed_at ?? 0).getTime() -
        new Date(left.last_viewed_at ?? 0).getTime(),
    )
    .slice(0, 5);

  const rememberSearch = () => {
    const value = searchInput.trim();
    if (!value) return;
    const next = [value, ...searchHistory.filter((entry) => entry !== value)].slice(
      0,
      5,
    );
    setSearchHistory(next);
    localStorage.setItem(
      `mapalbum:album-searches:${userID}`,
      JSON.stringify(next),
    );
  };

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

  const toggleFilter = (filter: AlbumFilter) => {
    setFilters((current) =>
      current.includes(filter)
        ? current.filter((candidate) => candidate !== filter)
        : [...current, filter],
    );
  };

  return (
    <div className="album-home">
      <section className="album-home__intro">
        <div>
          <span className="eyebrow">あなたの思い出</span>
          <h1>専用アルバム</h1>
          <p>作成したアルバムと参加中のアルバムを、すべて直接確認できます。</p>
        </div>
        <button className="primary-button" type="button" onClick={onCreate}>
          <Plus size={18} /> 新しいアルバムを作成
        </button>
      </section>

      <section className="album-home__tools" aria-label="アルバム検索と整理">
        <label className="search-box">
          <Search size={18} />
          <input
            value={searchInput}
            type="search"
            onChange={(event) => setSearchInput(event.target.value)}
            onBlur={rememberSearch}
            onKeyDown={(event) => {
              if (event.key === "Enter") rememberSearch();
            }}
            placeholder="アルバム・人・タグ・説明を検索"
            enterKeyHint="search"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="検索文字を消す"
            >
              <X size={16} />
            </button>
          ) : null}
        </label>

        {!searchInput && searchHistory.length > 0 ? (
          <div className="album-home__search-history" aria-label="検索履歴">
            {searchHistory.map((entry) => (
              <button key={entry} type="button" onClick={() => setSearchInput(entry)}>
                {entry}
              </button>
            ))}
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setSearchHistory([]);
                localStorage.removeItem(`mapalbum:album-searches:${userID}`);
              }}
            >
              履歴を削除
            </button>
          </div>
        ) : null}

        <div className="album-home__organizers">
          <select
            value={sort}
            aria-label="アルバムの並び順"
            onChange={(event) => {
              const next = event.target.value as AlbumSort;
              setSort(next);
              localStorage.setItem(`mapalbum:album-sort:${userID}`, next);
            }}
          >
            <option value="favorites">お気に入り優先・更新順</option>
            <option value="updated">最終更新日が新しい順</option>
            <option value="created">作成日が新しい順</option>
            <option value="name">名前順</option>
            <option value="photos">写真枚数が多い順</option>
            <option value="unread">新着が多い順</option>
            <option value="recent">最近見た順</option>
          </select>
          <button
            className={showFilters || filters.length > 0 ? "is-active" : ""}
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            aria-expanded={showFilters}
          >
            <Filter size={17} />
            絞り込み{filters.length > 0 ? ` ${filters.length}` : ""}
          </button>
          <div className="album-home__view-switch" aria-label="表示形式">
            <button
              className={view === "cards" ? "is-active" : ""}
              type="button"
              onClick={() => {
                setView("cards");
                localStorage.setItem(`mapalbum:album-view:${userID}`, "cards");
              }}
              aria-label="カード表示"
              aria-pressed={view === "cards"}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              className={view === "compact" ? "is-active" : ""}
              type="button"
              onClick={() => {
                setView("compact");
                localStorage.setItem(`mapalbum:album-view:${userID}`, "compact");
              }}
              aria-label="コンパクト一覧表示"
              aria-pressed={view === "compact"}
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="album-home__filters">
            {FILTER_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={filters.includes(option.value)}
                  onChange={() => toggleFilter(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
            {filters.length > 0 ? (
              <button className="text-button" type="button" onClick={() => setFilters([])}>
                すべて解除
              </button>
            ) : null}
          </div>
        ) : null}

        {tags.length > 0 ? (
          <div className="album-home__tags" aria-label="タグで絞り込み">
            <Tag size={16} aria-hidden="true" />
            {(showAllTags ? tags : tags.slice(0, 6)).map((tag) => (
              <button
                className={selectedTag === tag ? "is-active" : ""}
                key={tag}
                type="button"
                onClick={() =>
                  setSelectedTag((current) => (current === tag ? "" : tag))
                }
                aria-pressed={selectedTag === tag}
              >
                #{tag}
              </button>
            ))}
            {tags.length > 6 ? (
              <button
                className="text-button"
                type="button"
                onClick={() => setShowAllTags((current) => !current)}
              >
                {showAllTags ? "よく使うタグだけ" : "すべて表示"}
              </button>
            ) : null}
          </div>
        ) : null}

        {filters.length > 0 || selectedTag ? (
          <div className="album-home__active-filters" role="status">
            <span>適用中:</span>
            {selectedTag ? <strong>#{selectedTag}</strong> : null}
            {filters.map((filter) => (
              <strong key={filter}>
                {FILTER_OPTIONS.find((option) => option.value === filter)?.label}
              </strong>
            ))}
            <button
              type="button"
              onClick={() => {
                setFilters([]);
                setSelectedTag("");
              }}
            >
              すべて解除
            </button>
          </div>
        ) : null}
      </section>

      {favorites.length > 0 ? (
        <section className="album-home__section album-home__compact-section">
          <div className="section-heading">
            <Star size={19} fill="currentColor" />
            <strong>お気に入り</strong>
          </div>
          <div className="album-home__quick-list">
            {favorites.map((album) => (
              <button key={album.id} type="button" onClick={() => onOpen(album.id)}>
                <span
                  className="album-home__quick-cover"
                  style={
                    album.cover_url
                      ? { backgroundImage: `url("${encodeURI(album.cover_url)}")` }
                      : { background: album.theme_color ?? "#c65476" }
                  }
                >
                  {!album.cover_url ? <Star size={15} fill="currentColor" /> : null}
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
                <span
                  className="album-home__quick-cover"
                  style={
                    album.cover_url
                      ? { backgroundImage: `url("${encodeURI(album.cover_url)}")` }
                      : { background: album.theme_color ?? "#c65476" }
                  }
                >
                  {!album.cover_url ? <Images size={15} /> : null}
                </span>
                <strong>{album.name}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="album-home__section">
        <div className="section-heading">
          <Images size={19} />
          <strong>すべてのアルバム</strong>
          <small>{filteredAlbums.length}件</small>
        </div>
        {loading && albums.length === 0 ? (
          <p className="album-home__state">アルバムを読み込んでいます…</p>
        ) : filteredAlbums.length === 0 ? (
          search || filters.length > 0 || selectedTag ? (
            <p className="album-home__state">該当するアルバムがありません</p>
          ) : (
            <div className="album-home__empty">
              <Images size={34} aria-hidden="true" />
              <strong>まだアルバムがありません</strong>
              <p>最初のアルバムを作って、思い出を残しましょう。</p>
              <button className="primary-button" type="button" onClick={onCreate}>
                <Plus size={18} /> アルバムを作成
              </button>
              {hasPendingInvitations && onOpenInvitations ? (
                <button className="secondary-button" type="button" onClick={onOpenInvitations}>
                  共有アルバムの招待を確認
                </button>
              ) : null}
            </div>
          )
        ) : (
          <>
            <div
              className={`album-card-grid${view === "compact" ? " is-compact" : ""}`}
            >
              {filteredAlbums.slice(0, visibleCount).map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  compact={view === "compact"}
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
            {visibleCount < filteredAlbums.length ? (
              <button
                className="secondary-button album-home__load-more"
                type="button"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
              >
                さらに表示
              </button>
            ) : null}
          </>
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

      <button className="album-home__map-link" type="button" onClick={onOpenMap}>
        <MapIcon size={20} />
        <span>
          <strong>写真を地図で見る</strong>
          <small>現在地とアルバムの思い出を確認します</small>
        </span>
      </button>
    </div>
  );
}
