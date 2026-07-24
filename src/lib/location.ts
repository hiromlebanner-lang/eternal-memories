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
  const parents = photos.map((_, index) => index);

  const find = (index: number): number => {
    let current = index;
    while (parents[current] !== current) current = parents[current];
    return current;
  };

  const unite = (first: number, second: number) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parents[secondRoot] = firstRoot;
  };

  photos.forEach((photo, firstIndex) => {
    for (let secondIndex = firstIndex + 1; secondIndex < photos.length; secondIndex += 1) {
      if (distanceInMeters(photo, photos[secondIndex]) <= thresholdMeters) {
        unite(firstIndex, secondIndex);
      }
    }
  });

  const buckets = new Map<number, AlbumPhoto[]>();
  photos.forEach((photo, index) => {
    const root = find(index);
    buckets.set(root, [...(buckets.get(root) ?? []), photo]);
  });

  return [...buckets.values()].map((groupPhotos) => ({
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
