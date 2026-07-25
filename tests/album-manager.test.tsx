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
      onClose={onClose}
      onSelect={vi.fn()}
      onCreate={onCreate}
      onJoin={vi.fn(async () => {})}
    />,
  );

  await user.click(screen.getByRole("button", { name: /新しいアルバム/ }));
  await user.type(screen.getByLabelText("アルバム名"), "  北海道旅行  ");
  await user.type(screen.getByLabelText("説明"), "  夏の思い出  ");
  await user.click(screen.getByRole("button", { name: /アルバムを作成/ }));

  expect(onCreate).toHaveBeenCalledWith("北海道旅行", "夏の思い出");
  expect(onClose).toHaveBeenCalled();
});
