import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiState = vi.hoisted(() => ({
  profile: null as { id: string } | null,
  profileError: null as Error | null,
  resetError: null as Error | null,
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((_url: string, key: string) => {
    if (key === "server-secret") {
      return {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: apiState.profile,
                error: apiState.profileError,
              }),
            }),
          }),
        }),
      };
    }
    return {
      auth: {
        resetPasswordForEmail: apiState.resetPasswordForEmail,
      },
    };
  }),
}));

import handler from "../api/password-reset";

function request(email: string, ip: string) {
  return {
    method: "POST",
    body: { email },
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage & { body: unknown };
}

function response() {
  const result = {
    statusCode: 0,
    headers: new Map<string, string>(),
    body: "",
  };
  const value = {
    setHeader(name: string, headerValue: string) {
      result.headers.set(name, headerValue);
      return this;
    },
    end(body?: string | Buffer) {
      result.body = Buffer.isBuffer(body) ? body.toString("utf8") : body ?? "";
      return this;
    },
    get statusCode() {
      return result.statusCode;
    },
    set statusCode(status: number) {
      result.statusCode = status;
    },
  } as unknown as ServerResponse;
  return { result, value };
}

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SECRET_KEY = "server-secret";
  apiState.profile = null;
  apiState.profileError = null;
  apiState.resetError = null;
  apiState.resetPasswordForEmail.mockReset();
  apiState.resetPasswordForEmail.mockImplementation(async () => ({
    error: apiState.resetError,
  }));
});

describe("パスワード再設定API", () => {
  it("未登録メールでは送信処理を呼ばず、共通案内を返す", async () => {
    const output = response();
    await handler(request("missing@example.com", "192.0.2.1"), output.value);

    expect(output.result.statusCode).toBe(200);
    expect(apiState.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(JSON.parse(output.result.body).message).toContain("入力内容を確認");
  });

  it("登録済みメールだけ本番再設定URLで送信する", async () => {
    apiState.profile = { id: "user-1" };
    const output = response();
    await handler(request(" User@Example.COM ", "192.0.2.2"), output.value);

    expect(output.result.statusCode).toBe(200);
    expect(apiState.resetPasswordForEmail).toHaveBeenCalledWith(
      "user@example.com",
      {
        redirectTo:
          "https://mapalbum-japan-2026.vercel.app/reset-password",
      },
    );
  });

  it("不正なメール形式を拒否する", async () => {
    const output = response();
    await handler(request("invalid", "192.0.2.3"), output.value);

    expect(output.result.statusCode).toBe(400);
    expect(apiState.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("メール送信エラーを成功扱いにしない", async () => {
    apiState.profile = { id: "user-2" };
    apiState.resetError = new Error("SMTP unavailable");
    const output = response();
    await handler(request("user2@example.com", "192.0.2.4"), output.value);

    expect(output.result.statusCode).toBe(502);
    expect(JSON.parse(output.result.body).message).toContain(
      "メールを送信できませんでした",
    );
  });
});
