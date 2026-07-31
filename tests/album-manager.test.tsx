import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AlbumManager } from "../src/components/AlbumManager";

it("06 アルバムを作成して入力値を渡す", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <AlbumManager
      albums={[]}
      currentUserID="user-1"
      onClose={onClose}
      onSelect={vi.fn()}
      onCreate={onCreate}
      onJoin={vi.fn(async () => {})}
      onDelete={vi.fn(async () => {})}
    />,
  );

  await user.click(screen.getByRole("button", { name: /新しいアルバム/ }));
  expect(
    screen.getByRole("button", { name: /標準（Eternal memories）/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await user.type(screen.getByLabelText("アルバム名"), "  北海道旅行  ");
  await user.type(screen.getByLabelText("説明"), "  夏の思い出  ");
  await user.click(screen.getByRole("button", { name: /アルバムを作成/ }));

  expect(onCreate).toHaveBeenCalledWith(
    "北海道旅行",
    "夏の思い出",
    "standard",
  );
  expect(onClose).toHaveBeenCalled();
});

it("選択したテーマテンプレートをアルバム作成へ渡す", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn(async () => {});
  render(
    <AlbumManager
      albums={[]}
      currentUserID="user-1"
      onClose={vi.fn()}
      onSelect={vi.fn()}
      onCreate={onCreate}
      onJoin={vi.fn(async () => {})}
      onDelete={vi.fn(async () => {})}
    />,
  );

  await user.click(screen.getByRole("button", { name: /新しいアルバム/ }));
  await user.click(screen.getByRole("button", { name: /^DIY/ }));
  await user.type(screen.getByLabelText("アルバム名"), "作品集");
  await user.click(screen.getByRole("button", { name: /アルバムを作成/ }));

  expect(onCreate).toHaveBeenCalledWith("作品集", "", "diy");
});

it("Supabaseの構造化エラーを省略せず表示する", async () => {
  const user = userEvent.setup();
  const onCreate = vi.fn(async () => {
    throw {
      message: "new row violates row-level security policy",
      code: "42501",
      details: "Failing row contains an invalid owner",
      hint: "Check auth.uid() and created_by",
    };
  });

  render(
    <AlbumManager
      albums={[]}
      currentUserID="user-1"
      onClose={vi.fn()}
      onSelect={vi.fn()}
      onCreate={onCreate}
      onJoin={vi.fn(async () => {})}
      onDelete={vi.fn(async () => {})}
    />,
  );

  await user.click(screen.getByRole("button", { name: /新しいアルバム/ }));
  await user.type(screen.getByLabelText("アルバム名"), "診断用アルバム");
  await user.click(screen.getByRole("button", { name: /アルバムを作成/ }));

  expect(
    await screen.findByText(/new row violates row-level security policy/),
  ).toHaveTextContent("code: 42501");
  expect(screen.getByText(/new row violates/)).toHaveTextContent(
    "details: Failing row contains an invalid owner",
  );
  expect(screen.getByText(/new row violates/)).toHaveTextContent(
    "hint: Check auth.uid() and created_by",
  );
});
