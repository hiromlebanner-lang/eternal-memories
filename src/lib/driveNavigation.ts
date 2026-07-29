import type {
  DriveCoordinate,
  DriveDestination,
  PlannedDriveRoute,
} from "../types";
import { distanceInMeters } from "./location";

const NOMINATIM_URL =
  import.meta.env.VITE_NOMINATIM_URL?.trim() ||
  "https://nominatim.openstreetmap.org";
const OSRM_URL =
  import.meta.env.VITE_OSRM_URL?.trim() || "https://router.project-osrm.org";

// 利用者増加時は、環境変数で専用またはセルフホスト環境へ切り替えてください。
const searchCache = new Map<string, DriveDestination[]>();
let lastSearchAt = 0;

type NominatimResult = {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
};

type OsrmResponse = {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
  }>;
};

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

export async function searchDriveDestinations(
  query: string,
  current: DriveCoordinate | null,
  signal?: AbortSignal,
): Promise<DriveDestination[]> {
  const normalized = normalizeQuery(query);
  if (normalized.length < 3) return [];
  const cacheKey = normalized.toLocaleLowerCase("ja-JP");
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const wait = Math.max(0, 1_000 - (Date.now() - lastSearchAt));
  if (wait > 0) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, wait);
      signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new DOMException("検索を中断しました", "AbortError"));
        },
        { once: true },
      );
    });
  }
  if (signal?.aborted) throw new DOMException("検索を中断しました", "AbortError");
  lastSearchAt = Date.now();

  const url = new URL("/search", NOMINATIM_URL);
  url.searchParams.set("q", normalized);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("accept-language", "ja");
  url.searchParams.set("limit", "5");
  if (current) {
    url.searchParams.set(
      "viewbox",
      `${current.longitude - 2},${current.latitude + 2},${current.longitude + 2},${current.latitude - 2}`,
    );
  }

  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("目的地検索サービスを利用できません。");
  const results = (await response.json()) as NominatimResult[];
  const destinations = results.slice(0, 5).map((result) => {
    const [fallbackName] = result.display_name.split(",");
    return {
      id: String(result.place_id),
      name: result.name?.trim() || fallbackName.trim(),
      address: result.display_name,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
    };
  });
  searchCache.set(cacheKey, destinations);
  return destinations;
}

export async function fetchDrivingRoute(
  start: DriveCoordinate,
  destination: DriveCoordinate,
  signal?: AbortSignal,
): Promise<PlannedDriveRoute> {
  const coordinates = `${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`/route/v1/driving/${coordinates}`, OSRM_URL);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "false");

  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("ルート検索サービスを利用できません。");
  const result = (await response.json()) as OsrmResponse;
  const route = result.routes?.[0];
  if (result.code !== "Ok" || !route) {
    throw new Error("目的地までの自動車ルートが見つかりませんでした。");
  }
  return {
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({
      latitude,
      longitude,
    })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    fetchedAt: new Date().toISOString(),
  };
}

export function distanceToPlannedRoute(
  current: DriveCoordinate,
  route: DriveCoordinate[],
) {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  return route.reduce(
    (nearest, point) => Math.min(nearest, distanceInMeters(current, point)),
    Number.POSITIVE_INFINITY,
  );
}

export function remainingDistanceMeters(
  current: DriveCoordinate,
  destination: DriveCoordinate,
) {
  return distanceInMeters(current, destination);
}

export function shouldAutomaticallyReroute(input: {
  distanceFromRouteMeters: number;
  consecutiveOffRoutePositions: number;
  millisecondsSinceLastRoute: number;
  rerouteCount: number;
}) {
  return (
    input.distanceFromRouteMeters > 200 &&
    input.consecutiveOffRoutePositions >= 3 &&
    input.millisecondsSinceLastRoute >= 45_000 &&
    input.rerouteCount < 5
  );
}
