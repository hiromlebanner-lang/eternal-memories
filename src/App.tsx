import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  Bell,
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
  Trash2,
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
  deleteAlbum,
  deleteProfileAvatar,
  deletePhoto,
  loadAlbumInviteSettings,
  loadAlbums,
  loadInviteCodePreview,
  loadMyDirectAlbumInvitations,
  loadPhotos,
  requestAlbumMembership,
  respondToDirectAlbumInvitation,
  updateProfileDisplayName,
  updatePhoto,
  uploadProfileAvatar,
  uploadPhoto,
} from "./lib/data";
import {
  canDeletePhoto,
  canEditPhoto,
  canInviteToAlbum,
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
  AlbumInvitation,
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
    const callbackURL = new URL(window.location.href);
    const oauthError = callbackURL.searchParams.get("error");
    const oauthDescription = callbackURL.searchParams.get("error_description");
    if (oauthError) {
      console.error("OAuth callback failed:", oauthError, oauthDescription);
      setAuthMessage(
        oauthError === "access_denied"
          ? "ログインがキャンセルされました"
          : oauthDescription?.toLowerCase().includes("already")
            ? "このメールアドレスは別のログイン方法で登録されています"
            : "認証情報を確認できませんでした",
      );
      callbackURL.searchParams.delete("error");
      callbackURL.searchParams.delete("error_code");
      callbackURL.searchParams.delete("error_description");
      window.history.replaceState({}, "", callbackURL);
    }
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
    } catch (error) {
      console.error(`${provider} OAuth start failed:`, error);
      setAuthMessage(
        provider === "google"
          ? "Googleログインを開始できませんでした"
          : "Appleログインを開始できませんでした",
      );
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
  user: sessionUser,
  onSignOut,
}: {
  user: AppUser;
  onSignOut: () => Promise<void>;
}) {
  const [user, setUser] = useState(sessionUser);
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
  const [showsProfileEdit, setShowsProfileEdit] = useState(false);
  const [showsAvatarActions, setShowsAvatarActions] = useState(false);
  const [profileName, setProfileName] = useState(sessionUser.displayName);
  const [profileBusy, setProfileBusy] = useState(false);
  const cameraAvatarInput = useRef<HTMLInputElement>(null);
  const libraryAvatarInput = useRef<HTMLInputElement>(null);
  const [genericInvitation, setGenericInvitation] = useState<{
    code: string;
    albumName: string;
  }>();
  const [directInvitations, setDirectInvitations] = useState<
    AlbumInvitation[]
  >([]);
  const [showsDirectInvitations, setShowsDirectInvitations] = useState(false);
  const [busyDirectInvitationID, setBusyDirectInvitationID] =
    useState<string>();
  const [busyNearbyUserID, setBusyNearbyUserID] = useState<string>();
  const [busyNearbyInvitationID, setBusyNearbyInvitationID] =
    useState<string>();
  const inviteHandled = useRef(false);

  useEffect(() => {
    setUser(sessionUser);
    setProfileName(sessionUser.displayName);
  }, [sessionUser]);

  const selectedAlbum = albums.find((album) => album.id === selectedAlbumID);
  const canInviteNearby = Boolean(
    selectedAlbum &&
      canInviteToAlbum(
        selectedAlbum.role,
        selectedAlbum.members_can_invite,
      ),
  );
  const nearby = useNearbyPeople({
    user,
    selectedAlbumID: selectedAlbum?.id,
    canInvite: canInviteNearby,
  });
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

  const refreshDirectInvitations = useCallback(async (token?: string) => {
    try {
      const invitations = await loadMyDirectAlbumInvitations();
      if (token) {
        invitations.sort((left, right) =>
          left.token === token ? -1 : right.token === token ? 1 : 0,
        );
      }
      setDirectInvitations(invitations);
      if (invitations.length > 0) setShowsDirectInvitations(true);
    } catch {
      setToast("招待情報を取得できませんでした。");
    }
  }, []);

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
    void refreshDirectInvitations();
  }, [refreshDirectInvitations]);

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
        if (inviteToken) {
          await refreshDirectInvitations(inviteToken);
          const url = new URL(window.location.href);
          url.searchParams.delete("invite");
          window.history.replaceState({}, "", url);
          return;
        }
        const preview = await loadInviteCodePreview(inviteCode ?? "");
        setGenericInvitation({
          code: inviteCode ?? "",
          albumName: preview.album_name,
        });
        const url = new URL(window.location.href);
        url.searchParams.delete("join");
        window.history.replaceState({}, "", url);
      } catch (caught) {
        setToast(caught instanceof Error ? caught.message : "招待を確認できませんでした。");
      }
    };
    void acceptInvite();
  }, [refreshDirectInvitations]);

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

  const removeAlbum = async (albumID: string) => {
    const album = albums.find((candidate) => candidate.id === albumID);
    if (!album || album.owner_id !== user.id) {
      throw new Error("アルバムを削除できるのはオーナーだけです");
    }
    await deleteAlbum(albumID);
    await refreshAlbums();
    setToast("アルバムを削除しました");
  };

  const changeAvatar = async (file?: File) => {
    if (!file) return;
    setProfileBusy(true);
    try {
      const avatarUrl = await uploadProfileAvatar(file);
      setUser((current) => ({ ...current, avatarUrl }));
      setShowsAvatarActions(false);
      setToast("プロフィール画像を更新しました");
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "プロフィール画像を更新できませんでした。",
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const removeAvatar = async () => {
    setProfileBusy(true);
    try {
      await deleteProfileAvatar();
      setUser((current) => ({ ...current, avatarUrl: null }));
      setShowsAvatarActions(false);
      setToast("プロフィール画像を削除しました");
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "プロフィール画像を削除できませんでした。",
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const saveProfileName = async () => {
    setProfileBusy(true);
    try {
      await updateProfileDisplayName(profileName);
      setUser((current) => ({ ...current, displayName: profileName.trim() }));
      setToast("プロフィールを更新しました");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "プロフィールを更新できませんでした。",
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const enterAlbum = async (code: string) => {
    const albumID = await requestAlbumMembership({ inviteCode: code });
    await refreshAlbums();
    setSelectedAlbumID(albumID);
    setToast("アルバムに参加しました");
  };

  const acceptGenericInvitation = async () => {
    if (!genericInvitation) return;
    try {
      const albumID = await requestAlbumMembership({
        inviteCode: genericInvitation.code,
      });
      setGenericInvitation(undefined);
      await refreshAlbums();
      setSelectedAlbumID(albumID);
      setToast("アルバムに参加しました");
    } catch (caught) {
      setToast(
        caught instanceof Error ? caught.message : "アルバムに参加できませんでした。",
      );
    }
  };

  const openShare = async () => {
    if (
      !selectedAlbum ||
      !canInviteToAlbum(
        selectedAlbum.role,
        selectedAlbum.members_can_invite,
      )
    )
      return;
    try {
      const inviteSettings = await loadAlbumInviteSettings(selectedAlbum.id);
      setSharingAlbum({
        ...selectedAlbum,
        invite_code: inviteSettings.invite_code,
        invite_code_enabled: inviteSettings.invite_code_enabled,
        invite_code_expires_at: inviteSettings.invite_code_expires_at,
        members_can_invite: inviteSettings.members_can_invite,
        can_invite: inviteSettings.can_invite,
        invite_settings_supported:
          inviteSettings.supports_advanced_settings,
      });
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
      setToast(`${candidate.displayName}さんへ招待を送りました`);
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
        await refreshAlbums();
        setSelectedAlbumID(invitation.albumId);
        setToast("アルバムに参加しました");
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

  const respondDirectInvitation = async (
    invitation: AlbumInvitation,
    accept: boolean,
  ) => {
    setBusyDirectInvitationID(invitation.id);
    try {
      const albumID = await respondToDirectAlbumInvitation(
        invitation.id,
        accept,
      );
      const remaining = directInvitations.filter(
        (candidate) => candidate.id !== invitation.id,
      );
      setDirectInvitations(remaining);
      setShowsDirectInvitations(remaining.length > 0);
      if (accept && albumID) {
        await refreshAlbums();
        setSelectedAlbumID(albumID);
        setToast("アルバムに参加しました");
      } else {
        setToast("招待を辞退しました");
      }
    } catch (caught) {
      setToast(
        caught instanceof Error
          ? caught.message
          : "招待を処理できませんでした。",
      );
    } finally {
      setBusyDirectInvitationID(undefined);
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
          {directInvitations.length > 0 ? (
            <button
              className="icon-button header-invite-button"
              type="button"
              onClick={() => setShowsDirectInvitations(true)}
              aria-label={`招待が${directInvitations.length}件届いています`}
            >
              <Bell size={20} />
              <span className="notification-badge">
                {directInvitations.length > 99
                  ? "99+"
                  : directInvitations.length}
              </span>
            </button>
          ) : null}
          {selectedAlbum &&
          canInviteToAlbum(
            selectedAlbum.role,
            selectedAlbum.members_can_invite,
          ) ? (
            <button
              className="icon-button header-invite-button"
              type="button"
              onClick={() => void openShare()}
              aria-label="共有"
            >
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
          currentUserID={user.id}
          selectedAlbumID={selectedAlbumID}
          onClose={() => setShowsAlbumManager(false)}
          onSelect={setSelectedAlbumID}
          onCreate={addAlbum}
          onJoin={enterAlbum}
          onDelete={removeAlbum}
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
          onSettingsChanged={refreshAlbums}
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

      {genericInvitation ? (
        <Modal
          title="アルバムへの招待"
          onClose={() => setGenericInvitation(undefined)}
        >
          <div className="join-request-popup">
            <Bell size={28} aria-hidden="true" />
            <p>
              「{genericInvitation.albumName}」へ招待されました。
              参加しますか？
            </p>
            <div className="join-request-popup__actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => void acceptGenericInvitation()}
              >
                参加する
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setGenericInvitation(undefined)}
              >
                参加しない
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {showsDirectInvitations && directInvitations.length > 0 ? (
        <Modal
          title={`招待が${directInvitations.length}件届いています`}
          onClose={() => setShowsDirectInvitations(false)}
        >
          <div className="approval-list">
            {directInvitations.map((invitation) => (
              <article className="member-row" key={invitation.id}>
                <span className="member-avatar">
                  {(invitation.invited_by_name || "招").slice(0, 1)}
                </span>
                <div className="member-copy">
                  <strong>
                    {invitation.invited_by_name || "アルバム管理者"}さんから
                  </strong>
                  <small>
                    「{invitation.album_name || "アルバム"}」へ招待されました
                  </small>
                </div>
                <div className="approval-actions">
                  <button
                    className="approval-button approval-button--approve"
                    type="button"
                    disabled={busyDirectInvitationID === invitation.id}
                    onClick={() =>
                      void respondDirectInvitation(invitation, true)
                    }
                  >
                    参加する
                  </button>
                  <button
                    className="approval-button approval-button--reject"
                    type="button"
                    disabled={busyDirectInvitationID === invitation.id}
                    onClick={() =>
                      void respondDirectInvitation(invitation, false)
                    }
                  >
                    参加しない
                  </button>
                </div>
              </article>
            ))}
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowsDirectInvitations(false)}
            >
              あとで
            </button>
          </div>
        </Modal>
      ) : null}

      {showsSettings ? (
        <Modal title="設定" onClose={() => setShowsSettings(false)}>
          <div className="settings-panel">
            <button
              className="profile-row"
              type="button"
              onClick={() => {
                setShowsSettings(false);
                setShowsProfileEdit(true);
              }}
            >
              <span className="profile-avatar">
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1)}
              </span>
              <span>
                <strong>{user.displayName}</strong>
                <small>{user.email}</small>
              </span>
            </button>
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

      {showsProfileEdit ? (
        <Modal
          title="プロフィール編集"
          onClose={() => {
            setShowsProfileEdit(false);
            setShowsAvatarActions(false);
          }}
        >
          <div className="stack-form">
            <span className="profile-avatar profile-avatar--large">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                user.displayName.slice(0, 1)
              )}
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={profileBusy}
              onClick={() => setShowsAvatarActions(true)}
            >
              プロフィール画像を変更
            </button>
            <input
              ref={cameraAvatarInput}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              capture="environment"
              onChange={(event) => {
                void changeAvatar(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <input
              ref={libraryAvatarInput}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              onChange={(event) => {
                void changeAvatar(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {showsAvatarActions ? (
              <div className="album-manager__actions">
                <button type="button" onClick={() => cameraAvatarInput.current?.click()}>
                  <Camera size={19} />
                  <span><strong>写真を撮る</strong></span>
                </button>
                <button type="button" onClick={() => libraryAvatarInput.current?.click()}>
                  <Images size={19} />
                  <span><strong>写真ライブラリから選択</strong></span>
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={!user.avatarUrl || profileBusy}
                  onClick={() => void removeAvatar()}
                >
                  <Trash2 size={19} />
                  <span><strong>現在の画像を削除</strong></span>
                </button>
                <button type="button" onClick={() => setShowsAvatarActions(false)}>
                  <X size={19} />
                  <span><strong>キャンセル</strong></span>
                </button>
              </div>
            ) : null}
            <label className="field">
              <span>表示名</span>
              <input
                value={profileName}
                maxLength={80}
                onChange={(event) => setProfileName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>メールアドレス</span>
              <input value={user.email} readOnly />
            </label>
            <button
              className="primary-button"
              type="button"
              disabled={profileBusy}
              onClick={() => void saveProfileName()}
            >
              {profileBusy ? "保存中…" : "保存"}
            </button>
          </div>
        </Modal>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
