import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { PhotoGrid } from "../src/components/PhotoGrid";
import { photo } from "./fixtures";

it("写真一覧に投稿内容を表示し、選択した写真を開く", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const first = photo();
  const second = photo({
    id: "33333333-3333-4333-8333-333333333333",
    caption: "家族でランチ",
    category: "food",
    author_name: "たろう",
  });

  render(<PhotoGrid photos={[first, second]} onSelect={onSelect} />);

  const firstCard = screen.getByRole("button", { name: /きれいな景色/ });
  const secondCard = screen.getByRole("button", { name: /家族でランチ/ });
  expect(firstCard).toHaveTextContent("はなこ");
  expect(secondCard).toHaveTextContent("たろう");

  await user.click(secondCard);
  expect(onSelect).toHaveBeenCalledWith(second);
});
