import type { AlbumThemeSettings } from "./albumThemes";

export type PhotoSaveProgress =
  | "preparing"
  | "generating"
  | "sharing";

export type PhotoSaveResult =
  | { status: "shared" }
  | { status: "cancelled" }
  | { status: "manual"; file: File };

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export function photoFileName(capturedAt: string, type = "image/jpeg") {
  const date = new Date(capturedAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(safeDate);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `Eternal-memories_${value("year")}-${value("month")}-${value("day")}_${value("hour")}${value("minute")}${value("second")}.${extensionFor(type)}`;
}

export function isSupportedPhotoBlob(blob: Blob) {
  return blob.size > 0 && IMAGE_MIME_TYPES.has(blob.type.toLowerCase());
}

export function canSharePhoto(file: File) {
  const shareData: ShareData = { files: [file] };
  return (
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" ||
      navigator.canShare(shareData))
  );
}

export async function savePhotoToDevice(
  file: File,
  onProgress?: (progress: PhotoSaveProgress) => void,
): Promise<PhotoSaveResult> {
  const shareData: ShareData = {
    files: [file],
    title: "Eternal memories",
    text: "共有画面から「画像を保存」を選択してください",
  };
  if (!canSharePhoto(file)) return { status: "manual", file };

  onProgress?.("sharing");
  try {
    await navigator.share(shareData);
    return { status: "shared" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "cancelled" };
    }
    return { status: "manual", file };
  }
}

export function savePreparedPhotoAsFile(file: File) {
  const objectURL = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectURL;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectURL), 1_000);
}

export async function addClientWatermark(
  source: Blob,
  capturedAt: string,
  theme?: AlbumThemeSettings | null,
): Promise<File> {
  if (!isSupportedPhotoBlob(source)) {
    throw new Error("保存できる画像形式ではありません。");
  }

  const bitmap = await createImageBitmap(source, {
    imageOrientation: "from-image",
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("保存用画像を作成できませんでした。");
    context.drawImage(bitmap, 0, 0);

    const shortSide = Math.min(canvas.width, canvas.height);
    const configuredSize = Math.min(
      1.35,
      Math.max(0.75, theme?.downloadImage.watermarkSize ?? 1),
    );
    const fontSize = Math.round(
      Math.max(18, Math.min(54, shortSide * 0.035)) * configuredSize,
    );
    const padding = Math.round(Math.max(8, fontSize * 0.42));
    const margin = Math.round(Math.max(14, shortSide * 0.025));
    context.font = `600 ${fontSize}px Arial, sans-serif`;
    const text = "Eternal memories";
    const boxWidth = Math.ceil(context.measureText(text).width + padding * 2);
    const boxHeight = Math.ceil(fontSize + padding * 1.65);
    const position =
      theme?.downloadImage.watermarkPosition ?? "bottom-right";
    const x = position.endsWith("left")
      ? margin
      : Math.max(margin, canvas.width - margin - boxWidth);
    const y = position.startsWith("top")
      ? margin
      : Math.max(margin, canvas.height - margin - boxHeight);

    const backgroundOpacity = Math.min(
      0.4,
      Math.max(0.1, theme?.downloadImage.backgroundOpacity ?? 0.22),
    );
    const watermarkOpacity = Math.min(
      0.8,
      Math.max(0.35, theme?.downloadImage.watermarkOpacity ?? 0.68),
    );
    context.fillStyle = `rgba(0, 0, 0, ${backgroundOpacity})`;
    context.beginPath();
    context.roundRect(x, y, boxWidth, boxHeight, padding);
    context.fill();
    context.fillStyle = `rgba(255, 255, 255, ${watermarkOpacity})`;
    context.shadowColor = "rgba(0, 0, 0, 0.35)";
    context.shadowBlur = 2;
    context.fillText(text, x + padding, y + padding + fontSize * 0.8);

    const outputType = source.type.toLowerCase();
    const output = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("画像変換に失敗しました。")),
        outputType,
        outputType === "image/png" ? undefined : 0.92,
      );
    });
    return new File([output], photoFileName(capturedAt, output.type), {
      type: output.type,
    });
  } finally {
    bitmap.close();
  }
}
