import { del, get, keys, set } from "idb-keyval";
import type { Album, AlbumPhoto, PhotoCategory } from "../types";

const CACHE_VERSION = "v2";
const queueKey = (userID: string) => `mapalbum:sync-queue:${userID}`;
const lastSyncKey = (userID: string) => `mapalbum:last-sync:${userID}`;
const offlineAlbumKey = (userID: string, albumID: string) =>
  `mapalbum:offline-album:${userID}:${albumID}`;
const offlineIndexKey = (userID: string) =>
  `mapalbum:offline-album-index:${userID}`;
const runtimeMediaCacheName = `mapalbum-photo-cache-${CACHE_VERSION}`;
const pinnedMediaCacheName = (userID: string) =>
  `mapalbum-user-media-${CACHE_VERSION}-${userID}`;
const canUseIndexedDB = () => typeof indexedDB !== "undefined";

export interface OfflinePhotoPayload {
  albumID: string | null;
  authorID: string;
  authorName: string;
  file: File;
  title: string;
  caption: string;
  category: PhotoCategory;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  visibility: "album_only" | "global";
  photoID: string;
}

export interface OfflineQueueItem {
  id: string;
  kind: "photo-upload";
  userID: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  payload: OfflinePhotoPayload;
}

interface OfflineAlbumSnapshot {
  album: Album;
  photos: AlbumPhoto[];
  cachedURLs: string[];
  savedAt: string;
}

export interface OfflineStats {
  cacheBytes: number;
  savedPhotos: number;
  savedAlbums: number;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
}

async function readQueue(userID: string) {
  if (!canUseIndexedDB()) return [];
  return (await get<OfflineQueueItem[]>(queueKey(userID))) ?? [];
}

export async function queueOfflinePhoto(
  userID: string,
  payload: OfflinePhotoPayload,
) {
  if (!canUseIndexedDB()) {
    throw new Error("この端末ではオフライン投稿を利用できません。");
  }
  const queue = await readQueue(userID);
  const item: OfflineQueueItem = {
    id: payload.photoID,
    kind: "photo-upload",
    userID,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    payload,
  };
  if (!queue.some((candidate) => candidate.id === item.id)) {
    queue.push(item);
    await set(queueKey(userID), queue);
  }
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const syncManager = (
        registration as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        }
      ).sync;
      await syncManager?.register("mapalbum-sync");
    } catch {
      // iOS WebKitなどの非対応環境は起動時・オンライン復帰時同期へ委ねる。
    }
  }
  return item;
}

export async function flushOfflineQueue(
  userID: string,
  upload: (payload: OfflinePhotoPayload) => Promise<void>,
  onProgress?: (completed: number, total: number) => void,
) {
  const queue = await readQueue(userID);
  const remaining: OfflineQueueItem[] = [];
  let completed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await upload(item.payload);
      completed += 1;
    } catch (error) {
      failed += 1;
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "同期に失敗しました",
      });
    }
    onProgress?.(completed + failed, queue.length);
  }

  await set(queueKey(userID), remaining);
  if (failed === 0) {
    await set(lastSyncKey(userID), new Date().toISOString());
  }
  return { completed, failed, pending: remaining.length };
}

export async function cacheAlbumForOffline(
  userID: string,
  album: Album,
  photos: AlbumPhoto[],
  onProgress?: (completed: number, total: number) => void,
) {
  if (!canUseIndexedDB()) {
    throw new Error("この端末ではオフライン保存を利用できません。");
  }
  if (!("caches" in window)) {
    throw new Error("この端末ではオフライン保存を利用できません。");
  }
  const estimate = await navigator.storage?.estimate?.();
  if (
    estimate?.quota &&
    estimate.usage &&
    estimate.usage / estimate.quota > 0.9
  ) {
    throw new Error(
      "端末の保存容量が不足しています。不要なキャッシュを削除してください。",
    );
  }

  const urls = [
    album.cover_url,
    ...photos.map((photo) => photo.image_url),
    ...photos.map((photo) => photo.author_avatar_url),
  ].filter((url): url is string => Boolean(url));
  const uniqueURLs = [...new Set(urls)];
  const [runtimeCache, pinnedCache] = await Promise.all([
    caches.open(runtimeMediaCacheName),
    caches.open(pinnedMediaCacheName(userID)),
  ]);
  let completed = 0;
  for (const url of uniqueURLs) {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) {
      throw new Error("写真のオフライン保存に失敗しました。");
    }
    await Promise.all([
      runtimeCache.put(url, response.clone()),
      pinnedCache.put(url, response),
    ]);
    completed += 1;
    onProgress?.(completed, uniqueURLs.length);
  }

  const snapshot: OfflineAlbumSnapshot = {
    album: { ...album, offline_enabled: true },
    photos,
    cachedURLs: uniqueURLs,
    savedAt: new Date().toISOString(),
  };
  await set(offlineAlbumKey(userID, album.id), snapshot);
  const index = new Set(
    (await get<string[]>(offlineIndexKey(userID))) ?? [],
  );
  index.add(album.id);
  await set(offlineIndexKey(userID), [...index]);
  return { savedPhotos: photos.length, savedFiles: uniqueURLs.length };
}

