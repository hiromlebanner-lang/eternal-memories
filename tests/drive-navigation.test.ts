import { afterEach, describe, expect, it, vi } from "vitest";
import {
  distanceToPlannedRoute,
  fetchDrivingRoute,
  remainingDistanceMeters,
  searchDriveDestinations,
  shouldAutomaticallyReroute,
} from "../src/lib/driveNavigation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("無料簡易ナビ", () => {
  it("同じ目的地検索結果をキャッシュして外部リクエストを増やさない", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 1,
          display_name: "横浜赤レンガ倉庫, 神奈川県横浜市",
          name: "横浜赤レンガ倉庫",
          lat: "35.4523",
          lon: "139.6425",
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await searchDriveDestinations("横浜赤レンガ倉庫", null);
    const second = await searchDriveDestinations("横浜赤レンガ倉庫", null);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("OSRMの予定ルートを緯度経度へ変換する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: "Ok",
          routes: [
            {
              distance: 4200,
              duration: 600,
              geometry: {
                type: "LineString",
                coordinates: [
                  [139.7, 35.6],
                  [139.8, 35.7],
                ],
              },
            },
          ],
        }),
      }),
    );

    const route = await fetchDrivingRoute(
      { latitude: 35.6, longitude: 139.7 },
      { latitude: 35.7, longitude: 139.8 },
    );
    expect(route.distanceMeters).toBe(4200);
    expect(route.coordinates[1]).toEqual({
      latitude: 35.7,
      longitude: 139.8,
    });
  });

  it("連続して200m以上外れ、45秒経過した場合だけ再検索する", () => {
    expect(
      shouldAutomaticallyReroute({
        distanceFromRouteMeters: 240,
        consecutiveOffRoutePositions: 3,
        millisecondsSinceLastRoute: 45_000,
        rerouteCount: 1,
      }),
    ).toBe(true);
    expect(
      shouldAutomaticallyReroute({
        distanceFromRouteMeters: 240,
        consecutiveOffRoutePositions: 2,
        millisecondsSinceLastRoute: 60_000,
        rerouteCount: 1,
      }),
    ).toBe(false);
  });

  it("現在地から目的地・予定ルートまでの距離を計算する", () => {
    const current = { latitude: 35.6812, longitude: 139.7671 };
    const destination = { latitude: 35.6895, longitude: 139.6917 };
    expect(remainingDistanceMeters(current, destination)).toBeGreaterThan(6000);
    expect(
      distanceToPlannedRoute(current, [current, destination]),
    ).toBeLessThan(1);
  });
});
