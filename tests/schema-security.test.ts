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
  "nearby_invitations",
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

  it("アルバム作成者はRETURNING時点でも作成行を閲覧できる", () => {
    expect(schema).toMatch(
      /create policy "members view albums"[\s\S]*created_by = auth\.uid\(\)[\s\S]*public\.is_album_member\(id\)/,
    );
  });

  it("写真の投稿者・StorageパスをDBトリガーでも検証する", () => {
    expect(schema).toContain("create trigger photos_protect_identity");
    expect(schema).toContain("new.author_id is distinct from auth.uid()");
    expect(schema).toContain("new.author_name := coalesce(profile_name");
    expect(schema).toContain("expected_storage_path");
  });

  it("近距離Presenceをログイン済みユーザーだけに限定する", () => {
    expect(schema).toContain(
      'create policy "authenticated users read nearby presence"',
    );
    expect(schema).toContain(
      'create policy "authenticated users send nearby presence"',
    );
    expect(schema).toMatch(
      /on realtime\.messages for select[\s\S]*to authenticated[\s\S]*realtime\.topic\(\) = 'nearby-users'/,
    );
    expect(schema).toMatch(
      /on realtime\.messages for insert[\s\S]*to authenticated[\s\S]*realtime\.topic\(\) = 'nearby-users'/,
    );
  });

  it("近距離招待は対象本人の受諾後に通常の参加申請を作成する", () => {
    expect(schema).toContain(
      "create or replace function public.respond_nearby_invitation",
    );
    expect(schema).toMatch(
      /respond_nearby_invitation[\s\S]*invited_user_id = auth\.uid\(\)[\s\S]*insert into public\.album_join_requests/,
    );
    expect(schema).toMatch(
      /create table if not exists public\.nearby_invitations[\s\S]*expires_at timestamptz not null default \(now\(\) \+ interval '5 minutes'\)/,
    );
  });
});
