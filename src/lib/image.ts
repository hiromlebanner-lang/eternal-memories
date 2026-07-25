import * as exifr from "exifr";

export async function readPhotoMetadata(file: File): Promise<{
  capturedAt?: Date;
  latitude?: number;
  longitude?: number;
}> {
  try {
    const metadata = await exifr.parse(file, {
      gps: true,
      pick: [
        "DateTimeOriginal",
        "CreateDate",
        "latitude",
        "longitude",
        "GPSLatitude",
        "GPSLongitude",
      ],
    });

    return {
      capturedAt: metadata?.DateTimeOriginal ?? metadata?.CreateDate,
      latitude: metadata?.latitude,
      longitude: metadata?.longitude,
    };
  } catch {
    return {};
  }
}

export async function compressPhoto(
  file: File,
  options?: { square?: boolean; maxDimension?: number; quality?: number },
): Promise<Blob> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup: () => void;

  try {
    if (typeof createImageBitmap !== "function") throw new Error("unsupported");
    const bitmap = await createImageBitmap(file);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    cleanup = () => bitmap.close();
  } catch {
    const objectURL = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.src = objectURL;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(objectURL);
      throw new Error(
        "この写真形式を読み込めませんでした。iPhoneでは「互換性優先」で撮影するか、JPEGへ変換してお試しください。",
      );
    }
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
    cleanup = () => URL.revokeObjectURL(objectURL);
  }

  const sourceSize = options?.square ? Math.min(width, height) : undefined;
  const sourceX = sourceSize ? (width - sourceSize) / 2 : 0;
  const sourceY = sourceSize ? (height - sourceSize) / 2 : 0;
  const sourceWidth = sourceSize ?? width;
  const sourceHeight = sourceSize ?? height;
  const maxDimension = options?.maxDimension ?? 1800;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    cleanup();
    throw new Error("写真を変換できませんでした。");
  }
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );
  cleanup();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("写真を圧縮できませんでした。"));
      },
      "image/jpeg",
      options?.quality ?? 0.84,
    );
  });
}
