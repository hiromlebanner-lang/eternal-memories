import { describe, expect, it, vi } from "vitest";
import {
  distanceInMeters,
  getCurrentPosition,
  groupPhotosByLocation,
} from "../src/lib/location";
import { photo } from "./fixtures";

describe("位置情報と同一地点", () => {
  it("08 GPS座標を取得し、高精度オプションを使う", async () => {
    const getCurrentPositionMock = vi.fn(
      (...args: Parameters<Geolocation["getCurrentPosition"]>) => {
        const [success] = args;
        success({
          coords: { latitude: 35.68, longitude: 139.76 },
        } as GeolocationPosition);
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: getCurrentPositionMock },
    });

    await expect(getCurrentPosition()).resolves.toEqual({
      latitude: 35.68,
      longitude: 139.76,
    });
    expect(getCurrentPositionMock.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 30_000,
    });
  });

  it("GPS非対応端末では明確に失敗する", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
    await expect(getCurrentPosition()).rejects.toThrow("位置情報");
  });

  it("10 60m以内をまとめ、離れた地点は分ける", () => {
    const near = photo({
      id: "near",
      latitude: 35.68155,
      longitude: 139.767125,
    });
    const far = photo({
      id: "far",
      latitude: 35.69,
      longitude: 139.78,
    });
    const groups = groupPhotosByLocation([photo(), near, far], 60);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.photos.length).sort()).toEqual([1, 2]);
  });

  it("鎖状のA-B-CでA-Cが閾値外なら巨大クラスタにしない", () => {
    const oneDegreeLatitudeMeters = distanceInMeters(
      { latitude: 35, longitude: 139 },
      { latitude: 36, longitude: 139 },
    );
    const delta = 45 / oneDegreeLatitudeMeters;
    const photos = [
      photo({ id: "a", latitude: 35, longitude: 139 }),
      photo({ id: "b", latitude: 35 + delta, longitude: 139 }),
      photo({ id: "c", latitude: 35 + delta * 2, longitude: 139 }),
    ];
    expect(groupPhotosByLocation(photos, 60)).toHaveLength(2);
  });
});
