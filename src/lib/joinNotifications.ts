import { supabase } from "./supabase";

const NOTIFICATION_KEY = "mapalbum:join-request-notifications";
const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? "";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
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

async function removeStoredSubscription(endpoint: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("delete_push_subscription", {
    p_endpoint: endpoint,
  });
  if (error) throw error;
}

export async function disableJoinRequestNotifications(options?: {
  unsubscribe?: boolean;
}) {
  localStorage.removeItem(NOTIFICATION_KEY);
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager?.getSubscription();
    if (!subscription) return false;
    await removeStoredSubscription(subscription.endpoint);
    if (options?.unsubscribe) await subscription.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

export async function setJoinRequestNotificationsEnabled(enabled: boolean) {
  if (!enabled) {
    await disableJoinRequestNotifications();
    return false;
  }
  if (!supportsJoinRequestNotifications()) {
    throw new Error(
      "この端末ではPush通知を利用できません。アプリ内の参加申請通知は引き続き表示されます。",
    );
  }
  if (!vapidPublicKey) {
    throw new Error(
      "Push通知の公開鍵が未設定です。管理者がVITE_VAPID_PUBLIC_KEYを設定するまで、アプリ内通知をご利用ください。",
    );
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") {
    localStorage.removeItem(NOTIFICATION_KEY);
    throw new Error(
      "通知が許可されませんでした。アプリ内の参加申請通知は引き続き表示されます。",
    );
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth || !supabase) {
    await subscription.unsubscribe().catch(() => false);
    throw new Error("Push通知の購読情報を安全に保存できませんでした。");
  }

  const { error } = await supabase.rpc("upsert_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 500),
  });
  if (error) {
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
    const registration = await navigator.serviceWorker.ready;
    const url = new URL(window.location.href);
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
