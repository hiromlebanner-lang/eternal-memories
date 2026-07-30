import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhotoDetail } from "../src/components/PhotoDetail";
import {
  photoFileName,
  savePhotoToDevice,
} from "../src/lib/photoSave";
import { photo } from "./fixtures";

describe("写真アプリへの保存", () => {
  it("対応端末では画像ファイルを共有画面へ渡す", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: vi.fn(() => true),
    });
    const file = new File(["photo"], "Eternal-memories.jpg", {
      type: "image/jpeg",
    });

    await expect(savePhotoToDevice(file)).resolves.toEqual({
      status: "shared",
    });
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: [file] }),
    );
  });

  it("非対応端末では自動ダウンロードせず長押し保存へ切り替える", async () => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: vi.fn(() => false),
    });
    const file = new File(["photo"], "Eternal-memories.jpg", {
      type: "image/jpeg",
    });

    await expect(savePhotoToDevice(file)).resolves.toEqual({
      status: "manual",
      file,
    });
  });

  it("写真詳細に保存名称と長押し案内を表示する", async () => {
    const user = userEvent.setup();
    const target = photo();
    const file = new File(["photo"], "Eternal-memories.jpg", {
      type: "image/jpeg",
    });
    const onDownload = vi.fn(async () => ({
      status: "manual" as const,
      file,
    }));
    render(
      <PhotoDetail
        photos={[target]}
        canEdit={() => false}
        canDelete={() => false}
        canDownload
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn(async () => undefined)}
        onDownload={onDownload}
      />,
    );

    expect(screen.queryByText("ダウンロード")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "写真アプリに保存" }),
    );
    expect(onDownload).toHaveBeenCalledWith(target, expect.any(Function));
    expect(
      await screen.findByText(
        "画像を長押しして「写真に保存」を選択してください。",
      ),
    ).toBeVisible();
  });

  it("撮影日時から日本時間の安全なファイル名を作成する", () => {
    expect(
      photoFileName("2026-07-31T03:34:56.000Z", "image/jpeg"),
    ).toBe("Eternal-memories_2026-07-31_123456.jpg");
  });
});
