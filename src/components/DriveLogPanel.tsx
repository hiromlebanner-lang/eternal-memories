import L from "leaflet";
import {
  AlertTriangle,
  CarFront,
  ChevronRight,
  Clock3,
  Crosshair,
  LocateFixed,
  MapPin,
  Navigation,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Circle,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type {
  AlbumPhoto,
  DriveCoordinate,
  DriveDistanceSummary,
  DriveDestination,
  DriveLog,
  DriveRoutePoint,
  PlannedDriveRoute,
} from "../types";
import {
  deleteDriveLog,
  loadDriveLogs,
  loadDrivePhotos,
  loadDriveRoutePoints,
  saveDriveLog,
  summarizeDriveLogs,
} from "../lib/driveLogs";
import {
  calculateDriveDistance,
  shouldStoreDrivePoint,
} from "../lib/driveRoute";
import {
  distanceToPlannedRoute,
  fetchDrivingRoute,
  remainingDistanceMeters,
  searchDriveDestinations,
  shouldAutomaticallyReroute,
} from "../lib/driveNavigation";
import { MapAttribution } from "./MapAttribution";

type RecorderState = "idle" | "starting" | "recording" | "review";
type WakeLockStatus =
  | "idle"
  | "requesting"
  | "active"
  | "unsupported"
  | "unavailable";

interface RecordingDraft {
  id: string;
  userID: string;
  startedAt: string;
  points: DriveRoutePoint[];
  interrupted: boolean;
  backgroundedAt: string | null;
  destination: DriveDestination | null;
  plannedRoute: PlannedDriveRoute | null;
  rerouteCount: number;
}

interface DriveLogPanelProps {
  userID: string;
  onRecordingChange: (recording: boolean) => void;
  onNotice: (message: string) => void;
}

const MAX_ACCURACY_METERS = 100;
const MAX_POINTS = 10_000;
const storageKey = (userID: string) => `eternal-memories:drive:${userID}`;

export function hasRecoverableDrive(userID: string) {
  try {
    return Boolean(localStorage.getItem(storageKey(userID)));
  } catch {
    return false;
  }
}

function readDraft(userID: string): RecordingDraft | null {
  try {
    const value = localStorage.getItem(storageKey(userID));
    if (!value) return null;
    const draft = JSON.parse(value) as RecordingDraft;
    return draft.userID === userID && draft.points.length > 0
      ? {
          ...draft,
          backgroundedAt: draft.backgroundedAt ?? null,
          destination: draft.destination ?? null,
          plannedRoute: draft.plannedRoute ?? null,
          rerouteCount: draft.rerouteCount ?? 0,
        }
      : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: RecordingDraft) {
  try {
    localStorage.setItem(storageKey(draft.userID), JSON.stringify(draft));
  } catch {
    // メモリ上の記録は継続し、終了時の保存を優先します。
  }
}

function clearDraft(userID: string) {
  try {
    localStorage.removeItem(storageKey(userID));
  } catch {
    // 利用できない端末ではメモリ上の状態だけを破棄します。
  }
}

function toPoint(position: GeolocationPosition, sequence: number): DriveRoutePoint {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    recorded_at: new Date(position.timestamp).toISOString(),
    accuracy: position.coords.accuracy,
    speed: position.coords.speed,
    heading: position.coords.heading,
    altitude: position.coords.altitude,
    sequence_no: sequence,
  };
}

function formatCoordinate(point: DriveRoutePoint) {
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = Math.floor(seconds % 60);
  return hours > 0
    ? `${hours}時間${minutes}分`
    : `${minutes}分${remaining}秒`;
}

function formatDistance(meters: number) {
  return `${new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(meters / 1000)} km`;
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return month && day ? `${month}月${day}日` : "";
}

function defaultTitle(
  startedAt: string,
  destination?: DriveDestination | null,
) {
  const date = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(startedAt));
  return destination ? `${date}・${destination.name}まで` : `${date}のドライブ`;
}

function locationMessage(error: GeolocationPositionError) {
  return error.code === error.PERMISSION_DENIED
    ? "位置情報の利用が許可されていません。端末の設定から位置情報を許可してください。"
    : "現在地を取得できませんでした。通信環境と位置情報設定をご確認ください。";
}

function FitRoute({ coordinates }: { coordinates: DriveCoordinate[] }) {
  const map = useMap();
  useEffect(() => {
    window.setTimeout(() => map.invalidateSize(), 80);
    if (coordinates.length === 1) {
      map.setView([coordinates[0].latitude, coordinates[0].longitude], 15);
    } else if (coordinates.length > 1) {
      map.fitBounds(
        L.latLngBounds(
          coordinates.map((point) => [point.latitude, point.longitude]),
        ),
        { padding: [28, 28], maxZoom: 16 },
      );
    }
  }, [coordinates, map]);
  return null;
}

