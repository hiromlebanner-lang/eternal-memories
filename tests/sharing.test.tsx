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

it("Web Share APIでiPhoneの標準共有シートを開き成功を通知する", async () => {
  const user = userEvent.setup();
  const share = vi.fn().mockResolvedValue(undefined);
  const onNotice = vi.fn();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });

  render(
    <ShareAlbumModal
      album={album("owner")}
      onClose={vi.fn()}
      onManageMembers={vi.fn()}
      onNotice={onNotice}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "招待URLを共有" }),
  );

  expect(share).toHaveBeenCalledWith({
    title: `${album().name}への招待`,
    text: expect.stringContaining("参加にはオーナーまたは管理者の承認"),
    url: `${window.location.origin}/apps/mapalbum/?join=ABCD1234`,
  });
  expect(onNotice).toHaveBeenCalledWith("招待URLを共有しました");
});

it("標準共有シートのキャンセルではエラーを表示しない", async () => {
  const user = userEvent.setup();
  const onNotice = vi.fn();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: vi.fn().mockRejectedValue({ name: "AbortError" }),
  });

  render(
    <ShareAlbumModal
      album={album("owner")}
      onClose={vi.fn()}
      onManageMembers={vi.fn()}
      onNotice={onNotice}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "招待URLを共有" }),
  );

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(onNotice).not.toHaveBeenCalled();
});

it("Web Share APIがない端末では招待URLだけをコピーする", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  const onNotice = vi.fn();
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });

  render(
    <ShareAlbumModal
      album={album("owner")}
      onClose={vi.fn()}
      onManageMembers={vi.fn()}
      onNotice={onNotice}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "招待URLを共有" }),
  );

  expect(writeText).toHaveBeenCalledWith(
    `${window.location.origin}/apps/mapalbum/?join=ABCD1234`,
  );
  expect(onNotice).toHaveBeenCalledWith("招待URLをコピーしました");
});
