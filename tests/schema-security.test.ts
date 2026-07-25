// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve("supabase/schema.sql"), "utf8");
const tables = [
  "profiles",
  "albums",
  "album_members",
  "photos",
  "album_invitations",
  "album_join_requests",
];

describe("Supabase RLS・未ログイン遮断", () => {
  it("12 全アプリテーブルでRLSを有効化しanon権限を取り消す", () => {
    for (const table of tables) {
      expect(schema).toContain(
        `alter table public.${table} enable row level security;`,
      );
      expect(schema).toContain(`revoke all on table public.${table} from anon;`);
    }
  });

  it("Private Storageを使い、閲覧・投稿・削除をauthenticatedに限定する", () => {
    expect(schema).toMatch(
      /values\s*\(\s*'album-photos',\s*'album-photos',\s*false,/s,
    );
    expect(schema).toMatch(
      /create policy "members read album photos"[\s\S]*to authenticated/,
    );
    expect(schema).toMatch(
      /create policy "contributors upload album photos"[\s\S]*to authenticated/,
    );
    expect(schema).toMatch(
      /create policy "authors or managers delete stored photos"[\s\S]*to authenticated/,
    );
  });

  it("閲覧者へ招待コードを直接公開せず管理者RPCだけで取得する", () => {
    expect(schema).toContain(
      "grant select (id, name, description, created_by, created_at)",
    );
    expect(schema).not.toContain("grant select, delete on table public.albums");
    expect(schema).toMatch(
      /function public\.get_album_invite_code[\s\S]*public\.is_album_manager/,
    );
  });

  it("写真の投稿者・StorageパスをDBトリガーでも検証する", () => {
    expect(schema).toContain("create trigger photos_protect_identity");
    expect(schema).toContain("new.author_id is distinct from auth.uid()");
    expect(schema).toContain("new.author_name := coalesce(profile_name");
    expect(schema).toContain("expected_storage_path");
  });
});
