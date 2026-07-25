// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260726_safe_join_request_push.sql"),
  "utf8",
).toLowerCase();

const edgeFunction = readFileSync(
  resolve("supabase/functions/send-join-request-push/index.ts"),
  "utf8",
);

const pushWorker = readFileSync(resolve("public/push-sw.js"), "utf8");

describe("参加申請Push専用migration", () => {
  it("トランザクション化され既存データを破壊するSQLを含まない", () => {
    expect(migration).toMatch(/^--[\s\S]*\nbegin;/);
    expect(migration).toContain("\ncommit;");
    expect(migration).not.toMatch(/\bdrop\s+table\b/);
    expect(migration).not.toMatch(/\btruncate\b/);
    expect(migration).not.toMatch(/\bdelete\s+from\b/);
    expect(migration).not.toMatch(/\bdrop\s+policy\b/);
  });

  it("購読・重複防止・RPC・RLS・Realtimeだけを追加する", () => {
    expect(migration).toContain(
      "create table if not exists public.push_subscriptions",
    );
    expect(migration).toContain(
      "create table if not exists public.join_request_push_deliveries",
    );
    expect(migration).toContain(
      "public.upsert_push_subscription",
    );
    expect(migration).toContain(
      "public.claim_join_request_push_delivery",
    );
    expect(migration).toContain(
      "alter table public.push_subscriptions enable row level security",
    );
    expect(migration).toContain(
      "add table public.album_join_requests",
    );
    expect(migration).not.toContain("nearby_invitations");
  });
});

describe("send-join-request-push", () => {
  it("pendingのINSERTだけを処理しオーナーと管理者へ送る", () => {
    expect(edgeFunction).toContain('body.type !== "INSERT"');
    expect(edgeFunction).toContain('record.status !== "pending"');
    expect(edgeFunction).toContain(".select(\"id, name, created_by\")");
    expect(edgeFunction).toContain('.in("role", ["owner", "admin"])');
    expect(edgeFunction).toContain("managerID !== record.user_id");
  });

  it("端末単位で送信を獲得し期限切れ購読を無効化する", () => {
    expect(edgeFunction).toContain('"claim_join_request_push_delivery"');
    expect(edgeFunction).toContain('"finish_join_request_push_delivery"');
    expect(edgeFunction).toContain(".update({ enabled: false })");
    expect(edgeFunction).not.toContain(
      '.from("push_subscriptions").delete()',
    );
  });

  it("指定の通知文と安全な申請管理URLを送る", () => {
    expect(edgeFunction).toContain("MapAlbumに参加申請が届きました");
    expect(edgeFunction).toContain("への参加を申請しました");
    expect(edgeFunction).toContain(
      'targetURL.searchParams.set("manageJoin", record.album_id)',
    );
    expect(pushWorker).toContain(
      "requestedURL.origin === self.location.origin",
    );
    expect(pushWorker).toContain(
      'targetURL.searchParams.set("manageJoin", albumID)',
    );
  });
});
