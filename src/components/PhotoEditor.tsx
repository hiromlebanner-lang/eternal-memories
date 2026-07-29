import L from "leaflet";
import {
  Camera,
  Check,
  ImagePlus,
  LocateFixed,
  MapPin,
  Navigation,
  Trash2,
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
import type {
  AlbumPhoto,
  PhotoCategory,
  PhotoUploadFailure,
} from "../types";
import { CATEGORY_META } from "../types";
import { Modal } from "./Modal";
import { MapAttribution } from "./MapAttribution";

interface PhotoEditorValues {
  files?: File[];
  title: string;
  caption: string;
  category: PhotoCategory;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  visibility: "album_only" | "global";
}

interface PhotoEditorProps {
  photo?: AlbumPhoto;
  hasAlbum?: boolean;
  initialVisibility?: "album_only" | "global";
  onClose: () => void;
  onSave: (
    values: PhotoEditorValues,
    onProgress: (completed: number, total: number) => void,
  ) => Promise<PhotoUploadFailure[]>;
}

interface SelectedFile {
  file: File;
  previewURL: string;
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

export function PhotoEditor({
  photo,
  hasAlbum = true,
  initialVisibility = "album_only",
  onClose,
  onSave,
}: PhotoEditorProps) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const selectionRequest = useRef(0);
  const selectedFilesRef = useRef<SelectedFile[]>([]);

  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [title, setTitle] = useState(photo?.title ?? "");
  const [caption, setCaption] = useState(photo?.caption ?? "");
  const [category, setCategory] = useState<PhotoCategory>(photo?.category ?? "scenery");
  const [visibility, setVisibility] = useState<"album_only" | "global">(
    photo?.visibility === "global"
      ? "global"
      : hasAlbum
        ? initialVisibility
        : "global",
  );
  const [capturedAt, setCapturedAt] = useState(
    toInputDate(photo?.captured_at ?? new Date()),
  );
  const [latitude, setLatitude] = useState<number | null>(photo?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(photo?.longitude ?? null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState("");

  const activeSelection = selectedFiles[activeIndex];
  const previewURL = photo?.image_url ?? activeSelection?.previewURL ?? "";

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(
    () => () => {
      selectedFilesRef.current.forEach((item) =>
        URL.revokeObjectURL(item.previewURL),
      );
    },
    [],
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
      if (hasAlbum) {
        setError(caught instanceof Error ? caught.message : "位置情報を取得できません。");
      }
    } finally {
      if (requestID === selectionRequest.current) setLocating(false);
    }
  };

  const addFiles = async (fileList?: FileList | null) => {
    if (!fileList?.length) return;
    const known = new Set(
      selectedFiles.map(
        ({ file: selected }) =>
          `${selected.name}:${selected.size}:${selected.lastModified}`,
      ),
    );
    const additions = Array.from(fileList).filter((selected) => {
      const key = `${selected.name}:${selected.size}:${selected.lastModified}`;
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
    if (selectedFiles.length + additions.length > 20) {
      setError("一度に選択できる写真は20枚までです。");
      return;
    }
    if (additions.length === 0) {
      setError("同じ写真はすでに選択されています。");
      return;
    }
    const next = [
      ...selectedFiles,
      ...additions.map((selected) => ({
        file: selected,
        previewURL: URL.createObjectURL(selected),
      })),
    ];
    setSelectedFiles(next);
    const nextIndex = selectedFiles.length;
    setActiveIndex(nextIndex);
    await chooseFile(next[nextIndex].file);
  };

  const removeSelectedFile = (index: number) => {
    const target = selectedFiles[index];
    if (!target) return;
    URL.revokeObjectURL(target.previewURL);
    const next = selectedFiles.filter((_, candidateIndex) => candidateIndex !== index);
    setSelectedFiles(next);
    setActiveIndex((current) => Math.min(current, Math.max(0, next.length - 1)));
    if (next.length === 0) {
      setLatitude(null);
      setLongitude(null);
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
    if (!photo && selectedFiles.length === 0) {
      setError("写真を撮影するか、ライブラリから選択してください。");
      return;
    }
    if (hasAlbum && (latitude == null || longitude == null)) {
      setError("撮影場所を取得または地図で指定してください。");
      return;
    }
    if ((latitude == null) !== (longitude == null)) {
      setError("撮影場所の緯度・経度が正しくありません。");
      return;
    }
    if (
      latitude != null &&
      longitude != null &&
      (!Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180)
    ) {
      setError("撮影場所の緯度・経度が正しくありません。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        files: photo ? undefined : selectedFiles.map((item) => item.file),
        title: title.trim(),
        caption: caption.trim(),
        category,
        capturedAt: new Date(capturedAt).toISOString(),
        latitude,
        longitude,
        visibility,
      }, (completed, total) => {
        setUploadProgress({ completed, total });
      }).then((failures) => {
        if (failures.length === 0) {
          onClose();
          return;
        }
        const failed = new Set(failures.map((failure) => failure.file));
        setSelectedFiles((current) => {
          current
            .filter((item) => !failed.has(item.file))
            .forEach((item) => URL.revokeObjectURL(item.previewURL));
          return current.filter((item) => failed.has(item.file));
        });
        setActiveIndex(0);
        setError(
          [
            `${selectedFiles.length}枚中 ${selectedFiles.length - failures.length}枚保存成功・${failures.length}枚失敗`,
            ...failures.map(
              (failure) => `${failure.file.name}: ${failure.reason}`,
            ),
            "失敗した写真だけ再試行できます。",
          ].join("\n"),
        );
      });
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
            <>
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
                  onChange={(event) => void addFiles(event.target.files)}
                />
                <input
                  ref={libraryInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => void addFiles(event.target.files)}
                />
              </div>
              {selectedFiles.length > 0 ? (
                <div className="selected-photo-list">
                  <strong>{selectedFiles.length}枚選択中</strong>
                  <div>
                    {selectedFiles.map((item, index) => (
                      <button
                        key={`${item.file.name}:${item.file.lastModified}`}
                        type="button"
                        className={activeIndex === index ? "is-active" : ""}
                        onClick={() => {
                          setActiveIndex(index);
                          void chooseFile(item.file);
                        }}
                      >
                        <img src={item.previewURL} alt="" />
                        <span
                          role="button"
                          aria-label={`${item.file.name}を選択から削除`}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeSelectedFile(index);
                          }}
                        >
                          <Trash2 size={13} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="photo-editor__fields">
          <label className="field">
            <span>タイトル</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="思い出のタイトル"
              maxLength={120}
            />
          </label>

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

          <fieldset className="visibility-picker">
            <legend>投稿先</legend>
            {hasAlbum ? (
              <>
                <label>
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === "album_only"}
                    onChange={() => setVisibility("album_only")}
                  />
                  このアルバムのみ
                </label>
                <label>
                  <input
                    type="radio"
                    name="visibility"
                    checked={visibility === "global"}
                    onChange={() => setVisibility("global")}
                  />
                  みんなへ投稿（このアルバムにも表示）
                </label>
              </>
            ) : (
              <label>
                <input type="radio" name="visibility" checked readOnly />
                みんなへ投稿
              </label>
            )}
            {!hasAlbum ? (
              <p>
                参加中のアルバムはありません。この写真は「みんな」へ投稿できます。
              </p>
            ) : visibility === "global" ? (
              <p>
                この写真は、アルバムの参加者以外のログインユーザーにも表示されます。
              </p>
            ) : null}
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
                    : hasAlbum
                      ? "まだ取得できていません"
                      : "位置情報なしでも投稿できます"}
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
                attributionControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  detectRetina
                  keepBuffer={3}
                  maxNativeZoom={19}
                  maxZoom={19}
                  updateWhenZooming={false}
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
              <MapAttribution />
              <span className="location-map__hint">
                <Navigation size={13} />
                地図をタップして調整
              </span>
            </div>
          </div>

          {error ? <p className="form-message form-message--error">{error}</p> : null}

          {saving && uploadProgress.total > 0 ? (
            <div className="upload-progress" aria-live="polite">
              <div>
                <span
                  style={{
                    width: `${Math.round(
                      (uploadProgress.completed / uploadProgress.total) * 100,
                    )}%`,
                  }}
                />
              </div>
              <p>
                {uploadProgress.completed} / {uploadProgress.total}枚をアップロード中
              </p>
            </div>
          ) : null}

          <button className="primary-button" type="submit" disabled={saving || locating}>
            <Check size={18} />
            {saving
              ? uploadProgress.total > 0
                ? `${uploadProgress.completed} / ${uploadProgress.total}枚をアップロード中`
                : "保存しています…"
              : photo
                ? "変更を保存"
                : hasAlbum
                  ? "アルバムに追加"
                  : "みんなへ投稿"}
          </button>
          <p className="privacy-note">
            <MapPin size={14} />
            {hasAlbum
              ? "位置情報はこの共有アルバムのメンバーだけが閲覧できます。"
              : "位置情報は許可した場合のみ写真に追加されます。"}
          </p>
        </div>
      </form>
    </Modal>
  );
}
