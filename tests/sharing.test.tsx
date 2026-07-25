import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { album } from "./fixtures";

const invitationMock = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/data", () => ({
  createEmailInvitation: invitationMock,
}));
vi.mock("../src/components/InviteQRCode", () => ({
  InviteQRCode: ({ value }: { value: string }) => (
    <div data-testid="qr-code">{value}</div>
  ),
}));

import { ShareAlbumModal } from "../src/components/ShareAlbumModal";
import { buildInviteURL } from "../src/lib/sharing";

beforeEach(() => {
  window.history.replaceState({}, "", "/apps/mapalbum/?old=1#section");
  invitationMock.mockResolvedValue({
    invitation: { token: "invite-token" },
    emailSent: false,
  });
});

it("10 招待URLとQRをサブパスを保って発行する", () => {
  render(
    <ShareAlbumModal
      album={album("owner")}
      onClose={vi.fn()}
      onManageMembers={vi.fn()}
      onNotice={vi.fn()}
    />,
  );
  const expected = `${window.location.origin}/apps/mapalbum/?join=ABCD1234`;
  expect(screen.getByDisplayValue(expected)).toBeInTheDocument();
  expect(screen.getByTestId("qr-code")).toHaveTextContent(expected);
});

it("メール招待の専用URLを発行する", async () => {
  const user = userEvent.setup();
  render(
    <ShareAlbumModal
      album={album("admin")}
      onClose={vi.fn()}
      onManageMembers={vi.fn()}
      onNotice={vi.fn()}
    />,
  );
  await user.type(
    screen.getByLabelText("招待するメールアドレス"),
    "friend@example.com",
  );
  await user.click(screen.getByRole("button", { name: /招待メールを送る/ }));
  expect(invitationMock).toHaveBeenCalledWith({
    albumID: album().id,
    email: "friend@example.com",
    role: "member",
  });
  expect(screen.getByRole("button", { name: "専用URLをコピー" })).toBeInTheDocument();
  expect(
    buildInviteURL("invite", "invite-token"),
  ).toBe(
    `${window.location.origin}/apps/mapalbum/?invite=invite-token`,
  );
});

it("メンバーには招待発行UIを表示しない", () => {
  render(
    <ShareAlbumModal
      album={album("member")}
      onClose={vi.fn()}
      onManageMembers={vi.fn()}
      onNotice={vi.fn()}
    />,
  );
  expect(screen.queryByText("招待URL")).not.toBeInTheDocument();
  expect(
    screen.getByText(/招待はオーナー・管理者のみ/),
  ).toBeInTheDocument();
});
