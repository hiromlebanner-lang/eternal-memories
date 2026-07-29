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
    const body = (await request.json().catch(() => null)) as {
      confirmation?: unknown;
    } | null;
    if (body?.confirmation !== "DELETE_MY_ACCOUNT") {
      return json({ error: "削除の確認が必要です" }, 400);
    }

    const supabaseURL = Deno.env.get("SUPABASE_URL");
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SB_PUBLISHABLE_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseURL || !anonKey || !serviceRoleKey) {
      console.error("delete-account: required environment variable missing");
      return json({ error: "アカウント削除機能の設定が完了していません" }, 500);
    }

    const jwt = authorization.slice("Bearer ".length);
    const userClient = createClient(supabaseURL, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(jwt);
    if (userError || !user) {
      return json({ error: "ログインセッションが無効です" }, 401);
    }

    const admin = createClient(supabaseURL, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const photoPaths: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("photos")
        .select("storage_path")
        .eq("author_id", user.id)
        .range(from, from + 999);
      if (error) throw error;
      const paths = (data ?? [])
        .map((photo) => photo.storage_path)
        .filter((path): path is string => typeof path === "string" && path.length > 0);
      photoPaths.push(...paths);
      if ((data?.length ?? 0) < 1000) break;
    }

    await removeFiles(admin, "album-photos", photoPaths);
    const { error: avatarError } = await admin.storage
      .from("avatars")
      .remove([`${user.id}.jpg`]);
    if (avatarError) throw avatarError;

    const { error: prepareError } = await admin.rpc(
      "prepare_account_deletion",
      { p_user_id: user.id },
    );
    if (prepareError) throw prepareError;

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return json({ deleted: true });
  } catch (error) {
    console.error(
      "delete-account failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return json(
      { error: "アカウントを削除できませんでした。時間を空けてもう一度お試しください。" },
      500,
    );
  }
});
