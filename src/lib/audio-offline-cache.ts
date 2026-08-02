import { audioTimingsHref, type AudioClipManifest } from "@/lib/audio-manifest";
import type { ProgressSectionData, OutlineVolume } from "@/lib/reader-data";

// Version 1 stored every volume in one mutable cache. Keep reading it so an
// existing offline audiobook does not disappear after this upgrade. New
// packages use one immutable cache per completed volume version and a small
// metadata cache as the atomic active-version pointer.
export const offlineAudioCacheName = "coherence-offline-v1";
export const offlineReaderMetadataCacheName = "coherence-offline-metadata-v2";
export const offlineReaderPackCachePrefix = "coherence-offline-pack-v2";

export type OfflineAudioPack = {
  volumeId: string;
  title: string;
  numberLabel: string;
  href: string;
  packageVersion: string;
  sectionCount: number;
  audioClipCount: number;
  urls: string[];
};

export type OfflineAudioPackStatus = {
  cachedCount: number;
  totalCount: number;
  complete: boolean;
  // A newer reader, manuscript, or recording exists. The completed package on
  // the device remains usable until its replacement is fully verified.
  superseded: boolean;
  supersededCount: number;
};

export type OfflineAudioDownloadProgress = OfflineAudioPackStatus & {
  currentUrl?: string;
};

export type OfflineAudioPackRecord = {
  volumeId: string;
  href: string;
  packageVersion: string;
  cacheName: string;
  urls: string[];
  savedAt: string;
};

type LegacyOfflineAudioPackRecord = {
  volumeId: string;
  urls: string[];
  savedAt: string;
};

const offlinePackRecordPrefix = "https://coherence.invalid/__offline-pack__/";

function packRecordKey(volumeId: string): string {
  return `${offlinePackRecordPrefix}${encodeURIComponent(volumeId)}`;
}

function isOfflinePackRecord(value: unknown): value is OfflineAudioPackRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<OfflineAudioPackRecord>;
  return (
    typeof record.volumeId === "string" &&
    typeof record.href === "string" &&
    typeof record.packageVersion === "string" &&
    typeof record.cacheName === "string" &&
    Array.isArray(record.urls) &&
    record.urls.every((url) => typeof url === "string") &&
    typeof record.savedAt === "string"
  );
}

