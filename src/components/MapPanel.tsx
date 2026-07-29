import L from "leaflet";
import { LocateFixed, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { AlbumPhoto, PhotoLocationGroup } from "../types";
import { CATEGORY_META } from "../types";
import { groupPhotosByLocation } from "../lib/location";
import { MapAttribution } from "./MapAttribution";

interface MapPanelProps {
  userID: string;
  photos: AlbumPhoto[];
  onSelect: (group: PhotoLocationGroup) => void;
}

interface CurrentLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const DEFAULT_CENTER: [number, number] = [36.3, 138.2];

function readLastCenter(userID: string): {
  center: [number, number];
  zoom: number;
} {
  try {
    const value = JSON.parse(
      localStorage.getItem(`mapalbum:last-map:${userID}`) ?? "null",
    ) as { latitude?: unknown; longitude?: unknown; zoom?: unknown } | null;
    if (
      value &&
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      return {
        center: [value.latitude, value.longitude],
        zoom: typeof value.zoom === "number" ? value.zoom : 15,
      };
    }
  } catch {
    // 保存値が壊れている場合は安全な既定位置へ戻す。
  }
  return { center: DEFAULT_CENTER, zoom: 5 };
}

function zoomForLocation(accuracy: number) {
  const compact = window.innerWidth < 430;
  if (accuracy <= 50) return compact ? 16 : 17;
  if (accuracy <= 200) return compact ? 15 : 16;
  return 14;
}

function LocationController({
  userID,
  location,
  focusRequest,
}: {
  userID: string;
  location: CurrentLocation | null;
  focusRequest: number;
}) {
  const map = useMap();
  const initialCentered = useRef(false);

  useMapEvents({
    moveend() {
      const center = map.getCenter();
      localStorage.setItem(
        `mapalbum:last-map:${userID}`,
        JSON.stringify({
          latitude: center.lat,
          longitude: center.lng,
          zoom: map.getZoom(),
        }),
      );
    },
  });

  useEffect(() => {
    window.setTimeout(() => map.invalidateSize(), 60);
  }, [map]);

  useEffect(() => {
    if (!location) return;
    if (!initialCentered.current || focusRequest > 0) {
      map.setView(
        [location.latitude, location.longitude],
        zoomForLocation(location.accuracy),
        { animate: initialCentered.current },
      );
      initialCentered.current = true;
    }
  }, [focusRequest, location, map]);

  return null;
}

function markerIcon(group: PhotoLocationGroup) {
  const photo = group.photos[0];
  const meta = CATEGORY_META[photo.category];
  const safeImage = encodeURI(photo.image_url).replaceAll("'", "%27");
  const photoBackground = photo.image_url
    ? `background-image:url('${safeImage}')`
    : `background:${meta.color}`;

  return L.divIcon({
    className: "photo-div-icon",
    iconSize: [64, 72],
    iconAnchor: [32, 68],
    html: `
      <div class="map-photo-marker" style="${photoBackground}">
        <span class="map-photo-marker__category">${meta.emoji}</span>
        ${
          group.photos.length > 1
            ? `<span class="map-photo-marker__count">${group.photos.length}</span>`
            : ""
        }
      </div>
      <span class="map-photo-marker__tail"></span>
    `,
  });
}

const currentLocationIcon = L.divIcon({
  className: "current-location-div-icon",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: '<span class="current-location-marker"><i></i></span>',
});

export function MapPanel({ userID, photos, onSelect }: MapPanelProps) {
  const groups = useMemo(() => groupPhotosByLocation(photos), [photos]);
  const initial = useMemo(() => readLastCenter(userID), [userID]);
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(true);
  const [focusRequest, setFocusRequest] = useState(0);

  const locate = useCallback((focus: boolean) => {
    if (!navigator.geolocation) {
      setLocationError(
        "現在地を表示するには、端末の設定から位置情報を許可してください",
      );
      setLocating(false);
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.max(10, position.coords.accuracy),
        });
        if (focus) setFocusRequest((current) => current + 1);
        setLocating(false);
      },
      () => {
        setLocationError(
          "現在地を表示するには、端末の設定から位置情報を許可してください",
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 15_000,
      },
    );
  }, []);

  useEffect(() => {
    locate(false);
  }, [locate]);

  return (
    <div className="map-panel">
      <MapContainer
        center={initial.center}
        zoom={initial.zoom}
        zoomControl={false}
        attributionControl={false}
        className="map-canvas"
        preferCanvas
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          detectRetina
          keepBuffer={3}
          maxNativeZoom={19}
          maxZoom={19}
          updateWhenZooming={false}
        />
        <ZoomControl position="topright" />
        <LocationController
          userID={userID}
          location={location}
          focusRequest={focusRequest}
        />
        {location ? (
          <>
            <Circle
              center={[location.latitude, location.longitude]}
              radius={location.accuracy}
              pathOptions={{
                color: "#2d8cff",
                fillColor: "#78b7ff",
                fillOpacity: 0.16,
                weight: 1,
              }}
            />
            <Marker
              position={[location.latitude, location.longitude]}
              icon={currentLocationIcon}
              zIndexOffset={1000}
            />
          </>
        ) : null}
        {groups.map((group) => (
          <Marker
            key={group.id}
            position={[group.latitude, group.longitude]}
            icon={markerIcon(group)}
            eventHandlers={{ click: () => onSelect(group) }}
          />
        ))}
      </MapContainer>
      <MapAttribution />

      <button
        className="map-locate-button"
        type="button"
        disabled={locating}
        onClick={() => locate(true)}
      >
        <LocateFixed size={18} />
        {locating ? "現在地を確認中…" : "現在地へ戻る"}
      </button>

      <div className="map-summary glass-chip">
        <span className="live-dot" />
        {groups.length}か所・{photos.length}枚
      </div>

      {locationError ? (
        <div className="map-location-error glass-card" role="status">
          <p>{locationError}</p>
          <button
            type="button"
            onClick={() =>
              window.alert(
                "iPhoneは「設定」→「プライバシーとセキュリティ」→「位置情報サービス」から、利用中のブラウザを許可してください。Androidはサイト設定の位置情報を許可してください。",
              )
            }
          >
            <Settings size={16} /> 設定方法を見る
          </button>
        </div>
      ) : null}

      {photos.length === 0 ? (
        <div className="map-empty glass-card">
          <span>📷</span>
          <strong>最初の写真を追加しましょう</strong>
          <p>撮影場所が、丸い写真アイコンで地図に現れます。</p>
        </div>
      ) : null}
    </div>
  );
}
