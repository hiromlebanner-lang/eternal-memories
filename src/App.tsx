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
import { NearbyPeopleSettings } from "./components/NearbyPeopleSettings";
import { PhotoDetail } from "./components/PhotoDetail";
import { PhotoEditor } from "./components/PhotoEditor";
import { PhotoGrid } from "./components/PhotoGrid";
import { ShareAlbumModal } from "./components/ShareAlbumModal";
import {
  clearPrivateOfflineData,
  createAlbum,
  deletePhoto,
  loadAlbumInviteCode,
  loadAlbums,
  loadMyPendingJoinRequests,
  loadPhotos,
  requestAlbumMembership,
  updatePhoto,
  uploadPhoto,
} from "./lib/data";
import {
  canDeletePhoto,
  canEditPhoto,
  canManageAlbum,
  canPostPhoto,
} from "./lib/permissions";
import {
  createNearbyInvitation,
  respondToNearbyInvitation,
  useNearbyPeople,
} from "./lib/nearby";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { CATEGORY_META } from "./types";
import type {
  Album,
  AlbumPhoto,
  AppUser,
  NearbyInvitation,
  NearbyUser,
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
  const [sharingAlbum, setSharingAlbum] = useState<Album>();
  const [showsMembers, setShowsMembers] = useState(false);
  const [showsSettings, setShowsSettings] = useState(false);
  const [pendingJoinCount, setPendingJoinCount] = useState(0);
  const [busyNearbyUserID, setBusyNearbyUserID] = useState<string>();
  const [busyNearbyInvitationID, setBusyNearbyInvitationID] =
    useState<string>();
  const inviteHandled = useRef(false);

  const selectedAlbum = albums.find((album) => album.id === selectedAlbumID);
  const canInviteNearby = Boolean(
    selectedAlbum && canManageAlbum(selectedAlbum.role),
  );
  const nearby = useNearbyPeople({
    user,
    selectedAlbumID: selectedAlbum?.id,
    canInvite: canInviteNearby,
  });

  const refreshAlbums = useCallback(async () => {
    try {
      const [result, pendingRequests] = await Promise.all([
        loadAlbums(user.id),
        loadMyPendingJoinRequests(user.id),
      ]);
      setAlbums(result.data);
      setPendingJoinCount(pendingRequests.length);
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
        setPendingJoinCount((current) => current + 1);
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
    if (!supabase) return;
    const client = supabase;
    const membershipChannel = client
      .channel(`memberships:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "album_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => void refreshAlbums(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "album_join_requests",
          filter: `user_id=eq.${user.id}`,
        },
        () => void refreshAlbums(),
      )
      .subscribe();
    return () => {
      void client.removeChannel(membershipChannel);
    };
  }, [refreshAlbums, user.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredPhotos = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ja");
    if (!query) return photos;
    return photos.filter((photo) => {
      const haystack = `${photo.caption} ${photo.author_name} ${photo.category} ${CATEGORY_META[photo.category].label}`.toLocaleLowerCase(
        "ja",
      );
      return haystack.includes(query);
    });
  }, [photos, search]);

  const canPost = canPostPhoto(selectedAlbum?.role);
  const canEdit = (photo: AlbumPhoto) =>
    canEditPhoto(selectedAlbum?.role, user.id, photo.author_id);
  const canDelete = (photo: AlbumPhoto) =>
    canDeletePhoto(selectedAlbum?.role, user.id, photo.author_id);

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
    const result = await deletePhoto(photo);
    await refreshPhotos();
    await refreshAlbums();
    setDetailPhotos((current) => current.filter((candidate) => candidate.id !== photo.id));
    setToast(
      result.storageRemoved
        ? "写真を削除しました"
        : "写真を削除しました。画像ファイルの後処理は再試行が必要です",
    );
  };

  const addAlbum = async (name: string, description: string) => {
    const id = await createAlbum(name, description);
    await refreshAlbums();
    setSelectedAlbumID(id);
    setToast("アルバムを作成しました");
  };

  const enterAlbum = async (code: string) => {
    await requestAlbumMembership({ inviteCode: code });
    setPendingJoinCount((current) => current + 1);
    setToast("参加申請を送りました。承認後にアルバムが表示されます");
  };

  const openShare = async () => {
    if (!selectedAlbum || !canManageAlbum(selectedAlbum.role)) return;
    try {
      const inviteCode = await loadAlbumInviteCode(selectedAlbum.id);
      setSharingAlbum({ ...selectedAlbum, invite_code: inviteCode });
      setShowsShare(true);
    } catch (caught) {
      setToast(
        caught instanceof Error ? caught.message : "招待情報を取得できませんでした。",
      );
    }
  };

  const inviteNearbyUser = async (candidate: NearbyUser) => {
    if (!selectedAlbum || !canInviteNearby) return;
    setBusyNearbyUserID(candidate.id);
    try {
      await createNearbyInvitation(selectedAlbum.id, candidate.id);
      setToast(
        `${candidate.displayName}さんへ招待を送りました。相手が受け取ると参加申請になります`,
      );
    } catch (caught) {
      setToast(
        caught instanceof Error
          ? caught.message
          : "近くの人へ招待を送れませんでした。",
      );
    } finally {
      setBusyNearbyUserID(undefined);
    }
  };

  const respondNearbyInvitation = async (
    invitation: NearbyInvitation,
    accept: boolean,
  ) => {
    setBusyNearbyInvitationID(invitation.id);
    try {
      await respondToNearbyInvitation(invitation.id, accept);
      await nearby.refreshIncomingInvitations();
      if (accept) {
        setPendingJoinCount((current) => current + 1);
        setToast(
          "参加申請を送りました。オーナーまたは管理者の承認後に参加できます",
        );
      } else {
        setToast("招待を辞退しました");
      }
    } catch (caught) {
      setToast(
        caught instanceof Error
          ? caught.message
          : "近くの人からの招待を処理できませんでした。",
      );
    } finally {
      setBusyNearbyInvitationID(undefined);
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
          {selectedAlbum && canManageAlbum(selectedAlbum.role) ? (
            <button className="icon-button" type="button" onClick={() => void openShare()} aria-label="共有">
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

      {pendingJoinCount > 0 ? (
        <div className="offline-banner" role="status">
          <CircleUserRound size={15} />
          {pendingJoinCount}件のアルバムが参加承認待ちです。
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

      {showsShare && sharingAlbum ? (
        <ShareAlbumModal
          album={sharingAlbum}
          onClose={() => {
            setShowsShare(false);
            setSharingAlbum(undefined);
          }}
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
          onChanged={refreshAlbums}
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
            <NearbyPeopleSettings
              enabled={nearby.enabled}
              status={nearby.status}
              error={nearby.error}
              album={selectedAlbum}
              canInvite={canInviteNearby}
              nearbyUsers={nearby.nearbyUsers}
              incomingInvitations={nearby.incomingInvitations}
              busyUserID={busyNearbyUserID}
              busyInvitationID={busyNearbyInvitationID}
              onToggle={nearby.setNearbyEnabled}
              onInvite={(candidate) => void inviteNearbyUser(candidate)}
              onRespond={(invitation, accept) =>
                void respondNearbyInvitation(invitation, accept)
              }
              onOpenStandardInvite={() => {
                setShowsSettings(false);
                void openShare();
              }}
            />
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
              onClick={() => {
                void nearby.stopPresence().finally(onSignOut);
              }}
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
