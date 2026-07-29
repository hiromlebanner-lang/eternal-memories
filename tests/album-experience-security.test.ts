// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260729_album_experience_offline.sql"),
  "utf8",
);

describe("アルバム整理機能の権限", () => {
  it("お気に入りとフォルダはユーザー単位でRLS保護する", () => {
    expect(migration).toContain(
      "primary key (user_id, album_id)",
    );
    expect(migration).toContain(
      "alter table public.user_album_preferences enable row level security",
    );
    expect(migration).toMatch(
      /users manage own album preferences[\s\S]*user_id = auth\.uid\(\)[\s\S]*public\.is_album_member\(album_id\)/,
    );
  });

  it("表紙・公開範囲・タグ変更をアルバム管理者だけに限定する", () => {
    expect(migration).toMatch(
      /function public\.update_album_presentation[\s\S]*public\.is_album_manager\(p_album_id\)/,
    );
    expect(migration).toMatch(
      /function public\.update_album_presentation[\s\S]*security definer/,
    );
    expect(migration).toMatch(
      /function public\.validate_album_cover_photo[\s\S]*photo\.album_id = new\.id/,
    );
    expect(migration).toContain(
      "revoke all on function public.update_album_presentation",
    );
  });
});