export async function removeAlbumOffline(userID: string, albumID: string) {
  if (!canUseIndexedDB()) return;
  const index = new Set(
    (await get<string[]>(offlineIndexKey(userID))) ?? [],
  );
  const snapshot = await get<OfflineAlbumSnapshot>(
    offlineAlbumKey(userID, albumID),
  );
  if (snapshot && "caches" in window) {
    const otherSnapshots = await Promise.all(
      [...index]
        .filter((candidateID) => candidateID !== albumID)
        .map((candidateID) =>
          get<OfflineAlbumSnapshot>(
            offlineAlbumKey(userID, candidateID),
          ),
        ),
    );
    const urlsStillNeeded = new Set(
      otherSnapshots.flatMap((candidate) => candidate?.cachedURLs ?? []),
    );
    const [runtimeCache, pinnedCache] = await Promise.all([
      caches.open(runtimeMediaCacheName),
      caches.open(pinnedMediaCacheName(userID)),
    ]);
    await Promise.allSettled(
      snapshot.cachedURLs
        .filter((url) => !urlsStillNeeded.has(url))
        .flatMap((url) => [
          runtimeCache.delete(url),
          pinnedCache.delete(url),
        ]),
    );
  }
  await del(offlineAlbumKey(userID, albumID));
  index.delete(albumID);
  await set(offlineIndexKey(userID), [...index]);
}

export async function getOfflineStats(userID: string): Promise<OfflineStats> {
  if (!canUseIndexedDB()) {
    return {
      cacheBytes: 0,
      savedPhotos: 0,
      savedAlbums: 0,
      pendingCount: 0,
      failedCount: 0,
      lastSyncAt: null,
    };
  }
  const index = (await get<string[]>(offlineIndexKey(userID))) ?? [];
  const snapshots = await Promise.all(
    index.map((albumID) =>
      get<OfflineAlbumSnapshot>(offlineAlbumKey(userID, albumID)),
    ),
  );
  const queue = await readQueue(userID);
  const estimate = await navigator.storage?.estimate?.();
  return {
    cacheBytes: estimate?.usage ?? 0,
    savedPhotos: snapshots.reduce(
      (total, snapshot) => total + (snapshot?.photos.length ?? 0),
      0,
    ),
    savedAlbums: snapshots.filter(Boolean).length,
    pendingCount: queue.length,
    failedCount: queue.filter((item) => item.attempts > 0).length,
    lastSyncAt: (await get<string>(lastSyncKey(userID))) ?? null,
  };
}

export async function getOfflineAlbumIDs(userID: string) {
  if (!canUseIndexedDB()) return new Set<string>();
  return new Set((await get<string[]>(offlineIndexKey(userID))) ?? []);
}

export async function restorePinnedOfflineMedia(userID: string) {
  if (!("caches" in window)) return;
  const [runtimeCache, pinnedCache] = await Promise.all([
    caches.open(runtimeMediaCacheName),
    caches.open(pinnedMediaCacheName(userID)),
  ]);
  const requests = await pinnedCache.keys();
  await Promise.allSettled(
    requests.map(async (request) => {
      if (await runtimeCache.match(request)) return;
      const response = await pinnedCache.match(request);
      if (response) await runtimeCache.put(request, response);
    }),
  );
}

export async function clearOfflineCache(userID: string) {
  if (!canUseIndexedDB()) return;
  const storedKeys = await keys();
  await Promise.all(
    storedKeys
      .filter(
        (key): key is string =>
          typeof key === "string" &&
          (key.startsWith(`mapalbum:offline-album:${userID}:`) ||
            key === offlineIndexKey(userID)),
      )
      .map((key) => del(key)),
  );
  if ("caches" in window) {
    await Promise.allSettled([
      caches.delete(pinnedMediaCacheName(userID)),
      caches.delete(runtimeMediaCacheName),
    ]);
  }
}
