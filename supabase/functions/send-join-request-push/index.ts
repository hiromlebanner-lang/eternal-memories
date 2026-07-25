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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message.slice(0, 500);
  }
  return "Push delivery failed";
}

function pushStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error
  ) {
    const statusCode = Number(error.statusCode);
    return Number.isFinite(statusCode) ? statusCode : 0;
  }
  return 0;
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

  let safeAppOrigin: string;
  try {
    const parsedOrigin = new URL(appOrigin);
    if (parsedOrigin.protocol !== "https:") {
      return json({ error: "APP_ORIGIN must use HTTPS" }, 500);
    }
    safeAppOrigin = parsedOrigin.origin;
  } catch {
    return json({ error: "APP_ORIGIN is invalid" }, 500);
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
    admin
      .from("albums")
      .select("id, name, created_by")
      .eq("id", record.album_id)
      .single(),
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

  const managerIDs = [
    album.created_by,
    ...(managers ?? []).map((manager) => manager.user_id),
  ].filter(
    (managerID, index, allIDs): managerID is string =>
      typeof managerID === "string" &&
      managerID !== record.user_id &&
      allIDs.indexOf(managerID) === index,
  );
  if (managerIDs.length === 0) return json({ delivered: 0, failed: 0 });

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
  const targetURL = new URL("/", safeAppOrigin);
  targetURL.searchParams.set("manageJoin", record.album_id);
  const payload = JSON.stringify({
    title: "MapAlbumに参加申請が届きました",
    body: `${applicantName}さんが『${album.name}』への参加を申請しました`,
    tag: `join-request-${record.id}`,
    albumID: record.album_id,
    url: targetURL.toString(),
  });

  const results = await Promise.all(
    ((subscriptions ?? []) as PushSubscriptionRow[]).map(
      async (subscription) => {
        const { data: claimed, error: claimError } = await admin.rpc(
          "claim_join_request_push_delivery",
          {
            p_request_id: record.id,
            p_subscription_id: subscription.id,
          },
        );
        if (claimError) {
          return { status: "failed" as const };
        }
        if (!claimed) {
          return { status: "duplicate" as const };
        }

        if (!isAllowedPushEndpoint(subscription.endpoint)) {
          await Promise.all([
            admin
              .from("push_subscriptions")
              .update({ enabled: false })
              .eq("id", subscription.id),
            admin.rpc("finish_join_request_push_delivery", {
              p_request_id: record.id,
              p_subscription_id: subscription.id,
              p_status: "invalid",
              p_error: "Unsupported push endpoint",
            }),
          ]);
          return { status: "invalid" as const };
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
          await admin.rpc("finish_join_request_push_delivery", {
            p_request_id: record.id,
            p_subscription_id: subscription.id,
            p_status: "delivered",
            p_error: "",
          });
          return { status: "delivered" as const };
        } catch (error) {
          const statusCode = pushStatusCode(error);
          const invalid = statusCode === 404 || statusCode === 410;
          if (invalid) {
            await admin
              .from("push_subscriptions")
              .update({ enabled: false })
              .eq("id", subscription.id);
          }
          await admin.rpc("finish_join_request_push_delivery", {
            p_request_id: record.id,
            p_subscription_id: subscription.id,
            p_status: invalid ? "invalid" : "failed",
            p_error: errorMessage(error),
          });
          return { status: invalid ? ("invalid" as const) : ("failed" as const) };
        }
      },
    ),
  );

  return json({
    delivered: results.filter((result) => result.status === "delivered").length,
    failed: results.filter((result) => result.status === "failed").length,
    disabled: results.filter((result) => result.status === "invalid").length,
    duplicates: results.filter((result) => result.status === "duplicate")
      .length,
  });
});