function FollowCurrent({
  current,
  enabled,
}: {
  current: DriveRoutePoint | null;
  enabled: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (current && enabled) {
      map.panTo([current.latitude, current.longitude], {
        animate: true,
        duration: 0.6,
      });
    }
  }, [current, enabled, map]);
  return null;
}

function DetectManualMapMove({ onManualMove }: { onManualMove: () => void }) {
  useMapEvents({ dragstart: onManualMove });
  return null;
}

const startIcon = L.divIcon({
  className: "drive-marker",
  html: "<span>出</span>",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});
const endIcon = L.divIcon({
  className: "drive-marker drive-marker--end",
  html: "<span>着</span>",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});
const photoIcon = L.divIcon({
  className: "drive-marker drive-marker--photo",
  html: "<span>写</span>",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function RouteMap({
  points,
  photos = [],
  plannedRoute = [],
  current = null,
  destination = null,
  followCurrent = false,
  onManualMove,
}: {
  points: DriveRoutePoint[];
  photos?: AlbumPhoto[];
  plannedRoute?: DriveCoordinate[];
  current?: DriveRoutePoint | null;
  destination?: DriveDestination | null;
  followCurrent?: boolean;
  onManualMove?: () => void;
}) {
  const positions = points.map(
    (point) => [point.latitude, point.longitude] as [number, number],
  );
  const plannedPositions = plannedRoute.map(
    (point) => [point.latitude, point.longitude] as [number, number],
  );
  const center = current
    ? ([current.latitude, current.longitude] as [number, number])
    : positions[0] ?? plannedPositions[0] ?? ([36.3, 138.2] as [number, number]);
  const fitCoordinates =
    plannedRoute.length > 0
      ? plannedRoute
      : points.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const currentIcon = current
    ? L.divIcon({
        className: "drive-current-marker",
        html:
          current.heading == null
            ? "<span>▲</span>"
            : `<span style="transform:rotate(${current.heading}deg)">▲</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      })
    : null;
  return (
    <div className="drive-map">
      <MapContainer
        center={center}
        zoom={current ? 15 : 5}
        attributionControl={false}
        className="drive-map__canvas"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          detectRetina
          keepBuffer={3}
          maxNativeZoom={19}
          maxZoom={19}
          updateWhenZooming={false}
        />
        {!followCurrent && fitCoordinates.length > 0 ? (
          <FitRoute coordinates={fitCoordinates} />
        ) : null}
        <FollowCurrent current={current} enabled={followCurrent} />
        {onManualMove ? (
          <DetectManualMapMove onManualMove={onManualMove} />
        ) : null}
        {plannedPositions.length > 1 ? (
          <Polyline
            positions={plannedPositions}
            pathOptions={{ color: "#3277c8", weight: 5, dashArray: "9 8" }}
          />
        ) : null}
        {positions.length > 1 ? (
          <Polyline positions={positions} pathOptions={{ color: "#ef4f62", weight: 5 }} />
        ) : null}
        {positions.length > 0 && !current ? (
          <Marker position={positions[0]} icon={startIcon} />
        ) : null}
        {positions.length > 0 && !current ? (
          <Marker position={positions.at(-1) ?? positions[0]} icon={endIcon} />
        ) : null}
        {current && currentIcon ? (
          <>
            <Circle
              center={[current.latitude, current.longitude]}
              radius={Math.min(current.accuracy, 150)}
              pathOptions={{ color: "#2676d2", fillOpacity: 0.08, weight: 1 }}
            />
            <Marker
              position={[current.latitude, current.longitude]}
              icon={currentIcon}
            />
          </>
        ) : null}
        {destination ? (
          <Marker
            position={[destination.latitude, destination.longitude]}
            icon={endIcon}
          />
        ) : null}
        {photos
          .filter(
            (photo): photo is AlbumPhoto & {
              latitude: number;
              longitude: number;
            } => photo.latitude != null && photo.longitude != null,
          )
          .map((photo) => (
            <Marker
              key={photo.id}
              position={[photo.latitude, photo.longitude]}
              icon={photoIcon}
            />
          ))}
      </MapContainer>
      <MapAttribution />
      {plannedRoute.length > 0 ? (
        <div className="drive-routing-attribution">Routing by OSRM</div>
      ) : null}
    </div>
  );
}

export function DriveLogPanel({
  userID,
  onRecordingChange,
  onNotice,
}: DriveLogPanelProps) {
  const recovered = useMemo(() => readDraft(userID), [userID]);
  const [state, setState] = useState<RecorderState>("idle");
  const [draft, setDraft] = useState<RecordingDraft | null>(recovered);
  const [logs, setLogs] = useState<DriveLog[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [distanceSummary, setDistanceSummary] =
    useState<DriveDistanceSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [selectedLog, setSelectedLog] = useState<DriveLog | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<DriveRoutePoint[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<AlbumPhoto[]>([]);
  const [title, setTitle] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [interruptionWarning, setInterruptionWarning] = useState(false);
  const [now, setNow] = useState(0);
  const [currentPosition, setCurrentPosition] =
    useState<DriveRoutePoint | null>(recovered?.points.at(-1) ?? null);
  const [locationStatus, setLocationStatus] = useState<
    "acquiring" | "ready" | "error"
  >("acquiring");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationResults, setDestinationResults] = useState<
    DriveDestination[]
  >([]);
  const [destination, setDestination] = useState<DriveDestination | null>(
    recovered?.destination ?? null,
  );
  const [plannedRoute, setPlannedRoute] = useState<PlannedDriveRoute | null>(
    recovered?.plannedRoute ?? null,
  );
  const [searchingDestination, setSearchingDestination] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeAttempted, setRouteAttempted] = useState(
    Boolean(recovered?.destination),
  );
  const [followCurrent, setFollowCurrent] = useState(true);
  const [arrivalPrompt, setArrivalPrompt] = useState(false);
  const [wakeLockStatus, setWakeLockStatus] =
    useState<WakeLockStatus>("idle");
  const watchID = useRef<number | undefined>(undefined);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const draftRef = useRef<RecordingDraft | null>(recovered);
  const stateRef = useRef<RecorderState>("idle");
  const currentPositionRef = useRef<DriveRoutePoint | null>(
    recovered?.points.at(-1) ?? null,
  );
  const searchAbort = useRef<AbortController | null>(null);
  const routeAbort = useRef<AbortController | null>(null);
  const routeRequestInFlight = useRef(false);
  const lastRouteRequestAt = useRef(0);
  const offRouteCount = useRef(0);
  const arrivalCount = useRef(0);

  const refreshLogs = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const nextLogs = await loadDriveLogs(userID);
      setLogs(nextLogs);
      setDistanceSummary(summarizeDriveLogs(nextLogs));
    } catch (caught) {
      setSummaryError(
        "走行距離を取得できませんでした。もう一度お試しください。",
      );
      setError(
        caught instanceof Error ? caught.message : "走行記録を読み込めませんでした。",
      );
    } finally {
      setSummaryLoading(false);
    }
  }, [userID]);

  const requestRoute = useCallback(
    async (
      start: DriveCoordinate,
      nextDestination: DriveDestination,
      isReroute = false,
    ) => {
      if (routeRequestInFlight.current) return;
      routeRequestInFlight.current = true;
      routeAbort.current?.abort();
      const controller = new AbortController();
      routeAbort.current = controller;
      setRouteBusy(true);
      setRouteAttempted(false);
      try {
        const route = await fetchDrivingRoute(
          start,
          nextDestination,
          controller.signal,
        );
        setPlannedRoute(route);
        lastRouteRequestAt.current = Date.now();
        setDraft((current) =>
          current
            ? {
                ...current,
                destination: nextDestination,
                plannedRoute: route,
                rerouteCount:
                  current.rerouteCount + (isReroute ? 1 : 0),
              }
            : current,
        );
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(
            "ルートを取得できませんでした。現在地の表示と走行記録は引き続き利用できます。",
          );
        }
      } finally {
        routeRequestInFlight.current = false;
        setRouteBusy(false);
        setRouteAttempted(true);
      }
    },
    [],
  );

  const runDestinationSearch = useCallback(async () => {
    const query = destinationQuery.trim();
    if (query.length < 3) {
      setError("目的地を3文字以上で入力してください。");
      return;
    }
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearchingDestination(true);
    setError("");
    try {
      const results = await searchDriveDestinations(
        query,
        currentPositionRef.current,
        controller.signal,
      );
      setDestinationResults(results);
      if (results.length === 0) {
        setError("目的地が見つかりませんでした。別の名称や住所でお試しください。");
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError("目的地を検索できませんでした。時間を空けてもう一度お試しください。");
      }
    } finally {
      setSearchingDestination(false);
    }
  }, [destinationQuery]);

  useEffect(() => {
    const query = destinationQuery.trim();
    if (
      state !== "idle" ||
      draft ||
      query.length < 3 ||
      destination?.name === query
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runDestinationSearch();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [destination, destinationQuery, draft, runDestinationSearch, state]);

  const chooseDestination = async (nextDestination: DriveDestination) => {
    setDestination(nextDestination);
    setDestinationQuery(nextDestination.name);
    setDestinationResults([]);
    setPlannedRoute(null);
    setRouteAttempted(false);
    setError("");
    const start = currentPositionRef.current;
    if (!start) {
      setError("現在地を取得してからルートを検索します。");
      return;
    }
    await requestRoute(start, nextDestination);
  };

  useEffect(() => {
    void refreshLogs();
  }, [refreshLogs]);

  useEffect(() => {
    draftRef.current = draft;
    if (draft) writeDraft(draft);
  }, [draft]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    currentPositionRef.current = currentPosition;
  }, [currentPosition]);

  useEffect(() => {
    if (
      state !== "recording" ||
      !currentPosition ||
      !destination ||
      !plannedRoute
    ) {
      return;
    }

    const destinationDistance = remainingDistanceMeters(
      currentPosition,
      destination,
    );
    if (destinationDistance <= 80) {
      arrivalCount.current += 1;
      if (arrivalCount.current >= 2) setArrivalPrompt(true);
    } else if (destinationDistance > 120) {
      arrivalCount.current = 0;
    }

    const routeDistance = distanceToPlannedRoute(
      currentPosition,
      plannedRoute.coordinates,
    );
    offRouteCount.current = routeDistance > 200 ? offRouteCount.current + 1 : 0;
    const rerouteCount = draftRef.current?.rerouteCount ?? 0;
    if (
      shouldAutomaticallyReroute({
        distanceFromRouteMeters: routeDistance,
        consecutiveOffRoutePositions: offRouteCount.current,
        millisecondsSinceLastRoute:
          Date.now() - lastRouteRequestAt.current,
        rerouteCount,
      }) &&
      !routeRequestInFlight.current
    ) {
      offRouteCount.current = 0;
      void requestRoute(currentPosition, destination, true);
    }
  }, [currentPosition, destination, plannedRoute, requestRoute, state]);

  const stopWatch = useCallback(() => {
    if (watchID.current !== undefined && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchID.current);
      watchID.current = undefined;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLock.current;
    wakeLock.current = null;
    if (sentinel && !sentinel.released) {
      await sentinel.release().catch(() => undefined);
    }
    setWakeLockStatus((current) =>
      current === "unsupported" ? current : "idle",
    );
  }, []);

  const requestWakeLock = useCallback(async () => {
    const wakeLockAPI = (
      navigator as unknown as { wakeLock?: WakeLock }
    ).wakeLock;
    if (!wakeLockAPI) {
      setWakeLockStatus("unsupported");
      return;
    }
    if (document.visibilityState !== "visible") return;
    if (wakeLock.current && !wakeLock.current.released) {
      setWakeLockStatus("active");
      return;
    }

    setWakeLockStatus("requesting");
    try {
      const sentinel = await wakeLockAPI.request("screen");
      wakeLock.current = sentinel;
      setWakeLockStatus("active");
      sentinel.addEventListener(
        "release",
        () => {
          if (wakeLock.current !== sentinel) return;
          wakeLock.current = null;
          setWakeLockStatus("unavailable");
        },
        { once: true },
      );
    } catch {
      setWakeLockStatus("unavailable");
    }
  }, []);

  const acceptPosition = useCallback((position: GeolocationPosition) => {
    const livePoint = toPoint(
      position,
      draftRef.current?.points.length ?? 0,
    );
    if (position.coords.accuracy <= 200) {
      setCurrentPosition(livePoint);
      setLocationStatus("ready");
    }
    if (position.coords.accuracy > MAX_ACCURACY_METERS) return;
    setDraft((current) => {
      if (
        stateRef.current !== "recording" ||
        !current ||
        current.points.length >= MAX_POINTS
      ) {
        return current;
      }
      const next = { ...livePoint, sequence_no: current.points.length };
      const previous = current.points.at(-1);
      if (previous && !shouldStoreDrivePoint(previous, next)) return current;
      return { ...current, points: [...current.points, next] };
    });
  }, []);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation || watchID.current !== undefined) return;
    watchID.current = navigator.geolocation.watchPosition(
      acceptPosition,
      (geoError) => {
        setLocationStatus("error");
        setError(locationMessage(geoError));
        if (
          geoError.code === geoError.PERMISSION_DENIED &&
          stateRef.current === "recording"
        ) {
          stopWatch();
          const current = draftRef.current;
          if (current) {
            setEndedAt(new Date().toISOString());
            setTitle(defaultTitle(current.startedAt, current.destination));
            setState("review");
          }
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 8_000,
        timeout: 18_000,
      },
    );
  }, [acceptPosition, stopWatch]);

  useEffect(() => {
    startWatch();
    return () => stopWatch();
  }, [startWatch, state, stopWatch]);

  useEffect(
    () => () => {
      searchAbort.current?.abort();
      routeAbort.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (state !== "recording") return;
    onRecordingChange(true);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const visibility = () => {
      if (document.hidden) {
        stopWatch();
        setDraft((current) =>
          current
            ? {
                ...current,
                interrupted: true,
                backgroundedAt: new Date().toISOString(),
              }
            : current,
        );
      } else {
        setInterruptionWarning(true);
        startWatch();
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      onRecordingChange(false);
    };
  }, [
    onRecordingChange,
    requestWakeLock,
    startWatch,
    state,
    stopWatch,
  ]);

  useEffect(() => {
    if (state !== "recording") {
      void releaseWakeLock();
      return;
    }
    void requestWakeLock();
    return () => {
      void releaseWakeLock();
    };
  }, [releaseWakeLock, requestWakeLock, state]);

  const startRecording = () => {
    if (!navigator.geolocation) {
      setError("この端末では位置情報を利用できません。");
      return;
    }
    setError("");
    const point = currentPositionRef.current;
    if (!point || point.accuracy > MAX_ACCURACY_METERS) {
      setError("現在地を確認できていません。屋外で少し待ってから再度お試しください。");
      return;
    }
    if (destination && !plannedRoute && !routeAttempted) {
      setError("目的地までのルート取得を試してから開始してください。");
      return;
    }
    const startedAt = new Date().toISOString();
    const firstPoint = { ...point, recorded_at: startedAt, sequence_no: 0 };
    const nextDraft: RecordingDraft = {
      id: crypto.randomUUID(),
      userID,
      startedAt,
      points: [firstPoint],
      interrupted: false,
      backgroundedAt: null,
      destination,
      plannedRoute,
      rerouteCount: 0,
    };
    setDraft(nextDraft);
    setFollowCurrent(true);
    setNow(Date.now());
    setState("recording");
  };

  const finishRecording = () => {
    const current = draftRef.current;
    if (!current?.points.length) return;
    stopWatch();
    const end = new Date().toISOString();
    setEndedAt(end);
    setTitle(defaultTitle(current.startedAt, current.destination));
    setState("review");
  };

  const discardDraft = () => {
    stopWatch();
    clearDraft(userID);
    setDraft(null);
    setEndedAt("");
    setTitle("");
    setDestination(null);
    setPlannedRoute(null);
    setDestinationQuery("");
    setRouteAttempted(false);
    setState("idle");
  };

  const saveCurrent = async () => {
    if (!draft?.points.length || !endedAt || busy) return;
    const first = draft.points[0];
    const last = draft.points.at(-1) ?? first;
    setBusy(true);
    setError("");
    try {
      await saveDriveLog(
        {
          id: draft.id,
          user_id: userID,
          title: title.trim() || defaultTitle(draft.startedAt, draft.destination),
          started_at: draft.startedAt,
          ended_at: endedAt,
          start_latitude: first.latitude,
          start_longitude: first.longitude,
          end_latitude: last.latitude,
          end_longitude: last.longitude,
          start_label: formatCoordinate(first),
          end_label: formatCoordinate(last),
          distance_meters: calculateDriveDistance(draft.points),
          actual_distance_meters: calculateDriveDistance(draft.points),
          duration_seconds: Math.max(
            0,
            (new Date(endedAt).getTime() -
              new Date(draft.startedAt).getTime()) /
              1000,
          ),
          actual_duration_seconds: Math.max(
            0,
            (new Date(endedAt).getTime() -
              new Date(draft.startedAt).getTime()) /
              1000,
          ),
          destination_name: draft.destination?.name ?? null,
          destination_address: draft.destination?.address ?? null,
          destination_latitude: draft.destination?.latitude ?? null,
          destination_longitude: draft.destination?.longitude ?? null,
          planned_distance_meters:
            draft.plannedRoute?.distanceMeters ?? null,
          planned_duration_seconds:
            draft.plannedRoute?.durationSeconds ?? null,
          planned_route: draft.plannedRoute?.coordinates ?? null,
        },
        draft.points,
      );
      clearDraft(userID);
      setDraft(null);
      setDestination(null);
      setPlannedRoute(null);
      setDestinationQuery("");
      setRouteAttempted(false);
      setState("idle");
      await refreshLogs();
      onNotice("走行記録を保存しました。");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "走行記録を保存できませんでした。通信環境をご確認のうえ、もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  };

  const openLog = async (log: DriveLog) => {
    setBusy(true);
    setError("");
    try {
      const [points, photos] = await Promise.all([
        loadDriveRoutePoints(log.id),
        loadDrivePhotos(userID, log.started_at, log.ended_at),
      ]);
      setSelectedLog(log);
      setSelectedPoints(points);
      setSelectedPhotos(photos);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "走行記録を開けませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const removeLog = async () => {
    if (!selectedLog || busy) return;
    setBusy(true);
    try {
      await deleteDriveLog(selectedLog.id);
      setSelectedLog(null);
      setSelectedPoints([]);
      setSelectedPhotos([]);
      await refreshLogs();
      onNotice("走行記録を削除しました。");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "走行記録を削除できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const distance = calculateDriveDistance(draft?.points ?? []);
  const durationSeconds = draft
    ? Math.max(0, (now - new Date(draft.startedAt).getTime()) / 1000)
    : 0;
  const remainingDistance =
    currentPosition && destination
      ? remainingDistanceMeters(currentPosition, destination)
      : null;
  const estimatedRemainingSeconds =
    remainingDistance != null && plannedRoute?.distanceMeters
      ? Math.max(
          0,
          (remainingDistance / plannedRoute.distanceMeters) *
            plannedRoute.durationSeconds,
        )
      : null;
  const currentStatusLabel =
    locationStatus === "ready"
      ? `現在地取得済み（精度 約${Math.round(currentPosition?.accuracy ?? 0)}m）`
      : locationStatus === "error"
        ? "現在地を取得できません"
        : "現在地を取得しています…";
  const wakeLockLabel =
    wakeLockStatus === "active"
      ? "画面スリープ防止: 有効"
      : wakeLockStatus === "requesting"
        ? "画面スリープ防止: 準備中…"
        : "画面スリープ防止: 利用できません（記録は継続します）";
  const gpsHeaderLabel =
    state === "recording"
      ? "走行記録中"
      : locationStatus === "ready"
        ? "GPS：取得済み"
        : locationStatus === "error"
          ? "GPS：取得できません"
          : "GPS：取得中";
  const pageHeader = (
    <header className="drive-page-header">
      <span className="drive-page-header__icon" aria-hidden="true">
        <CarFront size={23} />
      </span>
      <div>
        <h1>ドライブ</h1>
        <small className={state === "recording" ? "is-recording" : ""}>
          {state === "recording" ? <span aria-hidden="true" /> : null}
          {gpsHeaderLabel}
        </small>
      </div>
    </header>
  );
  const visibleHistory = showAllHistory ? logs : logs.slice(0, 5);

  if (selectedLog) {
    const savedDestination =
      selectedLog.destination_latitude != null &&
      selectedLog.destination_longitude != null
        ? {
            id: selectedLog.id,
            name: selectedLog.destination_name || "目的地",
            address: selectedLog.destination_address || "",
            latitude: selectedLog.destination_latitude,
            longitude: selectedLog.destination_longitude,
          }
        : null;
    return (
      <div className="drive-panel">
        {pageHeader}
        <button
          className="text-button drive-back"
          type="button"
          onClick={() => setSelectedLog(null)}
        >
          ← 一覧へ戻る
        </button>
        <RouteMap
          points={selectedPoints}
          photos={selectedPhotos}
          plannedRoute={selectedLog.planned_route ?? []}
          destination={savedDestination}
        />
        <h3>{selectedLog.title}</h3>
        <div className="drive-stats">
          <span><Navigation size={17} /><strong>{((selectedLog.actual_distance_meters ?? selectedLog.distance_meters) / 1000).toFixed(1)} km</strong></span>
          <span><Clock3 size={17} /><strong>{formatDuration(selectedLog.actual_duration_seconds ?? selectedLog.duration_seconds)}</strong></span>
        </div>
        <dl className="drive-details">
          <div><dt>出発地点</dt><dd>{selectedLog.start_label}</dd></div>
          {selectedLog.destination_name ? (
            <div><dt>目的地</dt><dd>{selectedLog.destination_name}</dd></div>
          ) : null}
          <div><dt>到着地点</dt><dd>{selectedLog.end_label}</dd></div>
          {selectedLog.planned_distance_meters != null ? (
            <div><dt>予定距離</dt><dd>{(selectedLog.planned_distance_meters / 1000).toFixed(1)} km</dd></div>
          ) : null}
          <div><dt>開始</dt><dd>{new Date(selectedLog.started_at).toLocaleString("ja-JP")}</dd></div>
          <div><dt>終了</dt><dd>{new Date(selectedLog.ended_at).toLocaleString("ja-JP")}</dd></div>
          <div><dt>走行中の写真</dt><dd>{selectedPhotos.length}枚</dd></div>
        </dl>
        <button className="danger-button danger-button--wide" type="button" disabled={busy} onClick={() => void removeLog()}>
          <Trash2 size={17} /> この記録を削除
        </button>
      </div>
    );
  }

  return (
    <div className="drive-panel">
      {pageHeader}
      {error ? <p className="drive-message drive-message--error">{error}</p> : null}
      {interruptionWarning || draft?.interrupted ? (
        <p className="drive-message drive-message--warning">
          <AlertTriangle size={17} />
          アプリがバックグラウンドになったため、位置情報の記録が一部途切れた可能性があります。
        </p>
      ) : null}

      {state === "idle" && !draft ? (
        <section
          className="drive-distance-summary"
          aria-label="走行距離集計"
        >
          <div className="drive-distance-summary__heading">
            <h3>走行距離</h3>
            {distanceSummary?.weekStart && distanceSummary.weekEnd ? (
              <small>
                今週 {formatShortDate(distanceSummary.weekStart)}〜
                {formatShortDate(distanceSummary.weekEnd)}
              </small>
            ) : null}
          </div>
          {summaryLoading ? (
            <p className="drive-distance-summary__state">
              走行距離を読み込んでいます…
            </p>
          ) : summaryError ? (
            <div className="drive-distance-summary__state">
              <p>{summaryError}</p>
              <button
                className="text-button"
                type="button"
                onClick={() => void refreshLogs()}
              >
                再読み込み
              </button>
            </div>
          ) : distanceSummary ? (
            <div className="drive-distance-summary__grid">
              <span>
                <small>今日</small>
                <strong>{formatDistance(distanceSummary.todayMeters)}</strong>
              </span>
              <span>
                <small>今週</small>
                <strong>{formatDistance(distanceSummary.weekMeters)}</strong>
              </span>
              <span>
                <small>今月</small>
                <strong>{formatDistance(distanceSummary.monthMeters)}</strong>
              </span>
              <span>
                <small>累計</small>
                <strong>{formatDistance(distanceSummary.totalMeters)}</strong>
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {draft && state === "idle" ? (
        <section className="drive-recovery">
          <RotateCcw size={23} />
          <div>
            <strong>走行記録を再開しますか？</strong>
            <p>端末に保存された{draft.points.length}地点から再開できます。</p>
          </div>
          <div className="drive-actions">
            <button className="primary-button" type="button" onClick={() => setState("recording")}>再開</button>
            <button className="secondary-button" type="button" onClick={() => {
              setEndedAt(new Date().toISOString());
              setTitle(defaultTitle(draft.startedAt, draft.destination));
              setState("review");
            }}>終了して保存</button>
            <button className="text-button" type="button" onClick={discardDraft}>破棄</button>
          </div>
        </section>
      ) : state === "recording" && draft ? (
        <section className="drive-recording">
          <div className="drive-recording__status"><span /><strong>走行記録中</strong></div>
          <RouteMap
            points={draft.points}
            plannedRoute={plannedRoute?.coordinates ?? []}
            current={currentPosition}
            destination={destination}
            followCurrent={followCurrent}
            onManualMove={() => setFollowCurrent(false)}
          />
          <button
            className="drive-follow-button"
            type="button"
            onClick={() => setFollowCurrent(true)}
          >
            <Crosshair size={17} /> 現在地へ戻る
          </button>
          {destination ? (
            <div className="drive-nav-summary">
              <strong>{destination.name}</strong>
              <span>
                残り{" "}
                {remainingDistance == null
                  ? "—"
                  : `${(remainingDistance / 1000).toFixed(1)} km`}
                ・約{" "}
                {estimatedRemainingSeconds == null
                  ? "—"
                  : formatDuration(estimatedRemainingSeconds)}
              </span>
            </div>
          ) : null}
          <div className="drive-stats">
            <span><Clock3 size={18} /><small>経過時間</small><strong>{formatDuration(durationSeconds)}</strong></span>
            <span><Navigation size={18} /><small>走行距離</small><strong>{(distance / 1000).toFixed(1)} km</strong></span>
          </div>
          <p><LocateFixed size={17} />{currentStatusLabel}・{draft.points.length}地点</p>
          <p className="drive-wake-lock-status">{wakeLockLabel}</p>
          {arrivalPrompt ? (
            <div className="drive-arrival">
              <strong>目的地付近に到着しました。走行記録を終了しますか？</strong>
              <div className="drive-actions">
                <button className="primary-button" type="button" onClick={finishRecording}>終了して保存</button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    arrivalCount.current = 0;
                    setArrivalPrompt(false);
                  }}
                >
                  記録を続ける
                </button>
              </div>
            </div>
          ) : null}
          {destination ? (
            <button
              className="secondary-button drive-reroute"
              type="button"
              disabled={routeBusy || !currentPosition}
              onClick={() => {
                if (currentPosition) {
                  void requestRoute(currentPosition, destination, true);
                }
              }}
            >
              <RefreshCw size={16} />{" "}
              {routeBusy ? "ルート再検索中…" : "ルート再検索"}
            </button>
          ) : null}
          <button className="danger-button danger-button--wide" type="button" onClick={finishRecording}>
            <Square size={17} /> 走行記録を終了
          </button>
        </section>
      ) : state === "review" && draft ? (
        <section className="drive-review">
          <RouteMap
            points={draft.points}
            plannedRoute={draft.plannedRoute?.coordinates ?? []}
            destination={draft.destination}
          />
          <label className="field">
            <span>タイトル</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} />
          </label>
          <div className="drive-stats">
            <span><Navigation size={17} /><strong>{(distance / 1000).toFixed(1)} km</strong></span>
            <span><Clock3 size={17} /><strong>{formatDuration((new Date(endedAt).getTime() - new Date(draft.startedAt).getTime()) / 1000)}</strong></span>
          </div>
          <div className="drive-endpoints">
            <p><MapPin size={17} /><span><small>出発地点</small>{formatCoordinate(draft.points[0])}</span></p>
            {draft.destination ? (
              <p><Navigation size={17} /><span><small>目的地</small>{draft.destination.name}</span></p>
            ) : null}
            <p><MapPin size={17} /><span><small>到着地点</small>{formatCoordinate(draft.points.at(-1) ?? draft.points[0])}</span></p>
          </div>
          <div className="drive-actions drive-actions--split">
            <button className="secondary-button" type="button" disabled={busy} onClick={discardDraft}>破棄</button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void saveCurrent()}>
              <Save size={17} /> {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </section>
      ) : !draft ? (
        <section className="drive-start drive-navigation-start">
          <form
            className="drive-search"
            onSubmit={(event) => {
              event.preventDefault();
              void runDestinationSearch();
            }}
          >
            <label htmlFor="drive-destination">目的地</label>
            <div>
              <Search size={18} />
              <input
                id="drive-destination"
                type="search"
                value={destinationQuery}
                onChange={(event) => {
                  searchAbort.current?.abort();
                  setDestinationResults([]);
                  setDestinationQuery(event.target.value);
                }}
                placeholder="施設名・駅名・住所"
                autoComplete="off"
              />
              <button type="submit" disabled={searchingDestination}>
                {searchingDestination ? "検索中…" : "検索"}
              </button>
            </div>
          </form>
          <p className="drive-free-mode-note">
            目的地を設定する場合は検索してください。目的地なしでも現在地から走行記録を開始できます。
          </p>
          {destinationResults.length > 0 ? (
            <div className="drive-search-results">
              {destinationResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => void chooseDestination(result)}
                >
                  <MapPin size={17} />
                  <span>
                    <strong>{result.name}</strong>
                    <small>{result.address}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <p className="drive-location-status">
            <LocateFixed size={17} /> {currentStatusLabel}
          </p>
          <RouteMap
            points={[]}
            plannedRoute={plannedRoute?.coordinates ?? []}
            current={currentPosition}
            destination={destination}
            followCurrent={followCurrent}
            onManualMove={() => setFollowCurrent(false)}
          />
          <button
            className="drive-follow-button"
            type="button"
            disabled={!currentPosition}
            onClick={() => setFollowCurrent(true)}
          >
            <Crosshair size={17} /> 現在地へ戻る
          </button>
          {destination ? (
            <div className="drive-nav-summary">
              <strong>{destination.name}</strong>
              <small>{destination.address}</small>
              <span>
                {plannedRoute
                  ? `予定 ${(plannedRoute.distanceMeters / 1000).toFixed(1)} km・約 ${formatDuration(plannedRoute.durationSeconds)}`
                  : routeBusy
                    ? "ルートを取得しています…"
                    : "ルート未取得"}
              </span>
              {!plannedRoute ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={routeBusy || !currentPosition}
                  onClick={() => {
                    if (currentPosition) {
                      void requestRoute(currentPosition, destination);
                    }
                  }}
                >
                  <RefreshCw size={16} /> ルートを取得
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={
              !currentPosition ||
              routeBusy ||
              Boolean(destination && !plannedRoute && !routeAttempted)
            }
            onClick={startRecording}
          >
            <Play size={18} />{" "}
            {destination ? "ナビ・走行記録を開始" : "走行記録を開始"}
          </button>
        </section>
      ) : null}

      {state === "idle" && !draft ? (
        <section className="drive-history">
          <h3>保存済みの走行記録</h3>
          {logs.length === 0 ? (
            <p className="drive-empty">保存済みの走行記録はありません。</p>
          ) : (
            <>
              {visibleHistory.map((log) => (
                <button key={log.id} type="button" onClick={() => void openLog(log)}>
                  <span>
                    <strong>{log.title}</strong>
                    <small>{new Date(log.started_at).toLocaleDateString("ja-JP")}・{log.start_label} → {log.end_label}</small>
                    <small>{((log.actual_distance_meters ?? log.distance_meters) / 1000).toFixed(1)} km／{formatDuration(log.actual_duration_seconds ?? log.duration_seconds)}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
              {logs.length > 5 ? (
                <button
                  className="drive-history__toggle"
                  type="button"
                  onClick={() => setShowAllHistory((current) => !current)}
                >
                  <span>
                    <strong>{showAllHistory ? "最新5件を表示" : "すべて見る"}</strong>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <section className="drive-pwa-note" aria-label="PWA版の注意">
        <AlertTriangle size={17} />
        <div>
          <p>
            PWA版では、画面を閉じたり端末をロックすると、位置情報の記録やナビ表示が停止する場合があります。記録中はアプリを前面に表示したままご利用ください。
          </p>
          <small>
            長時間の画面点灯は、バッテリー消費や端末の発熱につながる場合があります。
          </small>
          <small className="drive-service-note">
            検索: Nominatim／経路: OSRM
          </small>
        </div>
      </section>
    </div>
  );
}
