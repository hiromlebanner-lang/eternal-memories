import type {
  AlbumPhoto,
  DriveDistanceSummary,
  DriveLog,
  DriveRoutePoint,
} from "../types";
import { toAppError } from "./errors";
import { supabase } from "./supabase";

function requireSupabase() {
  if (!supabase) throw new Error("Supabaseが設定されていません。");
  return supabase;
}

function japanDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function summarizeDriveLogs(
  logs: DriveLog[],
  now = new Date(),
): DriveDistanceSummary {
  const today = japanDateKey(now);
  const [year, month, day] = today.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekStart = shiftDateKey(today, -((dayOfWeek + 6) % 7));
  const weekEnd = shiftDateKey(weekStart, 6);
  const monthPrefix = today.slice(0, 7);
  const uniqueLogs = [...new Map(logs.map((log) => [log.id, log])).values()];

  return uniqueLogs.reduce<DriveDistanceSummary>(
    (summary, log) => {
      const startedDate = japanDateKey(new Date(log.started_at));
      const distance =
        Number(log.actual_distance_meters ?? log.distance_meters) || 0;
      summary.totalMeters += distance;
      if (startedDate === today) summary.todayMeters += distance;
      if (startedDate >= weekStart && startedDate <= weekEnd) {
        summary.weekMeters += distance;
      }
      if (startedDate.startsWith(monthPrefix)) {
        summary.monthMeters += distance;
      }
      return summary;
    },
    {
      todayMeters: 0,
      weekMeters: 0,
      monthMeters: 0,
      totalMeters: 0,
      weekStart,
      weekEnd,
    },
  );
}

export async function loadDriveLogs(userID: string): Promise<DriveLog[]> {
  const { data, error } = await requireSupabase()
    .from("drive_logs")
    .select("*")
    .eq("user_id", userID)
    .order("started_at", { ascending: false });
  if (error) throw toAppError(error, "走行記録を読み込めませんでした。");
  return (data ?? []) as DriveLog[];
}

export async function loadDriveRoutePoints(
  driveLogID: string,
): Promise<DriveRoutePoint[]> {
  const { data, error } = await requireSupabase()
    .from("drive_route_points")
    .select(
      "latitude, longitude, recorded_at, accuracy, speed, heading, altitude, sequence_no",
    )
    .eq("drive_log_id", driveLogID)
    .order("sequence_no", { ascending: true });
  if (error) throw toAppError(error, "走行ルートを読み込めませんでした。");
  return (data ?? []).map((point) => ({
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    recorded_at: point.recorded_at,
    accuracy: Number(point.accuracy),
    speed: point.speed == null ? null : Number(point.speed),
    heading: point.heading == null ? null : Number(point.heading),
    altitude: point.altitude == null ? null : Number(point.altitude),
    sequence_no: Number(point.sequence_no),
  }));
}

export async function loadDrivePhotos(
  userID: string,
  startedAt: string,
  endedAt: string,
): Promise<AlbumPhoto[]> {
  const { data, error } = await requireSupabase()
    .from("photos")
    .select(
      "id, album_id, author_id, storage_path, title, caption, category, captured_at, created_at, latitude, longitude, visibility",
    )
    .eq("author_id", userID)
    .gte("captured_at", startedAt)
    .lte("captured_at", endedAt)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("captured_at", { ascending: true });
  if (error) throw toAppError(error, "走行中の写真を読み込めませんでした。");

  return (data ?? []).map((photo) => ({
    ...photo,
    author_name: "",
    author_avatar_url: null,
    image_url: "",
    latitude: photo.latitude == null ? null : Number(photo.latitude),
    longitude: photo.longitude == null ? null : Number(photo.longitude),
  })) as AlbumPhoto[];
}

export async function saveDriveLog(
  log: Omit<DriveLog, "created_at">,
  points: DriveRoutePoint[],
) {
  const client = requireSupabase();
  const { error: logError } = await client.from("drive_logs").insert({
    id: log.id,
    user_id: log.user_id,
    title: log.title,
    started_at: log.started_at,
    ended_at: log.ended_at,
    start_latitude: log.start_latitude,
    start_longitude: log.start_longitude,
    end_latitude: log.end_latitude,
    end_longitude: log.end_longitude,
    start_label: log.start_label,
    end_label: log.end_label,
    distance_meters: Math.round(log.distance_meters),
    actual_distance_meters: Math.round(
      log.actual_distance_meters ?? log.distance_meters,
    ),
    duration_seconds: Math.round(log.duration_seconds),
    actual_duration_seconds: Math.round(
      log.actual_duration_seconds ?? log.duration_seconds,
    ),
    destination_name: log.destination_name,
    destination_address: log.destination_address,
    destination_latitude: log.destination_latitude,
    destination_longitude: log.destination_longitude,
    planned_distance_meters:
      log.planned_distance_meters == null
        ? null
        : Math.round(log.planned_distance_meters),
    planned_duration_seconds:
      log.planned_duration_seconds == null
        ? null
        : Math.round(log.planned_duration_seconds),
    planned_route: log.planned_route,
  });
  if (logError) {
    throw toAppError(logError, "走行記録を保存できませんでした。");
  }

  try {
    for (let index = 0; index < points.length; index += 500) {
      const batch = points.slice(index, index + 500).map((point) => ({
        drive_log_id: log.id,
        ...point,
      }));
      const { error } = await client.from("drive_route_points").insert(batch);
      if (error) throw error;
    }
  } catch (error) {
    await client.from("drive_logs").delete().eq("id", log.id);
    throw toAppError(error, "走行ルートを保存できませんでした。");
  }
}

export async function deleteDriveLog(driveLogID: string) {
  const { error } = await requireSupabase()
    .from("drive_logs")
    .delete()
    .eq("id", driveLogID);
  if (error) throw toAppError(error, "走行記録を削除できませんでした。");
}
