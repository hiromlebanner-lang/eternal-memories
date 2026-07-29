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
  Circle: () => <div data-testid="accuracy-circle" />,
  Marker: ({
    icon,
    eventHandlers,
  }: {
    icon: { html: string };
    eventHandlers?: { click: () => void };
  }) =>
    eventHandlers ? (
      <button
        type="button"
        aria-label="map-marker"
        data-icon-html={icon.html}
        onClick={eventHandlers.click}
      />
    ) : (
      <div data-testid="current-location-marker" />
    ),
  useMap: () => ({
    invalidateSize: vi.fn(),
    setView: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 35.68, lng: 139.76 })),
    getZoom: vi.fn(() => 16),
    fitBounds: vi.fn(),
  }),
  useMapEvents: () => undefined,
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
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 35.6812,
            longitude: 139.7671,
            accuracy: 25,
          },
        }),
      ),
    },
  });
  render(
    <MapPanel userID="user-1" photos={[first, second]} onSelect={onSelect} />,
  );

  expect(screen.getByTestId("map-container")).toBeInTheDocument();
  expect(screen.getByTestId("accuracy-circle")).toBeInTheDocument();
  expect(screen.getByText("現在地へ戻る")).toBeInTheDocument();
  expect(screen.getByLabelText("地図ライセンス")).toHaveTextContent(
    "© OpenStreetMap contributors | Leaflet",
  );
  expect(screen.getByRole("link", { name: "Leaflet" })).toHaveAttribute(
    "href",
    "https://leafletjs.com",
  );
  expect(
    screen.getByRole("link", { name: "OpenStreetMap contributors" }),
  ).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright",
  );
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
