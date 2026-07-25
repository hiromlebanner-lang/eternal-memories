import { toAppError } from "./errors";
import { supabase } from "./supabase";

const NOTIFICATION_KEY = "mapalbum:join-request-notifications";
const SERVICE_WORKER_READY_TIMEOUT_MS = 12_000;
const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? "";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const decoded = window.atob(base64);
  const bytes = Uint8Array.from(
    decoded,
    (character) => character.charCodeAt(0),
  );
  return bytes.buffer as ArrayBuffer;
}

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

async function readyServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("この端末ではService Workerを利用できません。");
  }

  let timeoutID = 0;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeoutID = window.setTimeout(
          () =>
            reject(
              new Error(
                "Service Workerの準備が完了しませんでした。通信状態を確認してMapAlbumを開き直してください。",
              ),
            ),
          SERVICE_WORKER_READY_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutID);
  }
}

export function isStandalonePWA() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

export function supportsJoinRequestNotifications() {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function joinRequestNotificationsEnabled() {
  return (
    supportsJoinRequestNotifications() &&
    localStorage.getItem(NOTIFICATION_KEY) === "enabled" &&
    Notification.permission === "granted"
  );
}

async function saveJoinRequestNotificationPreference(enabled: boolean) {
  if (!supabase) {
    throw new Error("通知設定を保存できませんでした。");
  }
  const { error } = await supabase.rpc(
    "set_join_request_notifications_enabled",
    { p_enabled: enabled },
  );
  if (error) {
    throw toAppError(error, "通知設定を保存できませんでした。");
  }
}

export async function loadJoinRequestNotificationPreference() {
  if (!supabase) {
    throw new Error("通知設定を確認できませんでした");
  }
  const { data, error } = await supabase.rpc(
    "get_join_request_notifications_enabled",
  );
  if (error) {
    throw toAppError(error, "通知設定を確認できませんでした");
  }
  const enabled = data === true;
  if (enabled && Notification.permission === "granted") {
    localStorage.setItem(NOTIFICATION_KEY, "enabled");
  } else {
    localStorage.removeItem(NOTIFICATION_KEY);
  }
  return enabled;
}

async function removeStoredSubscription(endpoint: string) {
  if (!supabase) {
    throw new Error("Supabaseへ接続されていないため、通知購読を解除できません。");
  }
  const { error } = await supabase.rpc("delete_push_subscription", {
    p_endpoint: endpoint,
  });
  if (error) {
    throw toAppError(error, "通知購読をデータベースから解除できませんでした。");
  }
}

export async function disableJoinRequestNotifications(options?: {
  unsubscribe?: boolean;
}) {
  if (!("serviceWorker" in navigator)) {
    localStorage.removeItem(NOTIFICATION_KEY);
    return false;
  }

  const registration = await readyServiceWorker();
  const subscription = await registration.pushManager?.getSubscription();
  if (subscription) {
    await removeStoredSubscription(subscription.endpoint);
    if (options?.unsubscribe) {
      const unsubscribed = await subscription.unsubscribe();
      if (!unsubscribed) {
        throw new Error(
          "端末のPush購読を解除できませんでした。MapAlbumを開き直して、もう一度OFFにしてください。",
        );
      }
    }
  }

  localStorage.removeItem(NOTIFICATION_KEY);
  return Boolean(subscription);
}

export async function setJoinRequestNotificationsEnabled(enabled: boolean) {
  if (!enabled) {
    await disableJoinRequestNotifications({ unsubscribe: true });
    await saveJoinRequestNotificationPreference(false);
    return false;
  }

  if (isIOSDevice() && !isStandalonePWA()) {
    throw new Error(
      "Safariの共有ボタンから「ホーム画面に追加」し、ホーム画面のMapAlbumから設定してください。",
    );
  }
  if (!supportsJoinRequestNotifications()) {
    throw new Error(
      "この端末ではPush通知を利用できません。アプリを開いている間の参加申請通知は引き続き表示されます。",
    );
  }
  if (!vapidPublicKey) {
    throw new Error(
      "Push通知の公開鍵が未設定です。管理者がVITE_VAPID_PUBLIC_KEYを設定するまで、アプリ内通知をご利用ください。",
    );
  }

  let applicationServerKey: ArrayBuffer;
  try {
    applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  } catch {
    throw new Error(
      "Push通知の公開鍵を読み取れませんでした。管理者へVAPID公開鍵の再設定を依頼してください。",
    );
  }
  if (applicationServerKey.byteLength !== 65) {
    throw new Error(
      "Push通知の公開鍵が正しくありません。管理者へVAPID公開鍵の再設定を依頼してください。",
    );
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") {
    localStorage.removeItem(NOTIFICATION_KEY);
    if (permission === "denied" && isIOSDevice()) {
      throw new Error(
        "通知が拒否されています。iPhoneの「設定」→「通知」→「MapAlbum」で「通知を許可」をONにしてから、もう一度お試しください。",
      );
    }
    throw new Error(
      "通知が許可されませんでした。端末の通知設定を確認してください。アプリ内通知は引き続き利用できます。",
    );
  }

  const registration = await readyServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth || !supabase) {
    await subscription.unsubscribe().catch(() => false);
    throw new Error(
      "Push通知の購読情報を安全に保存できませんでした。ログイン状態と通信状態を確認してください。",
    );
  }

  const { error } = await supabase.rpc("upsert_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 500),
  });
  if (error) {
    await subscription.unsubscribe().catch(() => false);
    throw toAppError(
      error,
      "Push通知の購読情報をSupabaseへ保存できませんでした。",
    );
  }

  try {
    await saveJoinRequestNotificationPreference(true);
  } catch (error) {
    await removeStoredSubscription(endpoint).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }

  localStorage.setItem(NOTIFICATION_KEY, "enabled");
  return true;
}

export async function showJoinRequestSystemNotification(input: {
  title: string;
  body: string;
  tag: string;
  albumID?: string;
}) {
  if (!joinRequestNotificationsEnabled()) return false;

  try {
    const registration = await readyServiceWorker();
    const url = new URL("/", window.location.origin);
    if (input.albumID) url.searchParams.set("manageJoin", input.albumID);
    await registration.showNotification(input.title, {
      body: input.body,
      tag: input.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: url.toString(), albumID: input.albumID },
    });
    return true;
  } catch {
    return false;
  }
}
