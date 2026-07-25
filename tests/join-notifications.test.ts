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
  vi.stubEnv(
    "VITE_VAPID_PUBLIC_KEY",
    "BAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
  );
  localStorage.clear();
  supabaseMock.rpc.mockResolvedValue({ data: "subscription-1", error: null });
  subscription.unsubscribe.mockClear();
  pushManager.getSubscription.mockClear();
  pushManager.subscribe.mockClear();
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 Chrome/140.0",
  });
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: false,
  });

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

it("iPhoneの通常Safariでは通知許可を求めずホーム画面追加を案内する", async () => {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)",
  });
  const notifications = await import("../src/lib/joinNotifications");

  await expect(
    notifications.setJoinRequestNotificationsEnabled(true),
  ).rejects.toThrow("ホーム画面に追加");
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  expect(supabaseMock.rpc).not.toHaveBeenCalled();
});

it("iPhone PWAで通知拒否済みなら設定アプリの変更手順を表示する", async () => {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)",
  });
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      permission: "denied",
      requestPermission: vi.fn(),
    },
  });
  const notifications = await import("../src/lib/joinNotifications");

  await expect(
    notifications.setJoinRequestNotificationsEnabled(true),
  ).rejects.toThrow("「設定」→「通知」→「MapAlbum」");
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});

it("購読保存RPCの詳細エラーを利用者へ残す", async () => {
  supabaseMock.rpc.mockResolvedValueOnce({
    data: null,
    error: {
      code: "PGRST202",
      message: "upsert_push_subscription RPC is missing",
      hint: "Run the notification migration",
    },
  });
  const notifications = await import("../src/lib/joinNotifications");

  await expect(
    notifications.setJoinRequestNotificationsEnabled(true),
  ).rejects.toThrow("PGRST202");
  expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  expect(localStorage.getItem("mapalbum:join-request-notifications")).toBeNull();
});

it("DB上の購読解除に失敗した場合はON状態を残して原因を表示する", async () => {
  supabaseMock.rpc.mockResolvedValueOnce({
    data: null,
    error: {
      code: "42501",
      message: "permission denied",
    },
  });
  localStorage.setItem("mapalbum:join-request-notifications", "enabled");
  const notifications = await import("../src/lib/joinNotifications");

  await expect(
    notifications.setJoinRequestNotificationsEnabled(false),
  ).rejects.toThrow("42501");
  expect(subscription.unsubscribe).not.toHaveBeenCalled();
  expect(localStorage.getItem("mapalbum:join-request-notifications")).toBe(
    "enabled",
  );
});
