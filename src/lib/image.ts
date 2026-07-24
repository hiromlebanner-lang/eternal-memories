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

export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("写真を変換できませんでした。");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("写真を圧縮できませんでした。"));
      },
      "image/jpeg",
      0.84,
    );
  });
}
