import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALBUM_THEME_TEMPLATES,
  DEFAULT_ALBUM_THEME_ID,
  getAlbumThemeTemplate,
} from "../src/lib/albumThemes";

describe("アルバムテーマテンプレート", () => {
  it("標準を初期値にして8種類のシステムテーマを提供する", () => {
    expect(DEFAULT_ALBUM_THEME_ID).toBe("standard");
    expect(ALBUM_THEME_TEMPLATES.map((template) => template.id)).toEqual([
      "standard",
      "diy",
      "travel",
      "family",
      "event",
      "work",
      "sassen",
      "other",
    ]);
  });

  it("色・アイコン・ロゴ・保存画像設定・初期タグを1つの構造で保持する", () => {
    const travel = getAlbumThemeTemplate("travel");
    expect(travel.settings).toMatchObject({
      schemaVersion: 1,
      source: "system",
      themeColor: "#4d86a8",
      albumIcon: "travel",
      logo: {
        text: "Eternal memories",
        position: "bottom-right",
      },
      downloadImage: {
        watermarkEnabled: true,
        watermarkPosition: "bottom-right",
      },
      initialTags: ["旅行"],
      initialDescription: null,
    });
  });

  it("既存アルバムを一括更新せず、管理者確認付きRPCで保存する", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260731_album_theme_templates.sql",
      ),
      "utf8",
    );
    expect(migration).not.toMatch(/update\s+public\.albums\s+set[\s\S]*where\s+theme_template_id\s+is\s+null/i);
    expect(migration).toMatch(
      /update_album_presentation_v2[\s\S]*is_album_manager\(p_album_id\)/,
    );
    expect(migration).toContain(
      "grant select (theme_template_id, theme_settings)",
    );
  });
});
