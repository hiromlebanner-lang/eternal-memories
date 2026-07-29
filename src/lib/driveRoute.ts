import type { DriveRoutePoint } from "../types";
import { distanceInMeters } from "./location";

export const DRIVE_MIN_DISTANCE_METERS = 15;
export const DRIVE_MAX_INTERVAL_MS = 12_000;
export const DRIVE_MAX_SPEED_METERS_PER_SECOND = 75;

export function shouldStoreDrivePoint(
  previous: DriveRoutePoint,
  next: DriveRoutePoint,
) {
  const distance = distanceInMeters(previous, next);
  const elapsed =
    new Date(next.recorded_at).getTime() -
    new Date(previous.recorded_at).getTime();
  if (
    elapsed <= 0 ||
    distance / (elapsed / 1000) > DRIVE_MAX_SPEED_METERS_PER_SECOND
  ) {
    return false;
  }
  return distance >= DRIVE_MIN_DISTANCE_METERS || elapsed >= DRIVE_MAX_INTERVAL_MS;
}

export function calculateDriveDistance(points: DriveRoutePoint[]) {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index];
    const elapsed =
      (new Date(point.recorded_at).getTime() -
        new Date(previous.recorded_at).getTime()) /
      1000;
    const distance = distanceInMeters(previous, point);
    if (
      elapsed <= 0 ||
      distance / elapsed > DRIVE_MAX_SPEED_METERS_PER_SECOND
    ) {
      return total;
    }
    return total + distance;
  }, 0);
}
