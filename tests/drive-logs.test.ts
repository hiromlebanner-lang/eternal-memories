import { describe, expect, it } from "vitest";
import { summarizeDriveLogs } from "../src/lib/driveLogs";
import type { DriveLog } from "../src/types";

function driveLog(
  id: string,
  startedAt: string,
  distanceMeters: number,
): DriveLog {
  return {
    id,
    user_id: "user-1",
    title: id,
    started_at: startedAt,
    ended_at: startedAt,
    start_latitude: 35,
    start_longitude: 139,
    end_latitude: 35,
    end_longitude: 139,
    start_label: "",
    end_label: "",
    distance_meters: distanceMeters,
    actual_distance_meters: distanceMeters,
    duration_seconds: 0,
    destination_name: null,
    destination_address: null,
    destination_latitude: null,
    destination_longitude: null,
    planned_distance_meters: null,
    planned_duration_seconds: null,
    planned_route: null,
    created_at: startedAt,
  };
}

describe("走行距離集計", () => {
  it("日本時間・月曜始まりで集計し、同じ記録を重複加算しない", () => {
    const today = driveLog("today", "2026-07-29T01:00:00+09:00", 1_000);
    const logs = [
      today,
      today,
      driveLog("week", "2026-07-27T08:00:00+09:00", 2_000),
      driveLog("month", "2026-07-01T08:00:00+09:00", 3_000),
      driveLog("previous", "2026-06-30T23:00:00+09:00", 4_000),
    ];

    expect(
      summarizeDriveLogs(logs, new Date("2026-07-29T12:00:00+09:00")),
    ).toEqual({
      todayMeters: 1_000,
      weekMeters: 3_000,
      monthMeters: 6_000,
      totalMeters: 10_000,
      weekStart: "2026-07-27",
      weekEnd: "2026-08-02",
    });
  });
});