async function readRecordResponse(
  cache: Cache,
  volumeId: string,
): Promise<unknown | null> {
  try {
    const response = await cache.match(packRecordKey(volumeId));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function readPackRecord(
  volumeId: string,
): Promise<OfflineAudioPackRecord | null> {
  const cache = await caches.open(offlineReaderMetadataCacheName);
  const value = await readRecordResponse(cache, volumeId);
  return isOfflinePackRecord(value) ? value : null;
}

async function readAllPackRecords(): Promise<OfflineAudioPackRecord[]> {
  try {
    const cache = await caches.open(offlineReaderMetadataCacheName);
    const requests = await cache.keys();
    const records = await Promise.all(
      requests
        .filter((request) => request.url.startsWith(offlinePackRecordPrefix))
        .map(async (request) => {
          try {
            const response = await cache.match(request);
            const value: unknown = response ? await response.json() : null;
            return isOfflinePackRecord(value) ? value : null;
          } catch {
            return null;
          }
        }),
    );
    return records
      .filter((record): record is OfflineAudioPackRecord => record !== null)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  } catch {
    return [];
  }
}

async function readLegacyVolumeIds(): Promise<string[]> {
  try {
    const cache = await caches.open(offlineAudioCacheName);
    const requests = await cache.keys();
    const volumeIds = await Promise.all(
      requests
        .filter((request) => request.url.startsWith(offlinePackRecordPrefix))
        .map(async (request) => {
          try {
            const response = await cache.match(request);
            const value: unknown = response ? await response.json() : null;
            if (!value || typeof value !== "object" || Array.isArray(value)) {
              return null;
            }
            const volumeId = (value as Partial<LegacyOfflineAudioPackRecord>)
              .volumeId;
            return typeof volumeId === "string" ? volumeId : null;
          } catch {
            return null;
          }
        }),
    );
    return volumeIds.filter(
      (volumeId): volumeId is string => volumeId !== null,
    );
  } catch {
    return [];
  }
}

export async function offlineManuscriptHrefs(): Promise<string[]> {
  if (!("caches" in globalThis)) return [];
  const [records, legacyVolumeIds] = await Promise.all([
    readAllPackRecords(),
    readLegacyVolumeIds(),
  ]);
  return uniqueUrls([
    ...records.map((record) => record.href),
    ...legacyVolumeIds.map((volumeId) => `/manuscripts/${volumeId}/`),
  ]);
}

async function readLegacyPackRecord(
  volumeId: string,
): Promise<LegacyOfflineAudioPackRecord | null> {
  try {
    const cache = await caches.open(offlineAudioCacheName);
    const value = await readRecordResponse(cache, volumeId);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const record = value as Partial<LegacyOfflineAudioPackRecord>;
    if (!Array.isArray(record.urls)) return null;
    return {
      volumeId,
      urls: record.urls.filter((url): url is string => typeof url === "string"),
      savedAt: typeof record.savedAt === "string" ? record.savedAt : "",
    };
  } catch {
    return null;
  }
}

async function writePackRecord(record: OfflineAudioPackRecord): Promise<void> {
  const cache = await caches.open(offlineReaderMetadataCacheName);
  await cache.put(
    packRecordKey(record.volumeId),
    new Response(JSON.stringify(record), {
      headers: { "content-type": "application/json" },
    }),
  );
}

const sharedOfflineUrls = [
  "/",
  "/overview/",
  "/data/audio-manifest.json",
  "/data/bookmark-sections.json",
  "/data/breadcrumbs/index.json",
  "/data/outline.json",
  "/data/pdf-downloads.json",
  "/data/progress-sections.json",
  "/data/reader-sections.json",
  "/data/search-index.json",
];

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

function volumeIdFromHref(href: string): string {
  return href.split("/").filter(Boolean)[1] ?? href;
}

function clipVersionKey(sectionId: string, audioVersionId: string): string {
  return `${sectionId}:${audioVersionId}`;
}

function packageFingerprint(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function volumeRouteUrls(volume: OutlineVolume): string[] {
  return [
    volume.href,
    ...volume.parts.flatMap((part) => [
      part.href,
      ...part.chapters.map((chapter) => chapter.href),
    ]),
    ...volume.chapters.map((chapter) => chapter.href),
  ];
}

function coverUrls(coverImage: string): string[] {
  if (!coverImage) return [];
  const encoded = encodeURIComponent(coverImage);
  return [640, 1080].map(
    (width) => `/_next/image/?url=${encoded}&w=${width}&q=75`,
  );
}

export function buildOfflineAudioPacks(input: {
  readerVersion: string;
  volumes: OutlineVolume[];
  sections: ProgressSectionData[];
  manifest: AudioClipManifest;
}): OfflineAudioPack[] {
  const clipsByVersion = new Map<string, string[]>();
  const clipCountByVersion = new Map<string, number>();
  for (const voice of input.manifest.voices) {
    for (const clip of voice.sections) {
      const key = clipVersionKey(clip.sectionId, clip.audioVersionId);
      const current = clipsByVersion.get(key) ?? [];
      current.push(clip.href);
      const timingsHref = audioTimingsHref(clip);
      if (timingsHref) current.push(timingsHref);
      clipsByVersion.set(key, current);
      clipCountByVersion.set(key, (clipCountByVersion.get(key) ?? 0) + 1);
    }
  }

  return input.volumes.map((volume) => {
    const sections = input.sections.filter((section) =>
      section.href.startsWith(volume.href),
    );
    const clipUrls = sections.flatMap(
      (section) =>
        clipsByVersion.get(
          clipVersionKey(section.sectionId, section.audioVersionId),
        ) ?? [],
    );
    const routeUrls = uniqueUrls([
      ...volumeRouteUrls(volume),
      ...sections.flatMap((section) => [
        section.href,
        section.chapterHref,
        section.readerHref,
      ]),
    ]);
    const urls = uniqueUrls([
      ...sharedOfflineUrls,
      `/data/breadcrumbs/${volumeIdFromHref(volume.href)}.json`,
      ...coverUrls(volume.coverImage),
      ...routeUrls,
      ...clipUrls,
    ]);
    const packageVersion = packageFingerprint([
      input.readerVersion,
      volume.href,
      volume.coverImage,
      ...sections.flatMap((section) => [
        section.sectionId,
        section.contentHash,
        section.audioVersionId,
      ]),
      ...clipUrls,
    ]);
    return {
      volumeId: volumeIdFromHref(volume.href),
      title: volume.title,
      numberLabel: volume.numberLabel,
      href: volume.href,
      packageVersion,
      sectionCount: sections.length,
      audioClipCount: sections.reduce(
        (total, section) =>
          total +
          (clipCountByVersion.get(
            clipVersionKey(section.sectionId, section.audioVersionId),
          ) ?? 0),
        0,
      ),
      urls,
    };
  });
}

function cleanCacheNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function stagingCacheName(pack: OfflineAudioPack): string {
  return `${offlineReaderPackCachePrefix}-${cleanCacheNamePart(pack.volumeId)}-${pack.packageVersion}-${Date.now().toString(36)}`;
}

function localDependencyUrl(value: string): string | null {
  try {
    const origin =
      typeof window === "undefined"
        ? "https://coherence.invalid"
        : window.location.origin;
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    if (
      !url.pathname.startsWith("/_next/static/") &&
      !url.pathname.startsWith("/_next/image/") &&
      !url.pathname.startsWith("/art/")
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

async function responseDependencies(response: Response): Promise<string[]> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return [];
  const html = await response.clone().text();
  if (typeof DOMParser === "undefined") return [];
  const document = new DOMParser().parseFromString(html, "text/html");
  const candidates: string[] = [];
  for (const element of document.querySelectorAll(
    "link[href], script[src], img[src]",
  )) {
    const value = element.getAttribute("href") ?? element.getAttribute("src");
    if (value) candidates.push(value);
  }
  for (const element of document.querySelectorAll(
    "img[srcset], source[srcset]",
  )) {
    const value = element.getAttribute("srcset");
    if (!value) continue;
    candidates.push(
      ...value
        .split(",")
        .map((candidate) => candidate.trim().split(/\s+/)[0] ?? ""),
    );
  }
  return uniqueUrls(
    candidates
      .map(localDependencyUrl)
      .filter((url): url is string => url !== null),
  );
}

async function portableCacheResponse(response: Response): Promise<Response> {
  if (!response.redirected) return response.clone();
  // Next normalizes these public trailing-slash routes with a redirect. Cache
  // Storage preserves that internal redirected URL even when the fetch follows
  // it, and some browsers reject the response when a service worker later
  // returns it for the original offline navigation. Rebuilding the completed
  // response keeps the bytes and headers while removing the stale redirect
  // identity.
  return new Response(await response.clone().arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function cachedCount(
  cache: Cache,
  urls: readonly string[],
): Promise<number> {
  const cached = await Promise.all(
    urls.map((url) => cache.match(url).then((response) => Boolean(response))),
  );
  return cached.filter(Boolean).length;
}

export async function inspectOfflineAudioPack(
  pack: OfflineAudioPack,
): Promise<OfflineAudioPackStatus> {
  if (!("caches" in globalThis)) {
    return {
      cachedCount: 0,
      totalCount: pack.urls.length,
      complete: false,
      superseded: false,
      supersededCount: 0,
    };
  }

  const record = await readPackRecord(pack.volumeId);
  if (record) {
    const cache = await caches.open(record.cacheName);
    const count = await cachedCount(cache, record.urls);
    const complete =
      pack.audioClipCount > 0 &&
      record.urls.length > 0 &&
      count === record.urls.length;
    const superseded = record.packageVersion !== pack.packageVersion;
    return {
      cachedCount: count,
      totalCount: record.urls.length,
      complete,
      superseded,
      supersededCount: superseded ? 1 : 0,
    };
  }

  const legacy = await readLegacyPackRecord(pack.volumeId);
  if (legacy) {
    const cache = await caches.open(offlineAudioCacheName);
    const count = await cachedCount(cache, legacy.urls);
    return {
      cachedCount: count,
      totalCount: legacy.urls.length,
      complete:
        pack.audioClipCount > 0 &&
        legacy.urls.length > 0 &&
        count === legacy.urls.length,
      superseded: true,
      supersededCount: 1,
    };
  }

  return {
    cachedCount: 0,
    totalCount: pack.urls.length,
    complete: false,
    superseded: false,
    supersededCount: 0,
  };
}

export async function matchOfflineResponse(
  request: RequestInfo | URL,
): Promise<Response | undefined> {
  if (!("caches" in globalThis)) return undefined;
  for (const record of await readAllPackRecords()) {
    const response = await (await caches.open(record.cacheName)).match(request);
    if (response) return response;
  }
  try {
    return await (await caches.open(offlineAudioCacheName)).match(request);
  } catch {
    return undefined;
  }
}

export async function cacheOfflineAudioPack(
  pack: OfflineAudioPack,
  onProgress: (progress: OfflineAudioDownloadProgress) => void,
): Promise<OfflineAudioPackStatus> {
  if (!("caches" in globalThis)) {
    throw new Error("Offline downloads are not supported by this browser.");
  }

  const previous = await readPackRecord(pack.volumeId);
  const cacheName = stagingCacheName(pack);
  const cache = await caches.open(cacheName);
  const queue = [...pack.urls];
  const queued = new Set(queue);
  let cached = 0;
  let activated = false;

  try {
    for (let index = 0; index < queue.length; index += 1) {
      const url = queue[index]!;
      const response = await fetch(url, {
        cache: "reload",
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`Unable to download ${url}: ${response.status}`);
      }
      await cache.put(url, await portableCacheResponse(response));
      for (const dependency of await responseDependencies(response)) {
        if (queued.has(dependency)) continue;
        queued.add(dependency);
        queue.push(dependency);
      }
      cached += 1;
      onProgress({
        cachedCount: cached,
        totalCount: queue.length,
        complete: false,
        superseded: Boolean(previous),
        supersededCount: previous ? 1 : 0,
        currentUrl: url,
      });
    }

    const verifiedCount = await cachedCount(cache, queue);
    if (verifiedCount !== queue.length) {
      throw new Error(
        "The offline package could not be verified after download.",
      );
    }

    // This metadata write is the activation point. Until it succeeds, every
    // reader request continues to resolve against the previous complete cache.
    await writePackRecord({
      volumeId: pack.volumeId,
      href: pack.href,
      packageVersion: pack.packageVersion,
      cacheName,
      urls: queue,
      savedAt: new Date().toISOString(),
    });
    activated = true;
    if (previous?.cacheName && previous.cacheName !== cacheName) {
      // Cleanup is deliberately best effort after activation. A storage error
      // here may leave unreachable old bytes, but it must never make us delete
      // the newly active, fully verified package.
      await caches.delete(previous.cacheName).catch(() => false);
    }
  } catch (error) {
    if (!activated) await caches.delete(cacheName);
    throw error;
  }

  const status = await inspectOfflineAudioPack(pack);
  onProgress(status);
  return status;
}
