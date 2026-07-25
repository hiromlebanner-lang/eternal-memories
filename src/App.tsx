import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  Images,
  Camera,
  ChevronDown,
  CircleUserRound,
  CloudOff,
  Grid2X2,
  LogOut,
  Map as MapIcon,
  Moon,
  Search,
  Settings,
  Sun,
  UserPlus,
  Wifi,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlbumManager } from "./components/AlbumManager";
import { AuthScreen } from "./components/AuthScreen";
import { MapPanel } from "./components/MapPanel";
import { MemberManager } from "./components/MemberManager";
import { Modal } from "./components/Modal";
import { PhotoDetail } from "./components/PhotoDetail";
import { PhotoEditor } from "./components/PhotoEditor";
import { PhotoGrid } from "./components/PhotoGrid";
import { ShareAlbumModal } from "./components/ShareAlbumModal";
import {
  clearPrivateOfflineData,
  createAlbum,
  deletePhoto,
  loadAlbums,
  loadPhotos,
  requestAlbumMembership,
  updatePhoto,
  uploadPhoto,
} from "./lib/data";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type {
  Album,
  AlbumPhoto,
  AppUser,
  PhotoCategory,
  PhotoLocationGroup,
} from "./types";

type ViewMode = "map" | "photos";

function authReturnURL(mode?: "recovery") {
  const url = new URL(window.location.pathname, window.location.origin);
  const query = new URLSearchParams(window.location.search);
  const inviteCode = query.get("join");
  const inviteToken = query.get("invite");
  if (inviteCode) url.searchParams.set("join", inviteCode);
  if (inviteToken) url.searchParams.set("invite", inviteToken);
  if (mode === "recovery") url.searchParams.set("auth", "recovery");
  return url.toString();
}

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
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => new URLSearchParams(window.location.search).get("auth") === "recovery",
  );

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    void client.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setAuthReady(true));
    const { data: listener } = client.auth.onAuthStateChange(
      (event: AuthChangeEvent, nextSession) => {
        setSession(nextSession);
        setAuthReady(true);
        if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
        if (event === "SIGNED_OUT") void clearPrivateOfflineData();
      },
    );
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
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: authReturnURL(),
        },
      });
      if (error) throw error;
      if (!data.session) {
        setAuthMessage(
          "確認メールを送信しました。メール内のリンクを開いて登録を完了してください。",
        );
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const socialLogin = async (provider: "google" | "apple") => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: authReturnURL() },
      });
      if (error) throw error;
    } finally {
      setAuthBusy(false);
    }
  };

  const requestPasswordReset = async (email: string) => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: authReturnURL("recovery"),
      });
      if (error) throw error;
      setAuthMessage(
        "パスワード再設定メールを送信しました。メールに記載されたリンクを開いてください。",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const updatePassword = async (password: string) => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPasswordRecovery(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("auth");
      url.searchParams.delete("code");
      url.hash = "";
      window.history.replaceState({}, "", url);
      await supabase.auth.signOut({ scope: "local" });
      await clearPrivateOfflineData();
      setAuthMessage(
        "パスワードを更新しました。新しいパスワードでログインしてください。",
      );
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

  const user = session?.user ? userFromSupabase(session.user) : null;

  if (!user || passwordRecovery) {
    return (
      <AuthScreen
        configured={isSupabaseConfigured}
        busy={authBusy}
        message={authMessage}
        recoveryMode={passwordRecovery}
        onEmailLogin={emailLogin}
        onEmailSignup={emailSignup}
        onPasswordResetRequest={requestPasswordReset}
        onPasswordUpdate={updatePassword}
        onGoogleLogin={() => socialLogin("google")}
        onAppleLogin={() => socialLogin("apple")}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      onSignOut={async () => {
        await supabase?.auth.signOut();
        await clearPrivateOfflineData();
      }}
    />
  );
}

function Dashboard({
  user,
  onSignOut,
}: {
  user: AppUser;
  onSignOut: () => Promise<void>;
}) {
  const [dark, setDark] = useDarkMode();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumID, setSelectedAlbumID] = useState("");
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
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

  const refreshAlbums = useCallback(async () => {
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
  }, [user.id]);

  const refreshPhotos = useCallback(async () => {
    if (!selectedAlbumID) {
      setPhotos([]);
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
  }, [selectedAlbumID]);

  useEffect(() => {
    void refreshAlbums();
  }, [refreshAlbums]);

  useEffect(() => {
    void refreshPhotos();
  }, [refreshPhotos]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const inviteCode = query.get("join");
    const inviteToken = query.get("invite");
    if ((!inviteCode && !inviteToken) || inviteHandled.current) return;
    inviteHandled.current = true;

    const acceptInvite = async () => {
      try {
        await requestAlbumMembership({
          inviteCode: inviteCode ?? undefined,
          inviteToken: inviteToken ?? undefined,
        });
        setToast("参加申請を送りました。承認後にアルバムが表示されます");
        const url = new URL(window.location.href);
        url.searchParams.delete("join");
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url);
      } catch (caught) {
        setToast(caught instanceof Error ? caught.message : "招待を確認できませんでした。");
      }
    };
    void acceptInvite();
  }, []);

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
    if (!supabase || !selectedAlbumID) return;
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
  }, [refreshPhotos, selectedAlbumID]);

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
    selectedAlbum?.role === "owner" ||
    selectedAlbum?.role === "admin" ||
    selectedAlbum?.role === "member";
  const canEdit = (photo: AlbumPhoto) =>
    selectedAlbum?.role === "owner" ||
    selectedAlbum?.role === "admin" ||
    (selectedAlbum?.role === "member" && photo.author_id === user.id);
  const canDelete = (photo: AlbumPhoto) =>
    selectedAlbum?.role === "owner" ||
    selectedAlbum?.role === "admin" ||
    photo.author_id === user.id;

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
      await updatePhoto(editingPhoto.id, {
        caption: values.caption,
        category: values.category,
        captured_at: values.capturedAt,
        latitude: values.latitude,
        longitude: values.longitude,
      });
      await refreshPhotos();
      setToast("写真を更新しました");
      setEditingPhoto(undefined);
      return;
    }

    if (!values.file) throw new Error("写真を選択してください。");
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
    setToast("写真をアルバムに追加しました");
  };

  const removePhoto = async (photo: AlbumPhoto) => {
    await deletePhoto(photo);
    await refreshPhotos();
    await refreshAlbums();
    setDetailPhotos((current) => current.filter((candidate) => candidate.id !== photo.id));
    setToast("写真を削除しました");
  };

  const addAlbum = async (name: string, description: string) => {
    const id = await createAlbum(name, description);
    await refreshAlbums();
    setSelectedAlbumID(id);
    setToast("アルバムを作成しました");
  };

  const enterAlbum = async (code: string) => {
    await requestAlbumMembership({ inviteCode: code });
    setToast("参加申請を送りました。承認後にアルバムが表示されます");
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
          canDelete={canDelete}
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
        <ShareAlbumModal
          album={selectedAlbum}
          onClose={() => setShowsShare(false)}
          onNotice={setToast}
          onManageMembers={() => {
            setShowsShare(false);
            setShowsMembers(true);
          }}
        />
      ) : null}

      {showsMembers && selectedAlbum ? (
        <MemberManager
          album={selectedAlbum}
          currentUser={user}
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
