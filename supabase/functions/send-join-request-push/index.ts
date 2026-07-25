import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type JoinRequestRecord = {
  id: string;
  album_id: string;
  user_id: string;
  status: string;
};

type WebhookBody = {
  type?: string;
  table?: string;
  schema?: string;
  record?: JoinRequestRecord;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host === "fcm.googleapis.com" ||
        host === "updates.push.services.mozilla.com" ||
        host === "web.push.apple.com" ||
        host.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const webhookSecret = Deno.env.get("JOIN_REQUEST_WEBHOOK_SECRET") ?? "";
  if (
    !webhookSecret ||
    request.headers.get("x-mapalbum-webhook-secret") !== webhookSecret
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseURL = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const appOrigin = (Deno.env.get("APP_ORIGIN") ?? "").replace(/\/$/, "");
  if (
    !supabaseURL ||
    !serviceRoleKey ||
    !vapidSubject ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !appOrigin
  ) {
    return json({ error: "Push environment is incomplete" }, 500);
  }

  let body: WebhookBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const record = body.record;
  if (
    body.type !== "INSERT" ||
    body.schema !== "public" ||
    body.table !== "album_join_requests" ||
    !record?.id ||
    record.status !== "pending"
  ) {
    return json({ skipped: true });
  }

  const admin = createClient(supabaseURL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [
    { data: album, error: albumError },
    { data: applicant, error: applicantError },
    { data: managers, error: managersError },
  ] = await Promise.all([
    admin.from("albums").select("id, name").eq("id", record.album_id).single(),
    admin
      .from("profiles")
      .select("display_name")
      .eq("id", record.user_id)
      .single(),
    admin
      .from("album_members")
      .select("user_id")
      .eq("album_id", record.album_id)
      .in("role", ["owner", "admin"]),
  ]);
  if (albumError || applicantError || managersError || !album) {
    return json(
      {
        error: "Notification target lookup failed",
        details:
          albumError?.message ??
          applicantError?.message ??
          managersError?.message,
      },
      500,
    );
  }

  const managerIDs = (managers ?? []).map((manager) => manager.user_id);
  if (managerIDs.length === 0) return json({ delivered: 0 });

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("user_id", managerIDs)
    .eq("enabled", true);
  if (subscriptionsError) {
    return json({ error: subscriptionsError.message }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const applicantName = applicant?.display_name || "参加希望者";
  const targetURL = new URL("/", appOrigin);
  targetURL.searchParams.set("manageJoin", record.album_id);
  const payload = JSON.stringify({
    title: "MapAlbumの参加申請",
    body: `${applicantName}さんが「${album.name}」への参加を申請しました`,
    tag: `join-request-${record.id}`,
    albumID: record.album_id,
    url: targetURL.toString(),
  });

  const expiredIDs: string[] = [];
  const results = await Promise.allSettled(
    ((subscriptions ?? []) as PushSubscriptionRow[]).map(
      async (subscription) => {
        if (!isAllowedPushEndpoint(subscription.endpoint)) {
          expiredIDs.push(subscription.id);
          return;
        }
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth_key,
              },
            },
            payload,
          );
        } catch (error) {
          const statusCode =
            typeof error === "object" && error !== null && "statusCode" in error
              ? Number((error as { statusCode?: unknown }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            expiredIDs.push(subscription.id);
            return;
          }
          throw error;
        }
      },
    ),
  );

  if (expiredIDs.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expiredIDs);
  }
  const delivered = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  const failed = results.length - delivered;
  return json({ delivered, failed, removed: expiredIDs.length });
});
