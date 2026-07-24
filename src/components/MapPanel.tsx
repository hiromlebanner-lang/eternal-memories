import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { AlbumPhoto, PhotoLocationGroup } from "../types";
import { CATEGORY_META } from "../types";
import { groupPhotosByLocation } from "../lib/location";

interface MapPanelProps {
  photos: AlbumPhoto[];
  onSelect: (group: PhotoLocationGroup) => void;
}

function FitPhotos({ groups }: { groups: PhotoLocationGroup[] }) {
  const map = useMap();

  useEffect(() => {
    window.setTimeout(() => map.invalidateSize(), 60);
    if (groups.length === 0) {
      map.setView([36.3, 138.2], 5);
      return;
    }
    if (groups.length === 1) {
      map.setView([groups[0].latitude, groups[0].longitude], 13);
      return;
    }
    map.fitBounds(
      L.latLngBounds(groups.map((group) => [group.latitude, group.longitude])),
      { padding: [46, 46], maxZoom: 13 },
    );
  }, [groups, map]);

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

export function MapPanel({ photos, onSelect }: MapPanelProps) {
  const groups = useMemo(() => groupPhotosByLocation(photos), [photos]);

  return (
    <div className="map-panel">
      <MapContainer
        center={[36.3, 138.2]}
        zoom={5}
        zoomControl={false}
        className="map-canvas"
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={18}
        />
        <ZoomControl position="bottomright" />
        <FitPhotos groups={groups} />
        {groups.map((group) => (
          <Marker
            key={group.id}
            position={[group.latitude, group.longitude]}
            icon={markerIcon(group)}
            eventHandlers={{ click: () => onSelect(group) }}
          />
        ))}
      </MapContainer>

      <div className="map-summary glass-chip">
        <span className="live-dot" />
        {groups.length}か所・{photos.length}枚
      </div>

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
