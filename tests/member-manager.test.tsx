import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { AlbumMember } from "../src/types";
import { album } from "./fixtures";

const data = vi.hoisted(() => ({
  changeMemberRole: vi.fn(),
  loadMembers: vi.fn(),
  removeAlbumMember: vi.fn(),
}));

vi.mock("../src/lib/data", () => data);

import { MemberManager } from "../src/components/MemberManager";

const currentUser = {
  id: "owner-1",
  email: "owner@example.com",
  displayName: "オーナー",
};

const members: AlbumMember[] = [
  {
    album_id: album().id,
    user_id: "owner-1",
    role: "owner",
    joined_at: "2026-07-25T00:00:00.000Z",
    display_name: "オーナー",
    email: "owner@example.com",
  },
  {
    album_id: album().id,
    user_id: "member-1",
    role: "member",
    joined_at: "2026-07-26T00:00:00.000Z",
    display_name: "はなこ",
    email: "hana@example.com",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  data.loadMembers.mockResolvedValue(members);
  data.removeAlbumMember.mockResolvedValue(undefined);
});

it("オーナーは確認後に対象メンバーだけを退出させる", async () => {
  const user = userEvent.setup();
  const onChanged = vi.fn();

  render(
    <MemberManager
      album={album("owner")}
      currentUser={currentUser}
      onClose={vi.fn()}
      onChanged={onChanged}
    />,
  );

  expect(await screen.findByText("はなこ")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "退出" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "退出" }));
  expect(
    screen.getByRole("dialog", {
      name: "この参加者をアルバムから退出させますか？",
    }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "退出させる" }));
  await waitFor(() =>
    expect(data.removeAlbumMember).toHaveBeenCalledWith(
      album().id,
      "member-1",
    ),
  );
  expect(data.removeAlbumMember).toHaveBeenCalledOnce();
  expect(onChanged).toHaveBeenCalledOnce();
  expect(screen.queryByText("はなこ")).not.toBeInTheDocument();
});

it("管理者には退出操作を表示しない", async () => {
  render(
    <MemberManager
      album={album("admin")}
      currentUser={{ ...currentUser, id: "admin-1" }}
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText("はなこ")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "退出" })).not.toBeInTheDocument();
});
