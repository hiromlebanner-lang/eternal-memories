import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );

const cleanHeaderText = (value: string) =>
  Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? " " : character;
  })
    .join("")
    .trim();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Invitation = {
  id: string;
  album_id: string;
  email: string;
  token: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: string;
  expires_at: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "POSTメソッドを使用してください" }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "ログインが必要です" }, 401);
  }

  try {
    const input: unknown = await request.json();
    const invitationId =
      typeof input === "object" &&
      input !== null &&
      "invitationId" in input &&
      typeof input.invitationId === "string"
        ? input.invitationId
        : "";

    if (!uuidPattern.test(invitationId)) {
      return json({ error: "正しいinvitationIdが必要です" }, 400);
    }

    const supabaseURL = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SB_PUBLISHABLE_KEY");
    const resendAPIKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("INVITE_FROM_EMAIL");
    const appURLValue = Deno.env.get("APP_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (
      !supabaseURL ||
      !anonKey ||
      !resendAPIKey ||
      !from ||
      !appURLValue
    ) {
      console.error("send-album-invite: required environment variable missing");
      return json({ error: "招待メール機能の設定が完了していません" }, 500);
    }

    const appURL = new URL(appURLValue);
    if (
      !["https:", "http:"].includes(appURL.protocol) ||
      appURL.username ||
      appURL.password
    ) {
      console.error("send-album-invite: APP_URL is invalid");
      return json({ error: "招待メール機能のURL設定が正しくありません" }, 500);
    }
    appURL.search = "";
    appURL.hash = "";

    const userClient = createClient(supabaseURL, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const jwt = authorization.slice("Bearer ".length);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(jwt);
    if (userError || !user) {
      return json({ error: "ログインセッションが無効です" }, 401);
    }

    // service_roleは使わず、呼び出しユーザーのJWTで取得します。
    // album_invitationsのRLSにより、オーナー／管理者以外には行自体が見えません。
    const { data: invitationData, error: invitationError } = await userClient
      .from("album_invitations")
      .select("id, album_id, email, token, role, status, expires_at")
      .eq("id", invitationId)
      .maybeSingle();
    const invitation = invitationData as Invitation | null;
    if (invitationError) {
      console.error("Invitation lookup failed", invitationError.message);
      return json({ error: "招待を確認できませんでした" }, 500);
    }
    if (!invitation) {
      return json({ error: "招待が見つからないか、送信権限がありません" }, 404);
    }
    if (
      invitation.status !== "pending" ||
      new Date(invitation.expires_at).getTime() <= Date.now()
    ) {
      return json({ error: "この招待は無効か、有効期限切れです" }, 409);
    }

    const [{ data: membership, error: membershipError }, { data: album, error: albumError }] =
      await Promise.all([
        userClient
          .from("album_members")
          .select("role")
          .eq("album_id", invitation.album_id)
          .eq("user_id", user.id)
          .maybeSingle(),
        userClient
          .from("albums")
          .select("name")
          .eq("id", invitation.album_id)
          .maybeSingle(),
      ]);

    if (
      membershipError ||
      !membership ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      return json({ error: "招待メールを送る権限がありません" }, 403);
    }
    if (albumError || !album) {
      return json({ error: "アルバムが見つかりません" }, 404);
    }

    appURL.searchParams.set("invite", invitation.token);
    const inviteURL = appURL.toString();
    const albumName = cleanHeaderText(album.name) || "共有アルバム";
    const inviterName =
      cleanHeaderText(
        user.user_metadata?.display_name ??
          user.user_metadata?.full_name ??
          user.email?.split("@")[0] ??
          "メンバー",
      ) || "メンバー";
    const expiresAt = new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Asia/Tokyo",
    }).format(new Date(invitation.expires_at));
    const cleanedFrom = cleanHeaderText(from);
    const brandedFrom = cleanedFrom.includes("<")
      ? cleanedFrom
      : `Eternal memories <${cleanedFrom}>`;
    const safeAlbumName = escapeHTML(albumName);
    const safeInviterName = escapeHTML(inviterName);
    const safeInviteURL = escapeHTML(inviteURL);
    const safeExpiresAt = escapeHTML(expiresAt);
    const roleLabel =
      invitation.role === "admin"
        ? "管理者"
        : invitation.role === "viewer"
          ? "閲覧のみ"
          : "メンバー";

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendAPIKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `mapalbum-invite-${invitation.id}`,
      },
      body: JSON.stringify({
        from: brandedFrom,
        to: [invitation.email],
        subject: "【Eternal memories】共有アルバムへの招待が届いています",
        text:
          `${inviterName}さんから、Eternal memoriesの共有アルバム「${albumName}」へ招待されました。\n` +
          `権限: ${roleLabel}\n有効期限: ${expiresAt}\n\n` +
          `参加内容を確認する:\n${inviteURL}\n\n` +
          "このメールに心当たりがない場合は、操作せずそのまま破棄してください。",
        html: `
          <div style="margin:0;background:#fdf5f8;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#4b3340">
            <div style="max-width:560px;margin:auto;padding:30px 24px;border:1px solid #ead9e1;border-radius:22px;background:#fff">
              <div style="margin-bottom:26px;color:#5b3448;font-size:20px;font-weight:700">Eternal memories</div>
              <h1 style="margin:0 0 18px;color:#5b3448;font-size:24px;line-height:1.4">共有アルバムへの招待</h1>
              <p style="font-size:16px;line-height:1.75">${safeInviterName}さんから、共有アルバム「${safeAlbumName}」へ招待されました。</p>
              <p style="font-size:15px;line-height:1.75">権限: ${roleLabel}<br>有効期限: ${safeExpiresAt}</p>
              <a href="${safeInviteURL}" style="display:block;margin:24px 0;padding:15px 18px;border-radius:14px;background:#ad4d72;color:#fff;text-align:center;text-decoration:none;font-weight:700">参加内容を確認する</a>
              <p style="color:#765f6b;font-size:13px;line-height:1.7">ボタンを利用できない場合は、次のURLをブラウザで開いてください。</p>
              <p style="padding:12px;border-radius:10px;background:#f8edf2;color:#76566a;font-size:12px;line-height:1.6;overflow-wrap:anywhere">${safeInviteURL}</p>
              <p style="color:#765f6b;font-size:13px;line-height:1.7">このメールに心当たりがない場合は、操作せずそのまま破棄してください。</p>
              <p style="margin-top:28px;padding-top:20px;border-top:1px solid #eadde3;color:#765f6b;font-size:13px">Eternal memories<br>家族・友人との思い出を、写真と地図に残そう。</p>
            </div>
          </div>
        `,
      }),
    });

    const resendBody = (await resendResponse.json().catch(() => ({}))) as {
      id?: string;
    };
    if (!resendResponse.ok) {
      console.error("Resend error", resendResponse.status, resendBody);
      return json({ error: "招待メールを送信できませんでした" }, 502);
    }

    if (
      serviceRoleKey &&
      vapidSubject &&
      vapidPublicKey &&
      vapidPrivateKey
    ) {
      try {
        const admin = createClient(supabaseURL, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: invitedProfile } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", invitation.email)
          .maybeSingle();
        if (invitedProfile?.id) {
          const { data: subscriptions } = await admin
            .from("push_subscriptions")
            .select("id, endpoint, p256dh, auth_key")
            .eq("user_id", invitedProfile.id)
            .eq("enabled", true);
          webpush.setVapidDetails(
            vapidSubject,
            vapidPublicKey,
            vapidPrivateKey,
          );
          const payload = JSON.stringify({
            title: "アルバムへの招待が届きました",
            body: `${user.user_metadata?.display_name || "アルバム管理者"}さんから『${albumName}』へ招待されました`,
            tag: `album-invitation-${invitation.id}`,
            albumID: invitation.album_id,
            url: inviteURL,
          });
          await Promise.allSettled(
            (subscriptions ?? []).map(async (subscription) => {
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
              } catch (pushError) {
                const statusCode =
                  typeof pushError === "object" &&
                  pushError !== null &&
                  "statusCode" in pushError
                    ? Number(pushError.statusCode)
                    : 0;
                if (statusCode === 404 || statusCode === 410) {
                  await admin
                    .from("push_subscriptions")
                    .update({ enabled: false })
                    .eq("id", subscription.id);
                }
              }
            }),
          );
        }
      } catch (pushError) {
        console.error(
          "Direct invitation push failed",
          pushError instanceof Error ? pushError.message : "unknown error",
        );
      }
    }

    return json({ sent: true, id: resendBody.id ?? null });
  } catch (error) {
    console.error("send-album-invite failed", error);
    return json({ error: "招待メールを送信できませんでした" }, 500);
  }
});
