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
  "push_subscriptions",
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

  it("参加申請は本人と管理者だけが閲覧でき、承認を行ロックで直列化する", () => {
    expect(schema).toMatch(
      /create policy "managers view join requests"[\s\S]*to authenticated[\s\S]*public\.is_album_manager\(album_id\)[\s\S]*user_id = auth\.uid\(\)/,
    );
    expect(schema).toMatch(
      /function public\.can_view_profile[\s\S]*request\.status = 'pending'[\s\S]*public\.is_album_manager\(request\.album_id\)/,
    );
    expect(schema).toMatch(
      /function public\.review_album_join_request[\s\S]*where id = p_request_id[\s\S]*for update[\s\S]*target_request\.status <> 'pending'/,
    );
    expect(schema).toMatch(
      /pubname = 'supabase_realtime'[\s\S]*tablename = 'album_join_requests'/,
    );
  });

  it("アルバム作成者をowner_idへ固定し、クライアントから変更できない", () => {
    expect(schema).toContain(
      "add column if not exists owner_id uuid references public.profiles(id)",
    );
    expect(schema).toMatch(
      /function public\.protect_album_identity[\s\S]*new\.owner_id := auth\.uid\(\)[\s\S]*new\.owner_id is distinct from old\.owner_id/,
    );
    expect(schema).toMatch(
      /create policy "users create albums"[\s\S]*created_by = auth\.uid\(\)[\s\S]*owner_id = auth\.uid\(\)/,
    );
  });

  it("招待コードをアルバム単位で期限管理し、再発行で旧コードを失効する", () => {
    expect(schema).toContain(
      "add column if not exists invite_code_expires_at",
    );
    expect(schema).toContain(
      "add column if not exists members_can_invite boolean not null default false",
    );
    expect(schema).toMatch(
      /function public\.rotate_album_invite_code[\s\S]*invite_code = next_code[\s\S]*invite_code_enabled = true/,
    );
    expect(schema).toMatch(
      /function public\.request_album_membership[\s\S]*album\.invite_code_enabled[\s\S]*album\.invite_code_expires_at > now\(\)/,
    );
    expect(schema).toContain(
      "create unique index if not exists album_join_requests_one_pending_user_idx",
    );
  });

  it("Push購読は本人単位で保存し、ブラウザーへService Roleを公開しない", () => {
    expect(schema).toContain(
      "create table if not exists public.push_subscriptions",
    );
    expect(schema).toContain(
      'create policy "users manage own push subscriptions"',
    );
    expect(schema).toMatch(
      /function public\.upsert_push_subscription[\s\S]*auth\.uid\(\)[\s\S]*on conflict \(endpoint\)/,
    );
    expect(schema).toContain(
      "revoke all on table public.push_subscriptions from anon;",
    );
  });
});
