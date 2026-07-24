import type { Session, User } from "@supabase/supabase-js";
import {
  Images,
  Camera,
  ChevronDown,
  CircleUserRound,
  CloudOff,
  Copy,
  Grid2X2,
  LogOut,
  Map as MapIcon,
  Moon,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Sun,
  UserPlus,
  Wifi,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlbumManager } from "./components/AlbumManager";
import { AuthScreen } from "./components/AuthScreen";
import { InviteQRCode } from "./components/InviteQRCode";
import { MapPanel } from "./components/MapPanel";
import { MemberManager } from "./components/MemberManager";
import { Modal } from "./components/Modal";
import { PhotoDetail } from "./components/PhotoDetail";
import { PhotoEditor } from "./components/PhotoEditor";
import { PhotoGrid } from "./components/PhotoGrid";
import {
  createAlbum,
  deletePhoto,
  joinAlbum,
  loadAlbums,
  loadPhotos,
  updatePhoto,
  uploadPhoto,
} from "./lib/data";
import { DEMO_ALBUMS, DEMO_PHOTOS, DEMO_USER } from "./lib/demo";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type {
  Album,
  AlbumPhoto,
  AppUser,
  PhotoCategory,
  PhotoLocationGroup,
} from "./types";

type ViewMode = "map" | "photos";

function userFromSupabase(user: User): AppUser {
  return {
    id: user.id,
    email: user.email ?? "",
    displayName:
      user.user_metadata?.display_name ??
      user.user_metadata?.full_name ??
      user.email?.split("@")[0] ??
      "メンバー",
    avatarUrl: user.user_metadata?.avatar_url,
  };
}

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("mapalbum:theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("mapalbum:theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, setDark] as const;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [demoActive, setDemoActive] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const emailLogin = async (email: string, password: string) => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } finally {
      setAuthBusy(false);
    }
  };

  const emailSignup = async (
    displayName: string,
    email: string,
    password: string,
  ) => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) throw error;
      if (!data.session) {
        setAuthMessage("確認メールを送信しました。メール内のリンクを開いてください。");
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const googleLogin = async () => {
    if (!supabase) return;
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href },
      });
      if (error) throw error;
    } finally {
      setAuthBusy(false);
    }
  };

  if (!authReady) {
    return (
      <main className="preparing-app">
        <div className="preparing-logo">🗺️</div>
        <h1>MapAlbum</h1>
        <p>アルバムを読み込んでいます…</p>
        <div className="preparing-bar" aria-hidden="true" />
      </main>
    );
  }

  const user = demoActive
    ? DEMO_USER
    : session?.user
      ? userFromSupabase(session.user)
      : null;

  if (!user) {
    return (
      <AuthScreen
        demoMode={!isSupabaseConfigured}
        busy={authBusy}
        message={authMessage}
        onEmailLogin={emailLogin}
        onEmailSignup={emailSignup}
        onGoogleLogin={googleLogin}
        onOpenDemo={() => setDemoActive(true)}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      demoMode={demoActive}
      onSignOut={async () => {
        if (demoActive) setDemoActive(false);
        else await supabase?.auth.signOut();
      }}
    />
  );
}

