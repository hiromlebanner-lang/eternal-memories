import { createClient } from "npm:@supabase/supabase-js@2";

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
  value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

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
    const safeAlbumName = escapeHTML(albumName);
    const safeInviteURL = escapeHTML(inviteURL);
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
        from,
        to: [invitation.email],
        subject: `「${albumName}」へのMapAlbum招待`,
        text:
          `MapAlbum「${albumName}」へ招待されました。\n` +
          `予定されている権限: ${roleLabel}\n\n` +
          `${inviteURL}\n\n` +
          "リンクからログインして参加申請を送ってください。オーナーまたは管理者の承認後に参加できます。",
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#273235">
            <div style="padding:28px;border:1px solid #e7e8e8;border-radius:24px">
              <p style="margin:0 0 8px;color:#ff665b;font-weight:700">MapAlbum</p>
              <h1 style="margin:0 0 14px;font-size:24px">「${safeAlbumName}」への招待</h1>
              <p style="line-height:1.7">共有写真アルバムへ招待されました。予定されている権限は「${roleLabel}」です。</p>
              <a href="${safeInviteURL}" style="display:inline-block;margin:14px 0;padding:13px 20px;border-radius:14px;background:#ff665b;color:#fff;text-decoration:none;font-weight:700">参加を申請する</a>
              <p style="color:#6d7476;font-size:13px;line-height:1.7">リンクから招待されたメールアドレスでログインしてください。参加にはオーナーまたは管理者の承認が必要です。</p>
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

    return json({ sent: true, id: resendBody.id ?? null });
  } catch (error) {
    console.error("send-album-invite failed", error);
    return json({ error: "招待メールを送信できませんでした" }, 500);
  }
});
