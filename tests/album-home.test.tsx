import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AlbumHome } from "../src/components/AlbumHome";
import { album, photo } from "./fixtures";

it("アルバムを検索し、お気に入りとオフライン保存を操作できる", async () => {
  const user = userEvent.setup();
  const favorite = vi.fn(async () => undefined);
  const offline = vi.fn(async () => undefined);
  const first = {
    ...album("owner"),
    owner_name: "のぐお",
    tags: ["家族"],
    updated_at: "2026-07-29T01:00:00Z",
    unread_count: 3,
  };
  const second = {
    ...album("member"),
    id: "33333333-3333-4333-8333-333333333333",
    name: "仕事の記録",
    owner_name: "たろう",
    tags: ["仕事"],
  };

  render(
    <AlbumHome
      userID="user-1"
      albums={[first, second]}
      recentPhotos={[photo()]}
      loading={false}
      onOpen={vi.fn()}
      onOpenPhoto={vi.fn()}
      onOpenMap={vi.fn()}
      onCreate={vi.fn()}
      onToggleFavorite={favorite}
      onToggleOffline={offline}
    />,
  );

  expect(screen.getByRole("heading", { name: "専用アルバム" })).toBeVisible();
  await user.type(
    screen.getByPlaceholderText("アルバム・人・タグ・説明を検索"),
    "家族",
  );
  expect(screen.getByText("北海道旅行")).toBeVisible();
  expect(screen.queryByText("仕事の記録")).not.toBeInTheDocument();

  await user.click(screen.getByLabelText("お気に入りに追加"));
  expect(favorite).toHaveBeenCalledWith(first);
  await user.click(screen.getByLabelText("オフライン保存"));
  expect(offline).toHaveBeenCalledWith(first);

  expect(screen.queryByText(/フォルダ/)).not.toBeInTheDocument();
  await user.click(screen.getByLabelText("コンパクト一覧表示"));
  expect(screen.getByLabelText("コンパクト一覧表示")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
