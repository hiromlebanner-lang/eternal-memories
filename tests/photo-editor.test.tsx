import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const metadataMock = vi.hoisted(() => vi.fn());
const positionMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/image", () => ({ readPhotoMetadata: metadataMock }));
vi.mock("../src/lib/location", () => ({ getCurrentPosition: positionMock }));
vi.mock("leaflet", () => ({
  default: { divIcon: (options: unknown) => options },
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="location-map">{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({ setView: vi.fn(), getZoom: () => 13 }),
  useMapEvents: () => null,
}));

import { PhotoEditor } from "../src/components/PhotoEditor";

beforeEach(() => {
  metadataMock.mockResolvedValue({});
  positionMock.mockResolvedValue({ latitude: 35.68, longitude: 139.76 });
});

it("07/08 写真選択後にEXIFがなければGPSを取得してアップロード値を保存する", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn(async () => []);
  const { container } = render(
    <PhotoEditor onClose={vi.fn()} onSave={onSave} />,
  );
  const file = new File(["photo"], "tokyo.jpg", { type: "image/jpeg" });
  const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  fireEvent.change(input, { target: { files: [file] } });

  await screen.findByText("35.68000, 139.76000");
  await user.type(screen.getByLabelText("コメント"), "東京駅");
  await user.click(screen.getByRole("button", { name: /アルバムに追加/ }));

  expect(metadataMock).toHaveBeenCalledWith(file);
  expect(positionMock).toHaveBeenCalled();
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      files: [file],
      caption: "東京駅",
      latitude: 35.68,
      longitude: 139.76,
      category: "scenery",
    }),
    expect.any(Function),
  );
});

it("写真を選び直したとき、古い非同期EXIF結果で位置を上書きしない", async () => {
  let resolveFirst: ((value: unknown) => void) | undefined;
  metadataMock.mockImplementation((file: File) => {
    if (file.name === "first.jpg") {
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    }
    return Promise.resolve({
      latitude: 43.06,
      longitude: 141.35,
      capturedAt: new Date("2026-07-02T10:00:00.000Z"),
    });
  });
  const { container } = render(
    <PhotoEditor onClose={vi.fn()} onSave={vi.fn(async () => [])} />,
  );
  const input = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
  fireEvent.change(input, {
    target: { files: [new File(["1"], "first.jpg", { type: "image/jpeg" })] },
  });
  fireEvent.change(input, {
    target: { files: [new File(["2"], "second.jpg", { type: "image/jpeg" })] },
  });

  await screen.findByText("43.06000, 141.35000");
  resolveFirst?.({ latitude: 26.21, longitude: 127.68 });
  await waitFor(() =>
    expect(screen.getByText("43.06000, 141.35000")).toBeInTheDocument(),
  );
  expect(screen.queryByText("26.21000, 127.68000")).not.toBeInTheDocument();
});

it.each([1, 3, 10, 20])(
  "%i枚の写真をまとめて投稿値へ渡す",
  async (count) => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => []);
    const { container } = render(
      <PhotoEditor onClose={vi.fn()} onSave={onSave} />,
    );
    const input =
      container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
    const files = Array.from(
      { length: count },
      (_, index) =>
        new File([`photo-${index}`], `photo-${index}.jpg`, {
          type: "image/jpeg",
        }),
    );
    fireEvent.change(input, { target: { files } });

    await screen.findByText(`${count}枚選択中`);
    await screen.findByText("35.68000, 139.76000");
    await user.click(screen.getByRole("button", { name: /アルバムに追加/ }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ files }),
      expect.any(Function),
    );
  },
);
