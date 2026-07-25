import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { photo } from "./fixtures";

vi.mock("leaflet", () => ({
  default: {
    divIcon: (options: unknown) => options,
    latLngBounds: (points: unknown) => points,
  },
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  ZoomControl: () => null,
  Marker: ({
    icon,
    eventHandlers,
  }: {
    icon: { html: string };
    eventHandlers: { click: () => void };
  }) => (
    <button
      type="button"
      aria-label="map-marker"
      data-icon-html={icon.html}
      onClick={eventHandlers.click}
    />
  ),
  useMap: () => ({
    invalidateSize: vi.fn(),
    setView: vi.fn(),
    fitBounds: vi.fn(),
  }),
}));

import { MapPanel } from "../src/components/MapPanel";

it("09 地図に丸い写真アイコンと同一地点の枚数を表示し、タップで開く", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const first = photo();
  const second = photo({
    id: "photo-2",
    latitude: 35.6813,
    longitude: 139.7671,
  });
  render(<MapPanel photos={[first, second]} onSelect={onSelect} />);

  expect(screen.getByTestId("map-container")).toBeInTheDocument();
  expect(screen.getByText("1か所・2枚")).toBeInTheDocument();
  const marker = screen.getByRole("button", { name: "map-marker" });
  expect(marker.dataset.iconHtml).toContain("map-photo-marker");
  expect(marker.dataset.iconHtml).toContain("map-photo-marker__count");
  expect(marker.dataset.iconHtml).toContain(">2<");
  await user.click(marker);
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ photos: expect.arrayContaining([first, second]) }),
  );
});
