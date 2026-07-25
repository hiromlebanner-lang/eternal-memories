import { beforeEach, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("../src/lib/supabase", () => ({
  supabase: supabaseMock,
}));

const subscription = {
  endpoint: "https://push.example.test/subscription/123456789",
  toJSON: vi.fn(() => ({
    endpoint: "https://push.example.test/subscription/123456789",
    keys: {
      p256dh: "p256dh-test-value-1234567890",
      auth: "auth-test-value",
    },
  })),
  unsubscribe: vi.fn(async () => true),
};

const pushManager = {
  getSubscription: vi.fn(async () => subscription),
  subscribe: vi.fn(async () => subscription),
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "AQIDBAUGBwgJCgsMDQ4PEA");
  localStorage.clear();
  supabaseMock.rpc.mockResolvedValue({ data: "subscription-1", error: null });
  subscription.unsubscribe.mockClear();
  pushManager.getSubscription.mockClear();
  pushManager.subscribe.mockClear();

  const requestPermission = vi.fn(async () => "granted");
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      permission: "default",
      requestPermission,
    },
  });
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: class PushManager {},
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager,
        showNotification: vi.fn(),
      }),
    },
  });
});

it("初期OFFでは通知許可を要求せず、ユーザーがONにした時だけ購読する", async () => {
  const notifications = await import("../src/lib/joinNotifications");
  expect(notifications.joinRequestNotificationsEnabled()).toBe(false);
  expect(Notification.requestPermission).not.toHaveBeenCalled();

  await expect(
    notifications.setJoinRequestNotificationsEnabled(true),
  ).resolves.toBe(true);
  expect(Notification.requestPermission).toHaveBeenCalledOnce();
  expect(supabaseMock.rpc).toHaveBeenCalledWith(
    "upsert_push_subscription",
    expect.objectContaining({
      p_endpoint: subscription.endpoint,
      p_p256dh: "p256dh-test-value-1234567890",
      p_auth: "auth-test-value",
    }),
  );
  expect(localStorage.getItem("mapalbum:join-request-notifications")).toBe(
    "enabled",
  );
});

it("ログアウト用の無効化でDB購読を削除し端末購読も解除する", async () => {
  const notifications = await import("../src/lib/joinNotifications");
  localStorage.setItem("mapalbum:join-request-notifications", "enabled");

  await notifications.disableJoinRequestNotifications({
    unsubscribe: true,
  });
  expect(supabaseMock.rpc).toHaveBeenCalledWith(
    "delete_push_subscription",
    { p_endpoint: subscription.endpoint },
  );
  expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  expect(
    localStorage.getItem("mapalbum:join-request-notifications"),
  ).toBeNull();
});
