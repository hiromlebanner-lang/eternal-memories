import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  Bell,
  CarFront,
  Images,
  Camera,
  ChevronDown,
  CircleUserRound,
  CloudCog,
  CloudOff,
  Grid2X2,
  Globe2,
  LogOut,
  Map as MapIcon,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  UserRoundX,
  UserPlus,
  Wifi,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlbumManager } from "./components/AlbumManager";
import { AlbumHome } from "./components/AlbumHome";
import { AlbumSettingsPanel } from "./components/AlbumSettingsPanel";
import {
  AccountInfoMenu,
  AccountInfoPage,
  accountPageTitle,
  accountRouteFromPath,
  ACCOUNT_ROUTE_PATHS,
} from "./components/AccountInfoPages";
import type { AccountPageRoute } from "./components/AccountInfoPages";
import { AuthScreen } from "./components/AuthScreen";
import {
  DriveLogPanel,
  hasRecoverableDrive,
} from "./components/DriveLogPanel";
import { MapPanel } from "./components/MapPanel";
import { MemberManager } from "./components/MemberManager";
import { Modal } from "./components/Modal";
import { OfflineCachePanel } from "./components/OfflineCachePanel";
import { PhotoDetail } from "./components/PhotoDetail";
import { PhotoEditor } from "./components/PhotoEditor";
import { PhotoGrid } from "./components/PhotoGrid";
import { ShareAlbumModal } from "./components/ShareAlbumModal";
import { SiteAdminPanel } from "./components/SiteAdminPanel";
import {
  clearPrivateOfflineData,
  createAlbum,
  deleteAlbum,
  deleteOwnAccount,
  deleteProfileAvatar,
  deletePhoto,
  downloadAlbumPhoto,
  loadAlbumInviteSettings,
  loadAlbums,
  loadInviteCodePreview,
  loadGlobalPhotos,
  loadMyDirectAlbumInvitations,
  loadPhotos,
  loadRecentAlbumPhotos,
  requestAlbumMembership,
  respondToDirectAlbumInvitation,
  saveAlbumPreference,
  updateAlbumPresentation,
  updateProfileDisplayName,
  updatePhoto,
  uploadProfileAvatar,
  uploadPhoto,
} from "./lib/data";
import { readPhotoMetadata } from "./lib/image";
import {
  cacheAlbumForOffline,
  clearOfflineCache,
  flushOfflineQueue,
  getOfflineAlbumIDs,
  getOfflineStats,
  queueOfflinePhoto,
  removeAlbumOffline,
  restorePinnedOfflineMedia,
} from "./lib/offline";
import {
  canDeletePhoto,
  canEditPhoto,
  canInviteToAlbum,
  canPostPhoto,
} from "./lib/permissions";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { getSiteAdminContext } from "./lib/siteAdmin";
import type { SiteAdminContext } from "./lib/siteAdmin";
import { CATEGORY_META } from "./types";
import type {
  Album,
  AlbumInvitation,
  AlbumPhoto,
  AppUser,
  PhotoCategory,
  PhotoLocationGroup,
  PhotoUploadFailure,
} from "./types";

type ViewMode = "map" | "photos";
type AlbumLoadStatus = "loading" | "success" | "error";

