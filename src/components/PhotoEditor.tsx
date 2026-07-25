import L from "leaflet";
import {
  Camera,
  Check,
  ImagePlus,
  LocateFixed,
  MapPin,
  Navigation,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { getCurrentPosition } from "../lib/location";
import { readPhotoMetadata } from "../lib/image";
import type { AlbumPhoto, PhotoCategory } from "../types";
import { CATEGORY_META } from "../types";
import { Modal } from "./Modal";

interface PhotoEditorValues {
  file?: File;
  caption: string;
  category: PhotoCategory;
  capturedAt: string;
  latitude: number;
  longitude: number;
}

interface PhotoEditorProps {
  photo?: AlbumPhoto;
  onClose: () => void;
  onSave: (values: PhotoEditorValues) => Promise<void>;
}

function toInputDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function LocationEvents({
  onPick,
}: {
  onPick: (latitude: number, longitude: number) => void;
}) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function Recenter({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], Math.max(map.getZoom(), 13));
  }, [latitude, longitude, map]);
  return null;
}

export function PhotoEditor({ photo, onClose, onSave }: PhotoEditorProps) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const selectionRequest = useRef(0);

  const [file, setFile] = useState<File>();
  const [previewURL, setPreviewURL] = useState(photo?.image_url ?? "");
  const [caption, setCaption] = useState(photo?.caption ?? "");
  const [category, setCategory] = useState<PhotoCategory>(photo?.category ?? "scenery");
  const [capturedAt, setCapturedAt] = useState(
    toInputDate(photo?.captured_at ?? new Date()),
  );
  const [latitude, setLatitude] = useState<number | null>(photo?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(photo?.longitude ?? null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(
    () => () => {
      if (file && previewURL.startsWith("blob:")) URL.revokeObjectURL(previewURL);
    },
    [file, previewURL],
  );

  const marker = useMemo(
    () =>
      L.divIcon({
        className: "location-picker-icon",
        iconSize: [46, 52],
        iconAnchor: [23, 48],
        html: `<span style="background:${CATEGORY_META[category].color}">${CATEGORY_META[category].emoji}</span>`,
      }),
    [category],
  );

  const chooseFile = async (selected?: File) => {
    if (!selected) return;
    const requestID = ++selectionRequest.current;
    setError("");
    setFile(selected);
    if (previewURL.startsWith("blob:")) URL.revokeObjectURL(previewURL);
    setPreviewURL(URL.createObjectURL(selected));
    setCapturedAt(toInputDate(new Date()));
    setLatitude(null);
    setLongitude(null);
    setLocating(true);

    try {
      const metadata = await readPhotoMetadata(selected);
      if (requestID !== selectionRequest.current) return;
      if (metadata.capturedAt) setCapturedAt(toInputDate(metadata.capturedAt));
      if (metadata.latitude != null && metadata.longitude != null) {
        setLatitude(metadata.latitude);
        setLongitude(metadata.longitude);
        return;
      }

      const position = await getCurrentPosition();
      if (requestID !== selectionRequest.current) return;
      setLatitude(position.latitude);
      setLongitude(position.longitude);
    } catch (caught) {
      if (requestID !== selectionRequest.current) return;
      setError(caught instanceof Error ? caught.message : "位置情報を取得できません。");
    } finally {
      if (requestID === selectionRequest.current) setLocating(false);
    }
  };

  const locateNow = async () => {
    setLocating(true);
    setError("");
    try {
      const position = await getCurrentPosition();
      setLatitude(position.latitude);
      setLongitude(position.longitude);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "位置情報を取得できません。");
    } finally {
      setLocating(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!photo && !file) {
      setError("写真を撮影するか、ライブラリから選択してください。");
      return;
    }
    if (latitude == null || longitude == null) {
      setError("撮影場所を取得または地図で指定してください。");
      return;
    }
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError("撮影場所の緯度・経度が正しくありません。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        file,
        caption: caption.trim(),
        category,
        capturedAt: new Date(capturedAt).toISOString(),
        latitude,
        longitude,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={photo ? "写真を編集" : "写真を追加"} onClose={onClose} size="wide">
      <form className="photo-editor" onSubmit={submit}>
        <div className="photo-editor__media">
          {previewURL ? (
            <img src={previewURL} alt="選択した写真のプレビュー" />
          ) : (
            <div className="photo-editor__placeholder">
              <ImagePlus size={38} />
              <strong>写真を追加してください</strong>
              <span>カメラで撮影するか、写真ライブラリから選べます。</span>
            </div>
          )}

          {!photo ? (
            <div className="photo-source-actions">
              <button type="button" onClick={() => cameraInput.current?.click()}>
                <Camera size={18} />
                撮影する
              </button>
              <button type="button" onClick={() => libraryInput.current?.click()}>
                <ImagePlus size={18} />
                写真を選ぶ
              </button>
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
              <input
                ref={libraryInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
            </div>
          ) : null}
        </div>

        <div className="photo-editor__fields">
          <label className="field">
            <span>コメント</span>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="この場所での思い出を書いてください"
              rows={3}
              maxLength={500}
            />
          </label>

          <fieldset className="category-picker">
            <legend>カテゴリー</legend>
            <div>
              {(Object.keys(CATEGORY_META) as PhotoCategory[]).map((key) => {
                const meta = CATEGORY_META[key];
                return (
                  <label
                    key={key}
                    className={category === key ? "is-selected" : ""}
                    style={{ "--category-color": meta.color } as React.CSSProperties}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={key}
                      checked={category === key}
                      onChange={() => setCategory(key)}
                    />
                    <span>{meta.emoji}</span>
                    {meta.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="field">
            <span>撮影日時</span>
            <input
              type="datetime-local"
              value={capturedAt}
              onChange={(event) => setCapturedAt(event.target.value)}
              required
            />
          </label>

          <div className="location-section">
            <div className="section-heading">
              <div>
                <span>撮影場所</span>
                <small>
                  {latitude != null && longitude != null
                    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                    : "まだ取得できていません"}
                </small>
              </div>
              <button type="button" onClick={() => void locateNow()} disabled={locating}>
                <LocateFixed size={17} />
                {locating ? "取得中…" : "現在地"}
              </button>
            </div>

            <div className="location-map">
              <MapContainer
                center={[latitude ?? 36.3, longitude ?? 138.2]}
                zoom={latitude != null ? 13 : 5}
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationEvents
                  onPick={(nextLatitude, nextLongitude) => {
                    setLatitude(nextLatitude);
                    setLongitude(nextLongitude);
                  }}
                />
                {latitude != null && longitude != null ? (
                  <>
                    <Recenter latitude={latitude} longitude={longitude} />
                    <Marker position={[latitude, longitude]} icon={marker} />
                  </>
                ) : null}
              </MapContainer>
              <span className="location-map__hint">
                <Navigation size={13} />
                地図をタップして調整
              </span>
            </div>
          </div>

          {error ? <p className="form-message form-message--error">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={saving || locating}>
            <Check size={18} />
            {saving ? "保存しています…" : photo ? "変更を保存" : "アルバムに追加"}
          </button>
          <p className="privacy-note">
            <MapPin size={14} />
            位置情報はこの共有アルバムのメンバーだけが閲覧できます。
          </p>
        </div>
      </form>
    </Modal>
  );
}
