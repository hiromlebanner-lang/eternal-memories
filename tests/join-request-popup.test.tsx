import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { JoinRequestPopup } from "../src/components/JoinRequestPopup";
import type { AlbumJoinRequest } from "../src/types";

const request: AlbumJoinRequest = {
  id: "request-1",
  album_id: "album-1",
  album_name: "北海道旅行",
  user_id: "applicant-1",
  requested_role: "member",
  status: "pending",
  created_at: "2026-07-25T01:00:00.000Z",
  display_name: "はなこ",
  email: "hana@example.com",
};

it("新規申請の申請者名とアルバム名を表示し管理画面へ進む", async () => {
  const user = userEvent.setup();
  const onView = vi.fn();
  render(
    <JoinRequestPopup
      requests={[request]}
      onView={onView}
      onLater={vi.fn()}
    />,
  );

  expect(
    screen.getByText(
      "はなこさんから「北海道旅行」への参加申請が届きました",
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "申請を見る" }));
  expect(onView).toHaveBeenCalledOnce();
});

it("複数申請は合計件数を表示し、あとで閉じられる", async () => {
  const user = userEvent.setup();
  const onLater = vi.fn();
  render(
    <JoinRequestPopup
      requests={[
        request,
        { ...request, id: "request-2", user_id: "applicant-2" },
      ]}
      onView={vi.fn()}
      onLater={onLater}
    />,
  );

  expect(screen.getByText("参加申請が2件届いています")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "あとで" }));
  expect(onLater).toHaveBeenCalledOnce();
});