function authReturnURL(mode?: "recovery" | "signup") {
  const url = new URL(
    mode === "recovery"
      ? "/reset-password"
      : mode === "signup"
        ? "/auth/callback"
        : window.location.pathname,
    window.location.origin,
  );
  const query = new URLSearchParams(window.location.search);
  const inviteCode = query.get("join");
  const inviteToken = query.get("invite");
  if (!mode) {
    if (inviteCode) url.searchParams.set("join", inviteCode);
    if (inviteToken) url.searchParams.set("invite", inviteToken);
  }
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
  const [authRevision, setAuthRevision] = useState(0);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [invalidRecoveryLink, setInvalidRecoveryLink] = useState(false);
  const passwordResetInFlight = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let authEventReceived = false;
    let lastSessionSignature: string | null | undefined;
    const callbackURL = new URL(window.location.href);
    const oauthError = callbackURL.searchParams.get("error");
    const oauthErrorCode = callbackURL.searchParams.get("error_code");
    const oauthDescription = callbackURL.searchParams.get("error_description");
    if (oauthError) {
      if (callbackURL.pathname === "/reset-password") {
        setInvalidRecoveryLink(true);
        setPasswordRecovery(false);
      } else {
        setAuthMessage(
          oauthError === "access_denied"
            ? "ログインがキャンセルされました"
            : oauthDescription?.toLowerCase().includes("already")
              ? "このメールアドレスは別のログイン方法で登録されています"
              : oauthErrorCode === "otp_expired"
                ? "このリンクは使用できません。"
                : "認証情報を確認できませんでした",
        );
      }
      callbackURL.searchParams.delete("error");
      callbackURL.searchParams.delete("error_code");
      callbackURL.searchParams.delete("error_description");
      window.history.replaceState({}, "", callbackURL);
    }
    const applySession = (
      nextSession: Session | null,
      forceAlbumRefresh = false,
    ) => {
      if (!active) return;
      const nextSignature = nextSession
        ? `${nextSession.user.id}:${nextSession.access_token}`
        : null;
      const sessionChanged = nextSignature !== lastSessionSignature;
      lastSessionSignature = nextSignature;
      setSession(nextSession);
      setAuthReady(true);
      if (nextSession?.user && (forceAlbumRefresh || sessionChanged)) {
        setAuthRevision((current) => current + 1);
      }
    };

    const { data: listener } = client.auth.onAuthStateChange(
      (event: AuthChangeEvent, nextSession) => {
        authEventReceived = true;
        applySession(nextSession, event === "SIGNED_IN");
        if (event === "PASSWORD_RECOVERY") {
          setInvalidRecoveryLink(false);
          setPasswordRecovery(true);
        }
        if (
          event === "INITIAL_SESSION" &&
          window.location.pathname === "/reset-password" &&
          !nextSession
        ) {
          setPasswordRecovery(false);
          setInvalidRecoveryLink(true);
          setAuthMessage("");
        }
        if (event === "SIGNED_OUT") void clearPrivateOfflineData();
      },
    );

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        if (!authEventReceived) {
          applySession(data.session);
          if (
            window.location.pathname === "/reset-password" &&
            !data.session
          ) {
            setPasswordRecovery(false);
            setInvalidRecoveryLink(true);
          }
        }
      })
      .catch((error) => {
        console.error("Initial session check failed:", error);
        if (active && !authEventReceived) {
          setAuthMessage(
            "ログイン状態を確認できませんでした。ページを再読み込みしてください。",
          );
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const emailLogin = async (email: string, password: string) => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
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
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: authReturnURL("signup"),
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

  const googleLogin = async () => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authReturnURL() },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google OAuth start failed:", error);
      setAuthMessage("Googleログインを開始できませんでした");
    } finally {
      setAuthBusy(false);
    }
  };

  const requestPasswordReset = async (email: string) => {
    if (!supabase || passwordResetInFlight.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("正しいメールアドレスを入力してください");
    }
    passwordResetInFlight.current = true;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: authReturnURL("recovery"),
        },
      );
      if (error) throw error;
      setAuthMessage(
        "入力されたメールアドレスが登録されている場合、パスワード再設定メールを送信しました。",
      );
    } finally {
      passwordResetInFlight.current = false;
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
      setInvalidRecoveryLink(false);
      const url = new URL(window.location.href);
      url.pathname = "/";
      url.searchParams.delete("code");
      url.hash = "";
      window.history.replaceState({}, "", url);
      await supabase.auth.signOut({ scope: "local" });
      await clearPrivateOfflineData();
      setAuthMessage(
        "パスワードを変更しました。\n新しいパスワードでログインしてください。",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      throw new Error(
        /session|token|expired|otp/.test(message)
          ? "このリンクは使用できません。有効期限が切れているか、すでに使用された可能性があります。"
          : "パスワードの変更に失敗しました。時間を空けてもう一度お試しください。",
        { cause: error },
      );
    } finally {
      setAuthBusy(false);
    }
  };

  if (!authReady) {
    return (
      <main className="preparing-app">
        <div className="preparing-logo">🗺️</div>
        <h1>Eternal memories</h1>
        <p>アルバムを読み込んでいます…</p>
        <div className="preparing-bar" aria-hidden="true" />
      </main>
    );
  }

  const user = session?.user ? userFromSupabase(session.user) : null;

  if (!user || passwordRecovery || invalidRecoveryLink) {
    return (
      <AuthScreen
        configured={isSupabaseConfigured}
        busy={authBusy}
        message={authMessage}
        recoveryMode={passwordRecovery}
        invalidRecoveryLink={invalidRecoveryLink}
        onEmailLogin={emailLogin}
        onEmailSignup={emailSignup}
        onPasswordResetRequest={requestPasswordReset}
        onPasswordUpdate={updatePassword}
        onClearRecoveryLink={() => {
          setInvalidRecoveryLink(false);
          setPasswordRecovery(false);
          setAuthMessage("");
          window.history.replaceState({}, "", "/");
        }}
        onGoogleLogin={googleLogin}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      authRevision={authRevision}
      onAccountDeleted={async () => {
        await supabase?.auth.signOut({ scope: "local" }).catch(() => undefined);
        await clearPrivateOfflineData();
        setSession(null);
        setAuthMessage("アカウントを削除しました");
      }}
      onSignOut={async () => {
        await supabase?.auth.signOut();
        await clearPrivateOfflineData();
      }}
    />
  );
}

