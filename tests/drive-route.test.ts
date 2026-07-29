import { describe, expect, it } from "vitest";
import type { DriveRoutePoint } from "../src/types";
import {
  calculateDriveDistance,
  shouldStoreDrivePoint,
} from "../src/lib/driveRoute";

function point(
  latitude: number,
  longitude: number,
  seconds: number,
  sequence: number,
): DriveRoutePoint {
  return {
    latitude,
    longitude,
    recorded_at: new Date(Date.UTC(2026, 6, 28, 0, 0, seconds)).toISOString(),
    accuracy: 8,
    speed: null,
    heading: null,
    altitude: null,
    sequence_no: sequence,
  };
}

describe("走行ルート", () => {
  it("移動距離または経過時間を満たした地点だけ保存する", () => {
    const start = point(35.6812, 139.7671, 0, 0);
    expect(shouldStoreDrivePoint(start, point(35.68121, 139.7671, 5, 1))).toBe(
      false,
    );
    expect(shouldStoreDrivePoint(start, point(35.6814, 139.7671, 8, 1))).toBe(
      true,
    );
    expect(shouldStoreDrivePoint(start, point(35.68121, 139.7671, 12, 1))).toBe(
      true,
    );
  });

  it("通常の走行距離を計算し、極端な位置ジャンプを除外する", () => {
    const route = [
      point(35.6812, 139.7671, 0, 0),
      point(35.6821, 139.7671, 10, 1),
      point(36.6812, 140.7671, 11, 2),
    ];
    expect(calculateDriveDistance(route)).toBeGreaterThan(90);
    expect(calculateDriveDistance(route)).toBeLessThan(110);
  });
});
