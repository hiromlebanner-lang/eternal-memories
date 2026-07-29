import { createClient } from "npm:@supabase/supabase-js@2";

type SiteRole = "site_admin" | "moderator" | "user";

type RequestBody = {
  action?: unknown;
  page?: unknown;
  perPage?: unknown;
  search?: unknown;
  sort?: unknown;
  targetUserId?: unknown;
  role?: unknown;
  confirmation?: unknown;
  reason?: unknown;
  suspendedUntil?: unknown;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
};

type RoleRow = {
  user_id: string;
  role: SiteRole;
};

type SuspensionRow = {
  user_id: string;
  reason: string;
  suspended_until: string | null;
  active: boolean;
};

const allowedOrigins = new Set([
  "https://mapalbum-japan-2026.vercel.app",
  "http://localhost:5173",
]);

class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const responseHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin":
    origin && allowedOrigins.has(origin)
      ? origin
      : "https://mapalbum-japan-2026.vercel.app",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  Vary: "Origin",
});

const json = (origin: string | null, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });

const isUUID = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const isSiteRole = (value: unknown): value is SiteRole =>
  value === "site_admin" || value === "moderator" || value === "user";

const readInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const parsed = typeof value === "number" ? Math.floor(value) : Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
};

const readText = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const activeSuspension = (row?: SuspensionRow) =>
  Boolean(
    row?.active &&
      (!row.suspended_until ||
        new Date(row.suspended_until).getTime() > Date.now()),
  );

