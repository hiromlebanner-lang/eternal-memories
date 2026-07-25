import type { AlbumPhoto, PhotoLocationGroup } from "../types";

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceInMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function groupPhotosByLocation(
  photos: AlbumPhoto[],
  thresholdMeters = 60,
): PhotoLocationGroup[] {
  if (thresholdMeters <= 0) {
    return photos.map((photo) => ({
      id: photo.id,
      latitude: photo.latitude,
      longitude: photo.longitude,
      photos: [photo],
    }));
  }

  type Bucket = { anchor: AlbumPhoto; photos: AlbumPhoto[] };
  const buckets: Bucket[] = [];
  const grid = new Map<string, number[]>();
  const toCartesianCell = (photo: AlbumPhoto) => {
    const latitude = (photo.latitude * Math.PI) / 180;
    const longitude = (photo.longitude * Math.PI) / 180;
    const radiusAtLatitude = EARTH_RADIUS_METERS * Math.cos(latitude);
    const x = radiusAtLatitude * Math.cos(longitude);
    const y = radiusAtLatitude * Math.sin(longitude);
    const z = EARTH_RADIUS_METERS * Math.sin(latitude);
    return [
      Math.floor(x / thresholdMeters),
      Math.floor(y / thresholdMeters),
      Math.floor(z / thresholdMeters),
    ] as const;
  };
  const key = (x: number, y: number, z: number) => `${x}:${y}:${z}`;

  for (const photo of photos) {
    const [cellX, cellY, cellZ] = toCartesianCell(photo);
    let nearestBucket = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let x = cellX - 1; x <= cellX + 1; x += 1) {
      for (let y = cellY - 1; y <= cellY + 1; y += 1) {
        for (let z = cellZ - 1; z <= cellZ + 1; z += 1) {
          for (const bucketIndex of grid.get(key(x, y, z)) ?? []) {
            const distance = distanceInMeters(
              buckets[bucketIndex].anchor,
              photo,
            );
            if (distance <= thresholdMeters && distance < nearestDistance) {
              nearestBucket = bucketIndex;
              nearestDistance = distance;
            }
          }
        }
      }
    }

    if (nearestBucket >= 0) {
      buckets[nearestBucket].photos.push(photo);
    } else {
      const nextIndex = buckets.length;
      buckets.push({ anchor: photo, photos: [photo] });
      const cellKey = key(cellX, cellY, cellZ);
      grid.set(cellKey, [...(grid.get(cellKey) ?? []), nextIndex]);
    }
  }

  return buckets.map(({ photos: groupPhotos }) => ({
    id: groupPhotos[0].id,
    latitude:
      groupPhotos.reduce((sum, photo) => sum + photo.latitude, 0) /
      groupPhotos.length,
    longitude:
      groupPhotos.reduce((sum, photo) => sum + photo.longitude, 0) /
      groupPhotos.length,
    photos: groupPhotos.sort(
      (first, second) =>
        new Date(second.captured_at).getTime() -
        new Date(first.captured_at).getTime(),
    ),
  }));
}

export function getCurrentPosition(): Promise<{
  latitude: number;
  longitude: number;
}> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("この端末では位置情報を利用できません。"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      () => reject(new Error("位置情報を取得できませんでした。端末の設定を確認してください。")),
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 30_000,
      },
    );
  });
}