function Dashboard({
  user,
  demoMode,
  onSignOut,
}: {
  user: AppUser;
  demoMode: boolean;
  onSignOut: () => Promise<void>;
}) {
  const [dark, setDark] = useDarkMode();
  const [albums, setAlbums] = useState<Album[]>(demoMode ? DEMO_ALBUMS : []);
  const [selectedAlbumID, setSelectedAlbumID] = useState<string>(
    demoMode ? DEMO_ALBUMS[0].id : "",
  );
  const [photos, setPhotos] = useState<AlbumPhoto[]>(
    demoMode
      ? DEMO_PHOTOS.filter((photo) => photo.album_id === DEMO_ALBUMS[0].id)
      : [],
  );
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(!demoMode);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [usingCache, setUsingCache] = useState(false);
  const [toast, setToast] = useState("");

  const [showsAlbumManager, setShowsAlbumManager] = useState(false);
  const [showsPhotoEditor, setShowsPhotoEditor] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<AlbumPhoto>();
  const [detailPhotos, setDetailPhotos] = useState<AlbumPhoto[]>([]);
  const [detailPhotoID, setDetailPhotoID] = useState<string>();
  const [showsShare, setShowsShare] = useState(false);
  const [showsMembers, setShowsMembers] = useState(false);
  const [showsSettings, setShowsSettings] = useState(false);
  const inviteHandled = useRef(false);

  const selectedAlbum = albums.find((album) => album.id === selectedAlbumID);
  const selectedAlbumInviteURL = selectedAlbum
    ? `${window.location.origin}/?join=${encodeURIComponent(selectedAlbum.invite_code)}`
    : "";

  const refreshAlbums = useCallback(async () => {
    if (demoMode) return;
    try {
      const result = await loadAlbums(user.id);
      setAlbums(result.data);
      setUsingCache(result.fromCache);
      setSelectedAlbumID((current) =>
        result.data.some((album) => album.id === current)
          ? current
          : (result.data[0]?.id ?? ""),
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "アルバムを読み込めませんでした。");
    }
  }, [demoMode, user.id]);

  const refreshPhotos = useCallback(async () => {
    if (!selectedAlbumID) {
      setPhotos([]);
      setLoading(false);
      return;
    }

    if (demoMode) {
      setPhotos(DEMO_PHOTOS.filter((photo) => photo.album_id === selectedAlbumID));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await loadPhotos(selectedAlbumID);
      setPhotos(result.data);
      setUsingCache(result.fromCache);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "写真を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [demoMode, selectedAlbumID]);

  useEffect(() => {
    void refreshAlbums();
  }, [refreshAlbums]);

  useEffect(() => {
    void refreshPhotos();
  }, [refreshPhotos]);

  useEffect(() => {
    const inviteCode = new URLSearchParams(window.location.search).get("join");
    if (!inviteCode || inviteHandled.current) return;
    inviteHandled.current = true;

    const acceptInvite = async () => {
      try {
        let albumID = "";
        if (demoMode) {
          albumID =
            DEMO_ALBUMS.find(
              (album) =>
                album.invite_code.replaceAll("-", "") ===
                inviteCode.replaceAll("-", ""),
            )?.id ?? "";
          if (!albumID) throw new Error("招待コードが見つかりません。");
        } else {
          albumID = await joinAlbum(inviteCode);
          await refreshAlbums();
        }
        setSelectedAlbumID(albumID);
        setToast("招待されたアルバムに参加しました");
        const url = new URL(window.location.href);
        url.searchParams.delete("join");
        window.history.replaceState({}, "", url);
      } catch (caught) {
        setToast(caught instanceof Error ? caught.message : "招待を確認できませんでした。");
      }
    };
    void acceptInvite();
  }, [demoMode, refreshAlbums]);

  useEffect(() => {
    const online = () => {
      setOffline(false);
      void refreshAlbums();
      void refreshPhotos();
    };
    const offlineNow = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineNow);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineNow);
    };
  }, [refreshAlbums, refreshPhotos]);

  useEffect(() => {
    if (!supabase || demoMode || !selectedAlbumID) return;
    const client = supabase;
    const channel = client
      .channel(`photos:${selectedAlbumID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "photos",
          filter: `album_id=eq.${selectedAlbumID}`,
        },
        () => void refreshPhotos(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [demoMode, refreshPhotos, selectedAlbumID]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredPhotos = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ja");
    if (!query) return photos;
    return photos.filter((photo) => {
      const haystack = `${photo.caption} ${photo.author_name} ${photo.category}`.toLocaleLowerCase(
        "ja",
      );
      return haystack.includes(query);
    });
  }, [photos, search]);

  const canPost =
    selectedAlbum?.role === "admin" || selectedAlbum?.role === "editor";
  const canEdit = (photo: AlbumPhoto) =>
    selectedAlbum?.role === "admin" || photo.author_id === user.id;

  const openPhoto = (photo: AlbumPhoto) => {
    setDetailPhotos([photo]);
    setDetailPhotoID(photo.id);
  };

  const openGroup = (group: PhotoLocationGroup) => {
    setDetailPhotos(group.photos);
    setDetailPhotoID(group.photos[0]?.id);
  };

  const savePhoto = async (values: {
    file?: File;
    caption: string;
    category: PhotoCategory;
    capturedAt: string;
    latitude: number;
    longitude: number;
  }) => {
    if (!selectedAlbum) throw new Error("アルバムが選択されていません。");

    if (editingPhoto) {
      if (demoMode) {
        setPhotos((current) =>
          current.map((photo) =>
            photo.id === editingPhoto.id
              ? {
                  ...photo,
                  caption: values.caption,
                  category: values.category,
                  captured_at: values.capturedAt,
                  latitude: values.latitude,
                  longitude: values.longitude,
                }
              : photo,
          ),
        );
      } else {
        await updatePhoto(editingPhoto.id, {
          caption: values.caption,
          category: values.category,
          captured_at: values.capturedAt,
          latitude: values.latitude,
          longitude: values.longitude,
        });
        await refreshPhotos();
      }
      setToast("写真を更新しました");
      setEditingPhoto(undefined);
      return;
    }

    if (!values.file) throw new Error("写真を選択してください。");
    if (demoMode) {
      const nextPhoto: AlbumPhoto = {
        id: crypto.randomUUID(),
        album_id: selectedAlbum.id,
        author_id: user.id,
        author_name: user.displayName,
        storage_path: "",
        image_url: URL.createObjectURL(values.file),
        caption: values.caption,
        category: values.category,
        captured_at: values.capturedAt,
        created_at: new Date().toISOString(),
        latitude: values.latitude,
        longitude: values.longitude,
      };
      setPhotos((current) => [nextPhoto, ...current]);
    } else {
      await uploadPhoto({
        albumID: selectedAlbum.id,
        authorID: user.id,
        authorName: user.displayName,
        file: values.file,
        caption: values.caption,
        category: values.category,
        capturedAt: values.capturedAt,
        latitude: values.latitude,
        longitude: values.longitude,
      });
      await refreshPhotos();
      await refreshAlbums();
    }
    setToast("写真をアルバムに追加しました");
  };

  const removePhoto = async (photo: AlbumPhoto) => {
    if (demoMode) {
      setPhotos((current) => current.filter((candidate) => candidate.id !== photo.id));
    } else {
      await deletePhoto(photo);
      await refreshPhotos();
      await refreshAlbums();
    }
    setDetailPhotos((current) => current.filter((candidate) => candidate.id !== photo.id));
    setToast("写真を削除しました");
  };

  const addAlbum = async (name: string, description: string) => {
    if (demoMode) {
      const next: Album = {
        id: crypto.randomUUID(),
        name,
        description,
        invite_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
        created_by: user.id,
        created_at: new Date().toISOString(),
        role: "admin",
        photo_count: 0,
        member_count: 1,
      };
      setAlbums((current) => [next, ...current]);
      setSelectedAlbumID(next.id);
      setPhotos([]);
    } else {
      const id = await createAlbum(name, description);
      await refreshAlbums();
      setSelectedAlbumID(id);
    }
    setToast("アルバムを作成しました");
  };

  const enterAlbum = async (code: string) => {
    if (demoMode) {
      const found = albums.find(
        (album) => album.invite_code.replaceAll("-", "") === code.replaceAll("-", ""),
      );
      if (!found) throw new Error("デモ内に一致する招待コードがありません。");
      setSelectedAlbumID(found.id);
    } else {
      const id = await joinAlbum(code);
      await refreshAlbums();
      setSelectedAlbumID(id);
    }
    setToast("共有アルバムに参加しました");
  };

  const shareAlbum = async () => {
    if (!selectedAlbum) return;
    const message = `MapAlbum「${selectedAlbum.name}」への招待コード: ${selectedAlbum.invite_code}`;
    if (navigator.share) {
      await navigator.share({
        title: selectedAlbum.name,
        text: message,
        url: selectedAlbumInviteURL,
      });
    } else {
      await navigator.clipboard.writeText(`${message}\n${selectedAlbumInviteURL}`);
      setToast("招待リンクをコピーしました");
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand-button" type="button" onClick={() => setShowsAlbumManager(true)}>
          <span className="brand-mark brand-mark--small">
            <MapIcon size={20} />
            <span>●</span>
          </span>
          <span className="brand-title">MapAlbum</span>
        </button>

        <button className="album-selector" type="button" onClick={() => setShowsAlbumManager(true)}>
          <span>
            <small>共有アルバム</small>
            <strong>{selectedAlbum?.name ?? "アルバムを選択"}</strong>
          </span>
          <ChevronDown size={17} />
        </button>

        <div className="header-actions">
          {selectedAlbum ? (
            <button className="icon-button" type="button" onClick={() => setShowsShare(true)} aria-label="共有">
              <UserPlus size={20} />
            </button>
          ) : null}
          <button
            className="avatar-button"
            type="button"
            onClick={() => setShowsSettings(true)}
            aria-label="設定"
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" />
            ) : (
              user.displayName.slice(0, 1)
            )}
          </button>
        </div>
      </header>

      {(offline || usingCache) && (
        <div className="offline-banner">
          <CloudOff size={15} />
          {offline
            ? "オフラインです。保存済みの地図と写真を表示しています。"
            : "一部のデータを端末キャッシュから表示しています。"}
        </div>
      )}

      {demoMode ? (
        <div className="demo-banner">
          <span>デモモード</span>
          Supabaseを設定すると、端末間共有が有効になります。
        </div>
      ) : null}

      <main className="app-main">
        {selectedAlbum ? (
          <>
            <section className="album-hero">
              <div>
                <span className="eyebrow">みんなの思い出</span>
                <h1>{selectedAlbum.name}</h1>
                <p>{selectedAlbum.description || "写真と場所をみんなで残す共有アルバム"}</p>
              </div>
              <div className="album-stats">
                <span>
                  <strong>{photos.length}</strong>
                  写真
                </span>
                <span>
                  <strong>{selectedAlbum.member_count ?? 1}</strong>
                  メンバー
                </span>
              </div>
            </section>

            <section className="view-toolbar">
              <div className="search-box">
                <Search size={18} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="写真・コメント・投稿者を検索"
                  aria-label="写真を検索"
                />
                {search ? (
                  <button type="button" onClick={() => setSearch("")} aria-label="検索をクリア">
                    <X size={16} />
                  </button>
                ) : null}
              </div>

              <div className="segmented-control" aria-label="表示切り替え">
                <button
                  type="button"
                  className={viewMode === "map" ? "is-active" : ""}
                  onClick={() => setViewMode("map")}
                >
                  <MapIcon size={16} />
                  地図
                </button>
                <button
                  type="button"
                  className={viewMode === "photos" ? "is-active" : ""}
                  onClick={() => setViewMode("photos")}
                >
                  <Grid2X2 size={16} />
                  写真
                </button>
              </div>
            </section>

            <section className={viewMode === "map" ? "content-stage content-stage--map" : "content-stage"}>
              {loading ? (
                <div className="loading-state">
                  <span />
                  <p>思い出を読み込んでいます…</p>
                </div>
              ) : viewMode === "map" ? (
                <MapPanel photos={filteredPhotos} onSelect={openGroup} />
              ) : (
                <PhotoGrid photos={filteredPhotos} onSelect={openPhoto} />
              )}
            </section>
          </>
        ) : (
          <div className="welcome-empty">
            <span>🗺️</span>
            <h1>最初のアルバムを作りましょう</h1>
            <p>家族や友だちと、写真と撮影場所を一緒に残せます。</p>
            <button className="primary-button" type="button" onClick={() => setShowsAlbumManager(true)}>
              <Images size={18} />
              アルバムを始める
            </button>
          </div>
        )}
      </main>

      <nav className="bottom-nav" aria-label="メインメニュー">
        <button
          type="button"
          className={viewMode === "map" ? "is-active" : ""}
          onClick={() => setViewMode("map")}
        >
          <MapIcon />
          <span>地図</span>
        </button>
        <button
          type="button"
          className={viewMode === "photos" ? "is-active" : ""}
          onClick={() => setViewMode("photos")}
        >
          <Grid2X2 />
          <span>写真</span>
        </button>
        <button
          type="button"
          className="camera-action"
          disabled={!canPost || offline}
          onClick={() => {
            setEditingPhoto(undefined);
            setShowsPhotoEditor(true);
          }}
          aria-label="写真を追加"
        >
          <Camera />
        </button>
        <button type="button" onClick={() => setShowsAlbumManager(true)}>
          <Images />
          <span>アルバム</span>
        </button>
        <button type="button" onClick={() => setShowsSettings(true)}>
          <Settings />
          <span>設定</span>
        </button>
      </nav>

      {showsAlbumManager ? (
        <AlbumManager
          albums={albums}
          selectedAlbumID={selectedAlbumID}
          onClose={() => setShowsAlbumManager(false)}
          onSelect={setSelectedAlbumID}
          onCreate={addAlbum}
          onJoin={enterAlbum}
        />
      ) : null}

      {showsPhotoEditor ? (
        <PhotoEditor
          photo={editingPhoto}
          onClose={() => {
            setShowsPhotoEditor(false);
            setEditingPhoto(undefined);
          }}
          onSave={savePhoto}
        />
      ) : null}

      {detailPhotos.length > 0 ? (
        <PhotoDetail
          photos={detailPhotos}
          initialPhotoID={detailPhotoID}
          canEdit={canEdit}
          onClose={() => {
            setDetailPhotos([]);
            setDetailPhotoID(undefined);
          }}
          onEdit={(photo) => {
            setDetailPhotos([]);
            setEditingPhoto(photo);
            setShowsPhotoEditor(true);
          }}
          onDelete={removePhoto}
        />
      ) : null}

      {showsShare && selectedAlbum ? (
        <Modal title="メンバーを招待" onClose={() => setShowsShare(false)}>
          <div className="share-panel">
            <div className="share-illustration">💌</div>
            <h3>{selectedAlbum.name}</h3>
            <p>このコードか共有リンクを、参加してほしい人へ送ってください。</p>
            <InviteQRCode value={selectedAlbumInviteURL} />
            <button
              type="button"
              className="invite-code"
              onClick={async () => {
                await navigator.clipboard.writeText(selectedAlbum.invite_code);
                setToast("招待コードをコピーしました");
              }}
            >
              <small>招待コード</small>
              <strong>{selectedAlbum.invite_code}</strong>
              <Copy size={18} />
            </button>
            <button className="primary-button" type="button" onClick={() => void shareAlbum()}>
              <Share2 size={18} />
              招待リンクを共有
            </button>
            {selectedAlbum.role === "admin" ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowsShare(false);
                  setShowsMembers(true);
                }}
              >
                <ShieldCheck size={18} />
                メンバーの権限を管理
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {showsMembers && selectedAlbum ? (
        <MemberManager
          album={selectedAlbum}
          currentUser={user}
          demoMode={demoMode}
          onClose={() => setShowsMembers(false)}
        />
      ) : null}

      {showsSettings ? (
        <Modal title="設定" onClose={() => setShowsSettings(false)}>
          <div className="settings-panel">
            <div className="profile-row">
              <span className="profile-avatar">
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1)}
              </span>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </span>
            </div>
            <button
              type="button"
              className="settings-row"
              onClick={() => setDark((current) => !current)}
            >
              {dark ? <Moon size={19} /> : <Sun size={19} />}
              <span>
                <strong>ダークモード</strong>
                <small>端末ごとに保存されます</small>
              </span>
              <span className={dark ? "toggle is-on" : "toggle"} />
            </button>
            <div className="settings-row settings-row--static">
              {offline ? <CloudOff size={19} /> : <Wifi size={19} />}
              <span>
                <strong>オフライン閲覧</strong>
                <small>一度表示した地図と写真を自動保存</small>
              </span>
            </div>
            <div className="install-note">
              <CircleUserRound size={20} />
              <p>
                iPhoneではSafariの共有ボタンから「ホーム画面に追加」を選ぶと、
                アプリのように起動できます。
              </p>
            </div>
            <button
              className="danger-button danger-button--wide"
              type="button"
              onClick={() => void onSignOut()}
            >
              <LogOut size={18} />
              ログアウト
            </button>
          </div>
        </Modal>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
