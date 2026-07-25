import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { AlbumJoinRequest } from "../src/types";
import { album } from "./fixtures";

const data = vi.hoisted(() => ({
  changeMemberRole: vi.fn(),
  loadJoinRequests: vi.fn(),
  loadMembers: vi.fn(),
  reviewJoinRequest: vi.fn(),
}));

vi.mock("../src/lib/data", () => data);

import { MemberManager } from "../src/components/MemberManager";

const request: AlbumJoinRequest = {
  id: "request-1",
  album_id: album().id,
  user_id: "applicant-1",
  requested_role: "viewer",
  status: "pending",
  created_at: "2026-07-25T01:30:00.000Z",
  display_name: "はなこ",
  email: "hana@example.com",
};

const currentUser = {
  id: "owner-1",
  email: "owner@example.com",
  displayName: "オーナー",
};

beforeEach(() => {
  data.loadMembers.mockResolvedValue([]);
  data.loadJoinRequests.mockResolvedValue([]);
  data.reviewJoinRequest.mockResolvedValue("request-1");
});

it("申請詳細・希望権限を表示し選択した権限で一度だけ承認する", async () => {
  const user = userEvent.setup();
  const onChanged = vi.fn();
  data.loadJoinRequests
    .mockResolvedValueOnce([request])
    .mockResolvedValueOnce([]);

  render(
    <MemberManager
      album={album("owner")}
      currentUser={currentUser}
      onClose={vi.fn()}
      onChanged={onChanged}
    />,
  );

  expect(await screen.findByText("はなこ")).toBeInTheDocument();
  expect(screen.getByText("hana@example.com")).toBeInTheDocument();
  expect(screen.getByText(/申請日時：/)).toBeInTheDocument();
  expect(screen.getByText("希望する権限：閲覧のみ")).toBeInTheDocument();

  await user.selectOptions(
    screen.getByLabelText("はなこの承認後の権限"),
    "admin",
  );
  await user.click(
    screen.getByRole("button", { name: "はなこの参加申請を承認" }),
  );

  await waitFor(() =>
    expect(data.reviewJoinRequest).toHaveBeenCalledWith(
      "request-1",
      true,
      "admin",
    ),
  );
  expect(data.reviewJoinRequest).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(
      screen.getByText("現在、参加申請はありません"),
    ).toBeInTheDocument(),
  );
  expect(onChanged).toHaveBeenCalledOnce();
});

it("拒否後は未処理一覧から即時に消す", async () => {
  const user = userEvent.setup();
  data.loadJoinRequests
    .mockResolvedValueOnce([request])
    .mockResolvedValueOnce([]);
  render(
    <MemberManager
      album={album("admin")}
      currentUser={currentUser}
      onClose={vi.fn()}
    />,
  );

  await user.click(
    await screen.findByRole("button", {
      name: "はなこの参加申請を拒否",
    }),
  );
  expect(data.reviewJoinRequest).toHaveBeenCalledWith(
    "request-1",
    false,
    "viewer",
  );
  expect(
    await screen.findByText("現在、参加申請はありません"),
  ).toBeInTheDocument();
});