async function removeFiles(
  client: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
) {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await client.storage
      .from(bucket)
      .remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return json(origin, { error: "許可されていないアクセスです" }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: responseHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json(origin, { error: "POSTメソッドを使用してください" }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(origin, { error: "ログインが必要です" }, 401);
  }

  try {
    const supabaseURL = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SB_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseURL || !anonKey || !serviceRoleKey) {
      console.error("site-admin: required environment variable missing");
      throw new AdminError("サイト管理機能の設定が完了していません", 500);
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const action = readText(body?.action, 80);
    if (!action) throw new AdminError("操作を確認できません", 400);

    const jwt = authorization.slice("Bearer ".length);
    const userClient = createClient(supabaseURL, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const {
      data: { user: actor },
      error: actorError,
    } = await userClient.auth.getUser(jwt);
    if (actorError || !actor) {
      throw new AdminError("ログインセッションが無効です", 401);
    }

    const admin = createClient(supabaseURL, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const [{ data: actorRoleRow, error: actorRoleError }, { data: actorSuspension }] =
      await Promise.all([
        admin
          .from("user_roles")
          .select("role")
          .eq("user_id", actor.id)
          .maybeSingle<{ role: SiteRole }>(),
        admin
          .from("user_suspensions")
          .select("user_id, reason, suspended_until, active")
          .eq("user_id", actor.id)
          .maybeSingle<SuspensionRow>(),
      ]);
    if (actorRoleError) throw actorRoleError;
    const actorRole: SiteRole = actorRoleRow?.role ?? "user";
    if (activeSuspension(actorSuspension ?? undefined)) {
      throw new AdminError("このアカウントは現在利用を停止されています", 403);
    }

    if (action === "me") {
      return json(origin, {
        role: actorRole,
        userId: actor.id,
        email: actor.email ?? "",
      });
    }

    const canViewUsers =
      actorRole === "site_admin" || actorRole === "moderator";
    if (!canViewUsers) {
      throw new AdminError("この操作を行う権限がありません", 403);
    }

    if (action === "list_users") {
      const page = readInteger(body?.page, 1, 1, 10_000);
      const perPage = readInteger(body?.perPage, 20, 5, 50);
      const search = readText(body?.search, 100).replace(/[,%()]/g, "");
      const sort = body?.sort === "oldest" ? "oldest" : "newest";
      const start = (page - 1) * perPage;

      let profileQuery = admin
        .from("profiles")
        .select("id, display_name, email, created_at", { count: "exact" })
        .order("created_at", { ascending: sort === "oldest" })
        .range(start, start + perPage - 1);
      if (search) {
        profileQuery = profileQuery.or(
          `display_name.ilike.%${search}%,email.ilike.%${search}%`,
        );
      }
      const { data: profiles, error: profileError, count } = await profileQuery;
      if (profileError) throw profileError;
      const profileRows = (profiles ?? []) as ProfileRow[];
      const userIDs = profileRows.map((profile) => profile.id);

      const [{ data: roles, error: roleError }, { data: suspensions, error: suspensionError }] =
        userIDs.length
          ? await Promise.all([
              admin
                .from("user_roles")
                .select("user_id, role")
                .in("user_id", userIDs),
              admin
                .from("user_suspensions")
                .select("user_id, reason, suspended_until, active")
                .in("user_id", userIDs),
            ])
          : [
              { data: [] as RoleRow[], error: null },
              { data: [] as SuspensionRow[], error: null },
            ];
      if (roleError) throw roleError;
      if (suspensionError) throw suspensionError;

      const authResults = await Promise.all(
        profileRows.map((profile) => admin.auth.admin.getUserById(profile.id)),
      );
      const roleMap = new Map(
        ((roles ?? []) as RoleRow[]).map((row) => [row.user_id, row.role]),
      );
      const suspensionMap = new Map(
        ((suspensions ?? []) as SuspensionRow[]).map((row) => [
          row.user_id,
          row,
        ]),
      );
      const users = profileRows.flatMap((profile, index) => {
        const authUser = authResults[index].data.user;
        if (!authUser || authResults[index].error) return [];
        const suspension = suspensionMap.get(profile.id);
        return [
          {
            id: profile.id,
            displayName:
              profile.display_name ||
              authUser.user_metadata?.display_name ||
              "ユーザー",
            email: authUser.email ?? profile.email ?? "",
            role: roleMap.get(profile.id) ?? "user",
            createdAt: authUser.created_at ?? profile.created_at,
            lastSignInAt: authUser.last_sign_in_at ?? null,
            emailConfirmed: Boolean(authUser.email_confirmed_at),
            suspended: activeSuspension(suspension),
            suspensionReason: suspension?.reason ?? null,
            suspendedUntil: suspension?.suspended_until ?? null,
          },
        ];
      });

      return json(origin, {
        users,
        page,
        perPage,
        total: count ?? users.length,
      });
    }

    if (actorRole !== "site_admin") {
      throw new AdminError("サイト管理者だけが実行できる操作です", 403);
    }

    if (action === "list_audit_logs") {
      const page = readInteger(body?.page, 1, 1, 10_000);
      const perPage = readInteger(body?.perPage, 20, 5, 50);
      const start = (page - 1) * perPage;
      const { data, error, count } = await admin
        .from("admin_audit_logs")
        .select(
          "id, admin_user_id, target_user_id, action, before_value, after_value, reason, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(start, start + perPage - 1);
      if (error) throw error;
      return json(origin, {
        logs: data ?? [],
        page,
        perPage,
        total: count ?? 0,
      });
    }

    if (!isUUID(body?.targetUserId)) {
      throw new AdminError("対象ユーザーの指定が正しくありません", 400);
    }
    const targetUserID = body.targetUserId;
    if (targetUserID === actor.id) {
      throw new AdminError("自分自身にはこの操作を実行できません", 403);
    }

    const [
      { data: targetAuthData, error: targetAuthError },
      { data: targetRoleRow, error: targetRoleError },
    ] = await Promise.all([
      admin.auth.admin.getUserById(targetUserID),
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserID)
        .maybeSingle<{ role: SiteRole }>(),
    ]);
    if (targetAuthError || !targetAuthData.user) {
      throw new AdminError("対象ユーザーが見つかりません", 404);
    }
    if (targetRoleError) throw targetRoleError;
    const targetRole: SiteRole = targetRoleRow?.role ?? "user";

    if (action === "change_role") {
      if (!isSiteRole(body?.role)) {
        throw new AdminError("変更後の権限が正しくありません", 400);
      }
      const nextRole = body.role;
      if (
        nextRole === "site_admin" &&
        body.confirmation !== "GRANT_SITE_ADMIN"
      ) {
        throw new AdminError("サイト管理者権限の確認が必要です", 400);
      }
      if (targetRole === "site_admin" && nextRole !== "site_admin") {
        const { count, error } = await admin
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "site_admin");
        if (error) throw error;
        if ((count ?? 0) <= 1) {
          throw new AdminError("最後のサイト管理者は降格できません", 409);
        }
      }

      const { error } = await admin.from("user_roles").upsert(
        {
          user_id: targetUserID,
          role: nextRole,
          created_by: actor.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      const { error: auditError } = await admin
        .from("admin_audit_logs")
        .insert({
          admin_user_id: actor.id,
          target_user_id: targetUserID,
          action: "role_changed",
          before_value: { role: targetRole },
          after_value: { role: nextRole },
          reason: readText(body?.reason, 500) || null,
        });
      if (auditError) throw auditError;
      return json(origin, { updated: true, role: nextRole });
    }

    if (targetRole === "site_admin") {
      throw new AdminError("サイト管理者にはこの操作を実行できません", 403);
    }

    if (action === "suspend_user") {
      const reason = readText(body?.reason, 500);
      if (reason.length < 3) {
        throw new AdminError("停止理由を3文字以上で入力してください", 400);
      }
      const requestedUntil = readText(body?.suspendedUntil, 40);
      let suspendedUntil: string | null = null;
      let banDuration = "876000h";
      if (requestedUntil) {
        const untilTime = new Date(requestedUntil).getTime();
        if (!Number.isFinite(untilTime) || untilTime <= Date.now()) {
          throw new AdminError("停止期限を確認してください", 400);
        }
        const seconds = Math.max(
          60,
          Math.ceil((untilTime - Date.now()) / 1000),
        );
        suspendedUntil = new Date(untilTime).toISOString();
        banDuration = `${seconds}s`;
      }

      const { error: banError } = await admin.auth.admin.updateUserById(
        targetUserID,
        { ban_duration: banDuration },
      );
      if (banError) throw banError;
      const { error: suspensionError } = await admin
        .from("user_suspensions")
        .upsert(
          {
            user_id: targetUserID,
            reason,
            suspended_at: new Date().toISOString(),
            suspended_by: actor.id,
            suspended_until: suspendedUntil,
            active: true,
            ended_at: null,
            ended_by: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (suspensionError) {
        await admin.auth.admin
          .updateUserById(targetUserID, { ban_duration: "none" })
          .catch(() => undefined);
        throw suspensionError;
      }
      const { error: auditError } = await admin
        .from("admin_audit_logs")
        .insert({
          admin_user_id: actor.id,
          target_user_id: targetUserID,
          action: "user_suspended",
          before_value: { suspended: false },
          after_value: { suspended: true, suspendedUntil },
          reason,
        });
      if (auditError) throw auditError;
      return json(origin, { suspended: true });
    }

    if (action === "reactivate_user") {
      const reason = readText(body?.reason, 500) || "利用停止を解除";
      const { error: unbanError } = await admin.auth.admin.updateUserById(
        targetUserID,
        { ban_duration: "none" },
      );
      if (unbanError) throw unbanError;
      const { error: suspensionError } = await admin
        .from("user_suspensions")
        .update({
          active: false,
          ended_at: new Date().toISOString(),
          ended_by: actor.id,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", targetUserID);
      if (suspensionError) throw suspensionError;
      const { error: auditError } = await admin
        .from("admin_audit_logs")
        .insert({
          admin_user_id: actor.id,
          target_user_id: targetUserID,
          action: "user_reactivated",
          before_value: { suspended: true },
          after_value: { suspended: false },
          reason,
        });
      if (auditError) throw auditError;
      return json(origin, { suspended: false });
    }

    if (action === "delete_user") {
      if (body?.confirmation !== "削除する") {
        throw new AdminError("登録解除の確認文字を入力してください", 400);
      }
      const [
        { data: ownedAlbums, error: ownedAlbumError },
        { data: sharedPhotos, error: sharedPhotoError },
      ] = await Promise.all([
        admin
          .from("albums")
          .select("id")
          .eq("created_by", targetUserID)
          .limit(1),
        admin
          .from("photos")
          .select("id")
          .eq("author_id", targetUserID)
          .not("album_id", "is", null)
          .limit(1),
      ]);
      if (ownedAlbumError) throw ownedAlbumError;
      if (sharedPhotoError) throw sharedPhotoError;
      if ((ownedAlbums?.length ?? 0) > 0) {
        throw new AdminError(
          "所有アルバムがあるため登録解除できません。先に所有権を整理してください",
          409,
        );
      }
      if ((sharedPhotos?.length ?? 0) > 0) {
        throw new AdminError(
          "共有アルバムの写真があるため登録解除できません。通常は利用停止をご利用ください",
          409,
        );
      }

      const { data: photos, error: photoError } = await admin
        .from("photos")
        .select("storage_path")
        .eq("author_id", targetUserID);
      if (photoError) throw photoError;
      const paths = (photos ?? [])
        .map((photo) => photo.storage_path)
        .filter(
          (path): path is string =>
            typeof path === "string" && path.length > 0,
        );
      await removeFiles(admin, "album-photos", paths);
      await admin.storage
        .from("avatars")
        .remove([`${targetUserID}.jpg`])
        .then(({ error }) => {
          if (error) throw error;
        });

      const { error: prepareError } = await admin.rpc(
        "prepare_account_deletion",
        { p_user_id: targetUserID },
      );
      if (prepareError) throw prepareError;
      const { error: deleteError } = await admin.auth.admin.deleteUser(
        targetUserID,
        false,
      );
      if (deleteError) throw deleteError;
      const { error: auditError } = await admin
        .from("admin_audit_logs")
        .insert({
          admin_user_id: actor.id,
          target_user_id: null,
          action: "user_deleted",
          before_value: {
            userId: targetUserID,
            email: targetAuthData.user.email ?? null,
            role: targetRole,
          },
          after_value: { deleted: true },
          reason: readText(body?.reason, 500) || "サイト管理者による登録解除",
        });
      if (auditError) throw auditError;
      return json(origin, { deleted: true });
    }

    throw new AdminError("未対応の操作です", 400);
  } catch (error) {
    if (error instanceof AdminError) {
      return json(origin, { error: error.message }, error.status);
    }
    console.error(
      "site-admin failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return json(
      origin,
      { error: "管理操作を完了できませんでした。時間を空けてもう一度お試しください。" },
      500,
    );
  }
});
