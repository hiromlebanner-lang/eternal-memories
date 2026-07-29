export function MapAttribution() {
  return (
    <div className="map-attribution" aria-label="地図ライセンス">
      <span aria-hidden="true">© </span>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        OpenStreetMap contributors
      </a>
      <span aria-hidden="true"> | </span>
      <a
        href="https://leafletjs.com"
        target="_blank"
        rel="noreferrer"
      >
        Leaflet
      </a>
    </div>
  );
}