function Dashboard({
  user: sessionUser,
  authRevision,
  onAccountDeleted,
  onSignOut,
}: {
  user: AppUser;
  authRevision: number;
  onAccountDeleted: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [user, setUser] = useState(sessionUser);
  const [dark, setDark] = useDarkMode();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumLoadStatus, setAlbumLoadStatus] =
    useState<AlbumLoadStatus>("loading");
  const [albumLoadError, setAlbumLoadError] = useState("");
  const [selectedAlbumID, setSelectedAlbumID] = useState("");
  const [albumHome, setAlbumHome] = useState(true);
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [recentAlbumPhotos, setRecentAlbumPhotos] = useState<AlbumPhoto[]>([]);
  const [globalPhotos, setGlobalPhotos] = useState<AlbumPhoto[]>([]);
  const [globalMode, setGlobalMode] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalHasMore, setGlobalHasMore] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [usingCache, setUsingCache] = useState(false);
  const [syncState, setSyncState] =
    useState<"idle" | "syncing" | "failed">("idle");
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [toast, setToast] = useState("");

  const [showsAlbumManager, setShowsAlbumManager] = useState(false);
  const [showsAlbumSettings, setShowsAlbumSettings] = useState(false);
  const [showsOfflineCache, setShowsOfflineCache] = useState(false);
  const [showsPhotoEditor, setShowsPhotoEditor] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<AlbumPhoto>();
  const [detailPhotos, setDetailPhotos] = useState<AlbumPhoto[]>([]);
  const [detailPhotoID, setDetailPhotoID] = useState<string>();
  const [showsShare, setShowsShare] = useState(false);
  const [sharingAlbum, setSharingAlbum] = useState<Album>();
  const [showsMembers, setShowsMembers] = useState(false);
  const [showsSettings, setShowsSettings] = useState(false);
  const [siteAdminContext, setSiteAdminContext] =
    useState<SiteAdminContext | null>(null);
  const [siteRoleReady, setSiteRoleReady] = useState(false);
  const [showsSiteAdmin, setShowsSiteAdmin] = useState(
    () => window.location.pathname === "/site-admin",
  );
  const [driveMode, setDriveMode] = useState(() =>
    hasRecoverableDrive(sessionUser.id),
  );
  const [driveRecording, setDriveRecording] = useState(false);
  const [accountPage, setAccountPage] = useState<AccountPageRoute | null>(() =>
    accountRouteFromPath(window.location.pathname),
  );
  const accountReturnPath = useRef("/");
  const [showsLogoutConfirm, setShowsLogoutConfirm] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [showsDeleteAccountConfirm, setShowsDeleteAccountConfirm] =
    useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
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
  const inviteHandled = useRef(false);
  const syncInFlight = useRef(false);
  const signOutRef = useRef(onSignOut);
  const albumRequestID = useRef(0);
  const albumLoadInFlight = useRef<{
    userID: string;
    promise: Promise<void>;
  } | null>(null);

  useEffect(() => {
    setUser(sessionUser);
    setProfileName(sessionUser.displayName);
    if (hasRecoverableDrive(sessionUser.id)) setDriveMode(true);
  }, [sessionUser]);

  useEffect(() => {
    signOutRef.current = onSignOut;
  }, [onSignOut]);

  useEffect(() => {
    albumRequestID.current += 1;
    albumLoadInFlight.current = null;
    setAlbums([]);
    setSelectedAlbumID("");
    setAlbumHome(true);
    setRecentAlbumPhotos([]);
    setPendingSyncCount(0);
    setAlbumLoadStatus("loading");
    setAlbumLoadError("");
    setUsingCache(false);
  }, [sessionUser.id]);

  useEffect(() => {
    const updateAccountRoute = () => {
      setAccountPage(accountRouteFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", updateAccountRoute);
    return () => window.removeEventListener("popstate", updateAccountRoute);
  }, []);

  const openAccountPage = (route: AccountPageRoute) => {
    accountReturnPath.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.pushState({}, "", ACCOUNT_ROUTE_PATHS[route]);
    setShowsSettings(false);
    setAccountPage(route);
  };

  const closeAccountPage = () => {
    window.history.replaceState({}, "", accountReturnPath.current);
    setAccountPage(null);
    setShowsSettings(true);
  };

  const selectedAlbum = albums.find((album) => album.id === selectedAlbumID);

  useEffect(() => {
    let active = true;
    const loadSiteRole = async (showLoading: boolean) => {
      if (showLoading) setSiteRoleReady(false);
      try {
        const context = await getSiteAdminContext();
        if (active) setSiteAdminContext(context);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "unknown error";
        console.error(
          "Site role check failed:",
          message,
        );
        if (active) setSiteAdminContext(null);
        if (message.includes("利用を停止")) {
          if (active) setToast("このアカウントは現在利用を停止されています。");
          await signOutRef.current();
        }
      } finally {
        if (active && showLoading) setSiteRoleReady(true);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadSiteRole(false);
      }
    };
    void loadSiteRole(true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authRevision, sessionUser.id]);

  const closeSiteAdmin = () => {
    setShowsSiteAdmin(false);
    if (window.location.pathname === "/site-admin") {
      window.history.replaceState({}, "", "/");
    }
  };
  const refreshAlbums = useCallback(() => {
    const userID = sessionUser.id;
    if (!userID) return Promise.resolve();

    const inFlight = albumLoadInFlight.current;
    if (inFlight?.userID === userID) return inFlight.promise;

    const requestID = ++albumRequestID.current;
    setAlbumLoadStatus("loading");
    setAlbumLoadError("");

    const loadPromise = (async () => {
      try {
        const result = await loadAlbums(userID);
        if (requestID !== albumRequestID.current) return;
        const offlineAlbumIDs = await getOfflineAlbumIDs(userID);
        await restorePinnedOfflineMedia(userID);
        const resolvedAlbums = result.data.map((album) => ({
          ...album,
          offline_enabled: offlineAlbumIDs.has(album.id),
        }));
        setAlbums(resolvedAlbums);
        setUsingCache(result.fromCache);
        setSelectedAlbumID((current) =>
          resolvedAlbums.some((album) => album.id === current)
            ? current
            : (resolvedAlbums[0]?.id ?? ""),
        );
        setAlbumLoadStatus("success");
        const [recentResult] = await Promise.allSettled([
          loadRecentAlbumPhotos(userID),
        ]);
        if (requestID !== albumRequestID.current) return;
        if (recentResult.status === "fulfilled") {
          setRecentAlbumPhotos(recentResult.value.data);
          setUsingCache((current) =>
            current || recentResult.value.fromCache,
          );
        }
      } catch (error) {
        if (requestID !== albumRequestID.current) return;
        console.error("Album loading failed:", { userID, error });
        const message =
          "アルバムを読み込めませんでした。通信状態を確認して再読み込みしてください。";
        setAlbumLoadStatus("error");
        setAlbumLoadError(message);
        setToast(message);
      }
    })();

    albumLoadInFlight.current = { userID, promise: loadPromise };
    void loadPromise.finally(() => {
      if (albumLoadInFlight.current?.promise === loadPromise) {
        albumLoadInFlight.current = null;
      }
    });
    return loadPromise;
  }, [sessionUser.id]);

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
      const result = await loadPhotos(user.id, selectedAlbumID);
      setPhotos(result.data);
      setUsingCache(result.fromCache);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "写真を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [selectedAlbumID, user.id]);

  const refreshGlobalPhotos = useCallback(async (append = false) => {
    setGlobalLoading(true);
    try {
      const offset = append ? globalPhotos.length : 0;
      const result = await loadGlobalPhotos(offset, 24);
      setGlobalPhotos((current) =>
        append ? [...current, ...result.photos] : result.photos,
      );
      setGlobalHasMore(result.hasMore);
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "みんなの思い出を読み込めませんでした。",
      );
    } finally {
      setGlobalLoading(false);
    }
  }, [globalPhotos.length]);

  const openGlobalMemories = () => {
    if (driveMode && driveRecording) {
      setToast("走行記録を終了してから画面を移動してください。");
      return;
    }
    setDriveMode(false);
    setAlbumHome(false);
    setGlobalMode(true);
    if (globalPhotos.length === 0) void refreshGlobalPhotos();
  };

  const runOfflineSync = useCallback(async () => {
    if (!navigator.onLine || syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncState("syncing");
    try {
      const result = await flushOfflineQueue(
        user.id,
        async (payload) => {
          await uploadPhoto(payload);
        },
        (completed, total) => {
          setToast(`${completed}／${total}件を同期中`);
        },
      );
      setPendingSyncCount(result.pending);
      setSyncState(result.failed > 0 ? "failed" : "idle");
      if (result.completed > 0) {
        await Promise.all([refreshAlbums(), refreshPhotos()]);
        setToast(`${result.completed}件を同期しました。`);
      } else if (result.failed > 0) {
        setToast(`${result.failed}件の同期に失敗しました。`);
      }
    } catch {
      setSyncState("failed");
      setToast("同期に失敗しました。時間を空けて再試行してください。");
    } finally {
      syncInFlight.current = false;
    }
  }, [refreshAlbums, refreshPhotos, user.id]);

  useEffect(() => {
    void refreshAlbums();
  }, [authRevision, refreshAlbums]);

  useEffect(() => {
    void refreshDirectInvitations();
  }, [refreshDirectInvitations]);

  useEffect(() => {
    void refreshPhotos();
  }, [refreshPhotos]);

  useEffect(() => {
    void getOfflineStats(user.id).then((stats) => {
      setPendingSyncCount(stats.pendingCount);
      if (navigator.onLine && stats.pendingCount > 0) {
        void runOfflineSync();
      }
    });
  }, [runOfflineSync, user.id]);

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
      void runOfflineSync();
    };
    const offlineNow = () => setOffline(true);
    const visible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refreshAlbums();
        void runOfflineSync();
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineNow);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineNow);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshAlbums, refreshPhotos, runOfflineSync]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const syncRequested = (event: MessageEvent) => {
      if (event.data?.type === "MAPALBUM_SYNC_REQUEST") {
        void runOfflineSync();
      }
    };
    navigator.serviceWorker.addEventListener("message", syncRequested);
    return () =>
      navigator.serviceWorker.removeEventListener("message", syncRequested);
  }, [runOfflineSync]);

  useEffect(() => {
    if (!supabase || !selectedAlbumID || globalMode) return;
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
  }, [globalMode, refreshPhotos, selectedAlbumID]);

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

  const canPost =
    albumLoadStatus === "success" &&
    (!selectedAlbum || canPostPhoto(selectedAlbum.role));
  const canEdit = (photo: AlbumPhoto) =>
    globalMode
      ? photo.author_id === user.id
      : canEditPhoto(selectedAlbum?.role, user.id, photo.author_id);
  const canDelete = (photo: AlbumPhoto) =>
    globalMode
      ? photo.author_id === user.id
      : canDeletePhoto(selectedAlbum?.role, user.id, photo.author_id);

  const openPhoto = (photo: AlbumPhoto) => {
    setDetailPhotos([photo]);
    setDetailPhotoID(photo.id);
  };

  const openGroup = (group: PhotoLocationGroup) => {
    setDetailPhotos(group.photos);
    setDetailPhotoID(group.photos[0]?.id);
  };

  const openAlbum = (albumID: string, nextView: ViewMode = "photos") => {
    setDriveMode(false);
    setGlobalMode(false);
    setAlbumHome(false);
    setSelectedAlbumID(albumID);
    setViewMode(nextView);
    void saveAlbumPreference({
      userID: user.id,
      albumID,
      viewedNow: true,
    }).then(() => {
      setAlbums((current) =>
        current.map((album) =>
          album.id === albumID
            ? {
                ...album,
                last_viewed_at: new Date().toISOString(),
                unread_count: 0,
              }
            : album,
        ),
      );
    });
  };

  const toggleFavoriteAlbum = async (album: Album) => {
    const next = !album.is_favorite;
    await saveAlbumPreference({
      userID: user.id,
      albumID: album.id,
      isFavorite: next,
    });
    setAlbums((current) =>
      current.map((candidate) =>
        candidate.id === album.id
          ? { ...candidate, is_favorite: next }
          : candidate,
      ),
    );
    setToast(next ? "お気に入りへ追加しました。" : "お気に入りを解除しました。");
  };

  const toggleOfflineAlbum = async (album: Album) => {
    if (album.offline_enabled) {
      await removeAlbumOffline(user.id, album.id);
      setToast("端末内のオフライン保存を解除しました。");
    } else {
      const albumPhotos =
        album.id === selectedAlbumID
          ? photos
          : (await loadPhotos(user.id, album.id)).data;
      await cacheAlbumForOffline(
        user.id,
        album,
        albumPhotos,
        (completed, total) =>
          setToast(`${completed}／${total}枚を保存中`),
      );
      setToast("アルバムをオフライン保存しました。");
    }
    await refreshAlbums();
  };

  const saveAlbumSettings = async (input: {
    coverPhotoID: string | null;
    visibility: "private" | "limited" | "public";
    icon: string;
    themeColor: string;
    tags: string[];
  }) => {
    if (!selectedAlbum) return;
    if (selectedAlbum.role === "owner" || selectedAlbum.role === "admin") {
      await updateAlbumPresentation({
        albumID: selectedAlbum.id,
        ...input,
      });
    }
    await refreshAlbums();
    setToast("アルバム設定を保存しました。");
  };

  const savePhoto = async (values: {
    files?: File[];
    title: string;
    caption: string;
    category: PhotoCategory;
    capturedAt: string;
    latitude: number | null;
    longitude: number | null;
    visibility: "album_only" | "global";
  }, onProgress: (completed: number, total: number) => void) => {
    if (editingPhoto) {
      await updatePhoto(editingPhoto.id, {
        title: values.title,
        caption: values.caption,
        category: values.category,
        captured_at: values.capturedAt,
        latitude: values.latitude,
        longitude: values.longitude,
        visibility: values.visibility,
      });
      if (editingPhoto.album_id) await refreshPhotos();
      if (globalMode || editingPhoto.visibility === "global" || values.visibility === "global") {
        await refreshGlobalPhotos();
      }
      setToast("写真を更新しました");
      setEditingPhoto(undefined);
      return [];
    }

    const files = values.files ?? [];
    if (files.length === 0) throw new Error("写真を選択してください。");
    if (values.visibility === "album_only" && !selectedAlbum) {
      throw new Error("投稿できるアルバムが選択されていません。");
    }
    const targetAlbumID = selectedAlbum?.id ?? null;
    console.info("[PhotoUpload] 画像枚数", files.length);
    const failures: PhotoUploadFailure[] = [];
    let succeeded = 0;
    for (const [index, file] of files.entries()) {
      console.info("[PhotoUpload] 画像名", file.name);
      try {
        const metadata = await readPhotoMetadata(file);
        const payload = {
          albumID: targetAlbumID,
          authorID: user.id,
          authorName: user.displayName,
          file,
          title: values.title,
          caption: values.caption,
          category: values.category,
          capturedAt: metadata.capturedAt?.toISOString() ?? values.capturedAt,
          latitude: metadata.latitude ?? values.latitude,
          longitude: metadata.longitude ?? values.longitude,
          visibility: values.visibility,
          photoID: crypto.randomUUID(),
        };
        if (!navigator.onLine) {
          await queueOfflinePhoto(user.id, payload);
          setPendingSyncCount((current) => current + 1);
        } else {
          await uploadPhoto(payload);
        }
        succeeded += 1;
      } catch (error) {
        const reason = !navigator.onLine
          ? "Network Error: インターネット接続を確認してください"
          : error instanceof Error
            ? error.message
            : "Unknown Error: 不明なエラー";
        console.error("[PhotoUpload] 画像アップロード失敗", {
          fileName: file.name,
          reason,
          error,
        });
        failures.push({ file, reason });
      }
      onProgress(index + 1, files.length);
    }
    console.info("[PhotoUpload] 完了件数", {
      total: files.length,
      succeeded,
      failed: failures.length,
    });
    if (targetAlbumID) {
      await refreshPhotos();
      await refreshAlbums();
    }
    if (values.visibility === "global" && navigator.onLine) {
      await refreshGlobalPhotos();
      if (!driveRecording) {
        setDriveMode(false);
        setGlobalMode(true);
      }
    }
    setToast(
      !navigator.onLine && failures.length === 0
        ? `${succeeded}件を同期待ちとして端末へ保存しました。`
        : failures.length === 0 && values.visibility === "global"
        ? "みんなへ投稿しました。"
        : failures.length === 0
          ? `${files.length}枚中 ${succeeded}枚保存成功`
        : `${files.length}枚中 ${succeeded}枚保存成功・${failures.length}枚失敗`,
    );
    return failures;
  };

  const removePhoto = async (photo: AlbumPhoto) => {
    const result = await deletePhoto(photo);
    await refreshPhotos();
    await refreshAlbums();
    if (photo.visibility === "global") await refreshGlobalPhotos();
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
      {!driveMode ? <header className="app-header">
        <button
          className="brand-button"
          type="button"
          onClick={() => {
            setGlobalMode(false);
            setAlbumHome(true);
          }}
        >
          <span className="brand-mark brand-mark--small">
            <MapIcon size={20} />
            <span>●</span>
          </span>
          <span className="brand-title">Eternal memories</span>
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
      </header> : null}

      {(offline || usingCache) && (
        <div className="offline-banner">
          <CloudOff size={15} />
          {offline
            ? "オフラインです。保存済みの地図と写真を表示しています。"
            : "一部のデータを端末キャッシュから表示しています。"}
        </div>
      )}
      {!offline && (syncState !== "idle" || pendingSyncCount > 0) ? (
        <div
          className={
            syncState === "failed"
              ? "sync-status sync-status--failed"
              : "sync-status"
          }
        >
          <CloudCog size={15} />
          <span>
            {syncState === "syncing"
              ? `${pendingSyncCount}件のデータを同期中`
              : syncState === "failed"
                ? `${pendingSyncCount}件の同期を再試行できます`
                : `${pendingSyncCount}件の同期待ち`}
          </span>
          {syncState !== "syncing" ? (
            <button type="button" onClick={() => void runOfflineSync()}>
              再同期
            </button>
          ) : null}
        </div>
      ) : null}

      <main className="app-main">
        {driveMode ? (
          <section className="drive-page-screen" aria-label="ドライブ">
            <DriveLogPanel
              userID={user.id}
              onRecordingChange={setDriveRecording}
              onNotice={setToast}
            />
          </section>
        ) : globalMode ? (
          <>
            <section className="album-hero global-memories-hero">
              <div>
                <span className="eyebrow">ログインユーザー限定</span>
                <h1>みんなの思い出</h1>
                <p>旅先の景色や大切な瞬間を、みんなで楽しむ場所です。</p>
              </div>
              <div className="album-stats">
                <span>
                  <strong>{globalPhotos.length}</strong>
                  写真
                </span>
              </div>
            </section>
            <section className="content-stage global-memories-stage">
              {globalLoading && globalPhotos.length === 0 ? (
                <div className="loading-state">
                  <span />
                  <p>みんなの思い出を読み込んでいます…</p>
                </div>
              ) : (
                <>
                  <PhotoGrid
                    photos={globalPhotos}
                    onSelect={openPhoto}
                    protectImages
                  />
                  {globalHasMore ? (
                    <button
                      className="secondary-button load-more-button"
                      type="button"
                      disabled={globalLoading}
                      onClick={() => void refreshGlobalPhotos(true)}
                    >
                      {globalLoading ? "読み込み中…" : "さらに表示"}
                    </button>
                  ) : null}
                </>
              )}
            </section>
          </>
        ) : albumHome ? (
          <AlbumHome
            userID={user.id}
            albums={albums}
            recentPhotos={recentAlbumPhotos}
            loading={albumLoadStatus === "loading"}
            hasPendingInvitations={directInvitations.length > 0}
            onOpen={openAlbum}
            onOpenPhoto={(photo) => {
              if (photo.album_id) openAlbum(photo.album_id);
              openPhoto(photo);
            }}
            onOpenMap={() => {
              if (selectedAlbumID) openAlbum(selectedAlbumID, "map");
              else setToast("地図を表示するアルバムを選択してください。");
            }}
            onCreate={() => setShowsAlbumManager(true)}
            onOpenInvitations={() => setShowsDirectInvitations(true)}
            onToggleFavorite={toggleFavoriteAlbum}
            onToggleOffline={toggleOfflineAlbum}
          />
        ) : albumLoadStatus === "loading" && albums.length === 0 ? (
          <div className="loading-state">
            <span />
            <p>アルバムを読み込んでいます…</p>
          </div>
        ) : albumLoadStatus === "error" && albums.length === 0 ? (
          <div className="welcome-empty">
            <span>↻</span>
            <h1>アルバムを読み込めませんでした</h1>
            <p>{albumLoadError}</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => void refreshAlbums()}
            >
              再読み込み
            </button>
          </div>
        ) : selectedAlbum ? (
          <>
            <section className="album-hero">
              <div>
                <span className="eyebrow">みんなの思い出</span>
                <h1>{selectedAlbum.name}</h1>
                <p>{selectedAlbum.description || "写真と場所をみんなで残す共有アルバム"}</p>
                <div className="album-hero__meta">
                  <span>{selectedAlbum.owner_name || "オーナー"}</span>
                  <span>{selectedAlbum.role}</span>
                  <span>
                    {selectedAlbum.visibility === "public"
                      ? "公開"
                      : selectedAlbum.visibility === "limited"
                        ? "限定公開"
                        : "非公開"}
                  </span>
                </div>
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
              <div className="album-hero__actions" aria-label="アルバム操作">
                <button
                  type="button"
                  className={selectedAlbum.is_favorite ? "is-active" : ""}
                  onClick={() => void toggleFavoriteAlbum(selectedAlbum)}
                >
                  <Star size={17} fill={selectedAlbum.is_favorite ? "currentColor" : "none"} />
                  お気に入り
                </button>
                <button
                  type="button"
                  className={selectedAlbum.offline_enabled ? "is-active" : ""}
                  onClick={() => void toggleOfflineAlbum(selectedAlbum)}
                >
                  <CloudOff size={17} />
                  {selectedAlbum.offline_enabled ? "保存済み" : "オフライン保存"}
                </button>
                <button type="button" onClick={() => setShowsMembers(true)}>
                  <CircleUserRound size={17} />
                  参加メンバー
                </button>
                {canInviteToAlbum(
                  selectedAlbum.role,
                  selectedAlbum.members_can_invite,
                ) ? (
                  <button type="button" onClick={() => void openShare()}>
                    <UserPlus size={17} />
                    共有・招待
                  </button>
                ) : null}
                <button type="button" onClick={() => setShowsAlbumSettings(true)}>
                  <Settings size={17} />
                  アルバム設定
                </button>
                {canPost ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPhoto(undefined);
                      setShowsPhotoEditor(true);
                    }}
                  >
                    <Camera size={17} />
                    写真を投稿
                  </button>
                ) : null}
              </div>
              <p className="album-hero__updated">
                最終更新：
                {new Date(
                  selectedAlbum.updated_at ?? selectedAlbum.created_at,
                ).toLocaleString("ja-JP")}
              </p>
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
                <MapPanel
                  userID={user.id}
                  photos={filteredPhotos}
                  onSelect={openGroup}
                />
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
          className={
            !driveMode && !globalMode && !albumHome && viewMode === "map"
              ? "is-active"
              : ""
          }
          onClick={() => {
            if (driveRecording) {
              setToast("走行記録を終了してから画面を移動してください。");
              return;
            }
            setDriveMode(false);
            setGlobalMode(false);
            setAlbumHome(false);
            setViewMode("map");
          }}
        >
          <MapIcon />
          <span>地図</span>
        </button>
        <button
          type="button"
          className={!driveMode && globalMode ? "is-active" : ""}
          onClick={openGlobalMemories}
        >
          <Globe2 />
          <span>みんな</span>
        </button>
        <button
          type="button"
          className="camera-action"
          disabled={!canPost}
          onClick={() => {
            setEditingPhoto(undefined);
            setShowsPhotoEditor(true);
          }}
          aria-label="写真を追加"
        >
          <Camera />
        </button>
        <button
          type="button"
          className={!driveMode && !globalMode && albumHome ? "is-active" : ""}
          onClick={() => {
            if (driveRecording) {
              setToast("走行記録を終了してから画面を移動してください。");
              return;
            }
            setDriveMode(false);
            setGlobalMode(false);
            setAlbumHome(true);
          }}
        >
          <Images />
          <span>アルバム</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (driveRecording) {
              setToast("走行記録を終了してから設定を開いてください。");
              return;
            }
            setShowsSettings(true);
          }}
        >
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
          onSelect={(albumID) => {
            openAlbum(albumID);
          }}
          onCreate={addAlbum}
          onJoin={enterAlbum}
          onDelete={removeAlbum}
        />
      ) : null}

      {showsPhotoEditor ? (
        <PhotoEditor
          photo={editingPhoto}
          hasAlbum={
            editingPhoto
              ? Boolean(editingPhoto.album_id)
              : Boolean(selectedAlbum)
          }
          initialVisibility={
            globalMode || !selectedAlbum ? "global" : "album_only"
          }
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
          canDownload={!globalMode && Boolean(selectedAlbum)}
          protectImage={globalMode}
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
          onDownload={downloadAlbumPhoto}
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

      {showsAlbumSettings && selectedAlbum ? (
        <AlbumSettingsPanel
          album={selectedAlbum}
          photos={photos}
          onClose={() => setShowsAlbumSettings(false)}
          onSave={saveAlbumSettings}
        />
      ) : null}

      {showsOfflineCache ? (
        <OfflineCachePanel
          loadStats={() => getOfflineStats(user.id)}
          onSync={runOfflineSync}
          onClear={async () => {
            await clearOfflineCache(user.id);
            await refreshAlbums();
            setToast("端末内のオフラインキャッシュを削除しました。");
          }}
          onClose={() => setShowsOfflineCache(false)}
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
            <button
              type="button"
              className="settings-row"
              onClick={() => {
                setShowsSettings(false);
                setShowsOfflineCache(true);
              }}
            >
              {offline ? <CloudOff size={19} /> : <Wifi size={19} />}
              <span>
                <strong>オフライン・キャッシュ管理</strong>
                <small>保存容量、同期待ち、保存済みアルバムを管理</small>
              </span>
              <ChevronDown size={17} className="settings-row__chevron" />
            </button>
            <button
              type="button"
              className="settings-row"
              onClick={() => {
                setShowsSettings(false);
                setGlobalMode(false);
                setDriveMode(true);
              }}
            >
              <CarFront size={19} />
              <span>
                <strong>ドライブ・走行記録</strong>
                <small>目的地検索・ナビ・走行記録</small>
              </span>
              <ChevronDown size={17} className="settings-row__chevron" />
            </button>
            {siteAdminContext?.role === "site_admin" ? (
              <button
                type="button"
                className="settings-row"
                onClick={() => {
                  setShowsSettings(false);
                  setShowsSiteAdmin(true);
                  window.history.pushState({}, "", "/site-admin");
                }}
              >
                <ShieldCheck size={19} />
                <span>
                  <strong>サイト管理</strong>
                  <small>ユーザー権限とアカウント状態を管理</small>
                </span>
                <ChevronDown size={17} className="settings-row__chevron" />
              </button>
            ) : null}
            <AccountInfoMenu onNavigate={openAccountPage} />
            <div className="install-note">
              <CircleUserRound size={20} />
              <p>
                iPhoneではSafariの共有ボタンから「ホーム画面に追加」を選ぶと、
                アプリのように起動できます。
              </p>
            </div>
            <button
              className="settings-row settings-row--danger"
              type="button"
              onClick={() => {
                setShowsSettings(false);
                setShowsDeleteAccountConfirm(true);
              }}
            >
              <UserRoundX size={19} />
              <span>
                <strong>アカウント削除</strong>
                <small>本人データとログイン情報を削除</small>
              </span>
            </button>
            <button
              className="danger-button danger-button--wide"
              type="button"
              onClick={() => {
                setShowsSettings(false);
                setShowsLogoutConfirm(true);
              }}
            >
              <LogOut size={18} />
              ログアウト
            </button>
          </div>
        </Modal>
      ) : null}

      {showsSiteAdmin && siteRoleReady ? (
        siteAdminContext?.role === "site_admin" ? (
          <Modal title="サイト管理" size="wide" onClose={closeSiteAdmin}>
            <SiteAdminPanel
              context={siteAdminContext}
              onNotice={setToast}
            />
          </Modal>
        ) : (
          <Modal title="サイト管理" onClose={closeSiteAdmin}>
            <p className="site-admin-denied" role="alert">
              この画面を表示する権限がありません。
            </p>
          </Modal>
        )
      ) : null}

      {accountPage ? (
        <Modal
          title={accountPageTitle(accountPage)}
          size="wide"
          onClose={closeAccountPage}
        >
          <AccountInfoPage route={accountPage} />
        </Modal>
      ) : null}

      {showsLogoutConfirm ? (
        <Modal
          title="ログアウト"
          onClose={() => {
            if (!logoutBusy) {
              setShowsLogoutConfirm(false);
              setShowsSettings(true);
            }
          }}
          footer={
            <div className="logout-confirm-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={logoutBusy}
                onClick={() => {
                  setShowsLogoutConfirm(false);
                  setShowsSettings(true);
                }}
              >
                キャンセル
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={logoutBusy}
                onClick={() => {
                  setLogoutBusy(true);
                  void (async () => {
                    try {
                      await onSignOut();
                    } catch (error) {
                      console.error("Sign out failed:", error);
                      setToast("ログアウトできませんでした。通信状態を確認してください");
                      setLogoutBusy(false);
                    }
                  })();
                }}
              >
                {logoutBusy ? "ログアウト中…" : "ログアウト"}
              </button>
            </div>
          }
        >
          <p className="logout-confirm-message">
            現在のアカウントからログアウトします。よろしいですか？
          </p>
        </Modal>
      ) : null}

      {showsDeleteAccountConfirm ? (
        <Modal
          title="本当にアカウントを削除しますか？"
          onClose={() => {
            if (!deleteAccountBusy) {
              setShowsDeleteAccountConfirm(false);
              setShowsSettings(true);
            }
          }}
          footer={
            <div className="logout-confirm-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={deleteAccountBusy}
                onClick={() => {
                  setShowsDeleteAccountConfirm(false);
                  setShowsSettings(true);
                }}
              >
                キャンセル
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={deleteAccountBusy}
                onClick={() => {
                  setDeleteAccountBusy(true);
                  void (async () => {
                    try {
                      await deleteOwnAccount();
                      await onAccountDeleted();
                    } catch (caught) {
                      console.error("Account deletion failed:", caught);
                      setToast(
                        caught instanceof Error
                          ? caught.message
                          : "アカウントを削除できませんでした。",
                      );
                      setDeleteAccountBusy(false);
                    }
                  })();
                }}
              >
                {deleteAccountBusy ? "削除中…" : "削除する"}
              </button>
            </div>
          }
        >
          <div className="account-delete-confirm">
            <p>次の本人データは削除後に元へ戻せません。</p>
            <ul>
              <li>プロフィール</li>
              <li>写真</li>
              <li>走行記録</li>
              <li>アルバム参加情報</li>
              <li>その他本人データ</li>
            </ul>
            <p>
              他のメンバーが参加している所有アルバムは、他ユーザーのデータを残すため安全に引き継がれます。
            </p>
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
