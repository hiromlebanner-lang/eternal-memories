import { describe, expect, it } from "vitest";
import {
  canDeletePhoto,
  canEditPhoto,
  canManageAlbum,
  canPostPhoto,
} from "../src/lib/permissions";

describe("11 権限マトリクス", () => {
  it.each([
    ["owner", true, true, true, true],
    ["admin", true, true, true, true],
    ["member", false, true, true, true],
    ["viewer", false, false, false, true],
  ] as const)(
    "%s の管理・投稿・本人編集・本人削除",
    (role, manage, post, editOwn, deleteOwn) => {
      expect(canManageAlbum(role)).toBe(manage);
      expect(canPostPhoto(role)).toBe(post);
      expect(canEditPhoto(role, "me", "me")).toBe(editOwn);
      expect(canDeletePhoto(role, "me", "me")).toBe(deleteOwn);
    },
  );

  it("メンバーと閲覧者は他人の写真を編集・削除できない", () => {
    for (const role of ["member", "viewer"] as const) {
      expect(canEditPhoto(role, "me", "other")).toBe(false);
      expect(canDeletePhoto(role, "me", "other")).toBe(false);
    }
  });
});
