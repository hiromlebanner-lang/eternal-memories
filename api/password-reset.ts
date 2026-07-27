import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";

interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

const RESET_MESSAGE =
  "入力内容を確認しました。登録済みのメールアドレスには、パスワード再設定メールを送信します。";
const SEND_ERROR_MESSAGE =
  "メールを送信できませんでした。時間を空けてもう一度お試しください。";
const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 3;
const attempts = new Map<string, { count: number; expiresAt: number }>();

function sendJSON(response: ServerResponse, status: number, message: string) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify({ message }));
}

async function readJSONBody(request: ApiRequest): Promise<unknown> {
  if (request.body !== undefined) {
    if (typeof request.body === "string") return JSON.parse(request.body);
    if (Buffer.isBuffer(request.body)) {
      return JSON.parse(request.body.toString("utf8"));
    }
    return request.body;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function rateLimitKey(request: ApiRequest, email: string) {
  const forwarded = request.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim() || request.socket.remoteAddress || "unknown";
  return createHash("sha256").update(`${ip}|${email}`).digest("hex");
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.expiresAt <= now) {
    attempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

async function waitForMinimumResponse(startedAt: number) {
  const remaining = 350 - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export default async function handler(
  request: ApiRequest,
  response: ServerResponse,
) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJSON(response, 405, "Method Not Allowed");
    return;
  }

  const startedAt = Date.now();
  try {
    const body = await readJSONBody(request);
    const email =
      body && typeof body === "object"
        ? normalizeEmail(Reflect.get(body, "email"))
        : "";
    if (!isValidEmail(email)) {
      sendJSON(response, 400, "正しいメールアドレスを入力してください");
      return;
    }

    if (isRateLimited(rateLimitKey(request, email))) {
      await waitForMinimumResponse(startedAt);
      sendJSON(response, 429, SEND_ERROR_MESSAGE);
      return;
    }

    const supabaseURL =
      process.env.SUPABASE_URL?.trim() ||
      process.env.VITE_SUPABASE_URL?.trim();
    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY?.trim() ||
      process.env.VITE_SUPABASE_ANON_KEY?.trim();
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseURL || !supabaseAnonKey || !supabaseSecretKey) {
      console.error("[PasswordReset] Required server environment is missing");
      sendJSON(response, 503, SEND_ERROR_MESSAGE);
      return;
    }

    const serverClient = createClient(supabaseURL, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { data: profile, error: profileError } = await serverClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (profileError) throw profileError;

    if (profile) {
      const publicClient = createClient(supabaseURL, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      });
      const redirectTo =
        process.env.PASSWORD_RESET_REDIRECT_URL?.trim() ||
        "https://mapalbum-japan-2026.vercel.app/reset-password";
      const { error: resetError } =
        await publicClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) throw resetError;
    }

    await waitForMinimumResponse(startedAt);
    sendJSON(response, 200, RESET_MESSAGE);
  } catch (error) {
    console.error("[PasswordReset] Request failed", error);
    await waitForMinimumResponse(startedAt);
    sendJSON(response, 502, SEND_ERROR_MESSAGE);
  }
}
