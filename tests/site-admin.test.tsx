import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({
  changeSiteRole: vi.fn(),
  deleteManagedUser: vi.fn(),
  loadAdminAuditLogs: vi.fn(),
  loadManagedUsers: vi.fn(),
  reactivateManagedUser: vi.fn(),
  suspendManagedUser: vi.fn(),
}));

vi.mock("../src/lib/siteAdmin", () => admin);

import { SiteAdminPanel } from "../src/components/SiteAdminPanel";

const adminID = "a0b096e5-e9ca-4403-ba4e-202d1bb9aa55";
const memberID = "157f75c6-21cc-4ec6-9d35-00de3221ea19";

beforeEach(() => {
  admin.loadManagedUsers.mockResolvedValue({
    users: [
      {
        id: adminID,
        displayName: "管理者",
        email: "admin@example.com",
        role: "site_admin",
        createdAt: "2026-07-25T00:00:00.000Z",
        lastSignInAt: "2026-07-29T00:00:00.000Z",
        emailConfirmed: true,
        suspended: false,
        suspensionReason: null,
        suspendedUntil: null,
      },
      {
        id: memberID,
        displayName: "一般ユーザー",
        email: "member@example.com",
        role: "user",
        createdAt: "2026-07-26T00:00:00.000Z",
        lastSignInAt: null,
        emailConfirmed: true,
        suspended: false,
        suspensionReason: null,
        suspendedUntil: null,
      },
    ],
    page: 1,
    perPage: 20,
    total: 2,
  });
  admin.loadAdminAuditLogs.mockResolvedValue({
    logs: [],
    page: 1,
    perPage: 20,
    total: 0,
  });
  admin.suspendManagedUser.mockResolvedValue({ suspended: true });
});

it("自分自身を保護し、一般ユーザーは確認後に停止する", async () => {
  const user = userEvent.setup();
  render(
    <SiteAdminPanel
      context={{
        userId: adminID,
        email: "admin@example.com",
        role: "site_admin",
      }}
      onNotice={vi.fn()}
    />,
  );

  await screen.findAllByText("一般ユーザー");
  const detailButtons = screen.getAllByRole("button", { name: "詳細" });

  await user.click(detailButtons[0]);
  expect(screen.getByRole("button", { name: "権限を変更" })).toBeDisabled();

  await user.click(detailButtons[1]);
  await user.click(screen.getByRole("button", { name: "アカウント停止" }));
  await user.type(screen.getByLabelText("停止理由"), "利用規約違反");
  await user.click(screen.getByRole("button", { name: "停止する" }));

  await waitFor(() =>
    expect(admin.suspendManagedUser).toHaveBeenCalledWith(
      memberID,
      "利用規約違反",
      null,
    ),
  );
});
