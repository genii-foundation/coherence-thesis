import { audioTimingsHref, type AudioClipManifest } from "@/lib/audio-manifest";
import type { ProgressSectionData, OutlineVolume } from "@/lib/reader-data";

// Version 1 stored every volume in one mutable cache. Keep reading it so an
// existing offline audiobook does not disappear after this upgrade. New
// packages use one immutable cache per completed volume version and a small
// metadata cache as the atomic active-version pointer.
export const offlineAudioCacheName = "coherence-offline-v1";
export const offlineReaderMetadataCacheName = "coherence-offline-metadata-v2";
export const offlineReaderPackCachePrefix = "coherence-offline-pack-v2";
const publisherEmbeddedAuthoritySchemaVersion = 3;
const sha256Identity = /^sha256:[0-9a-f]{64}$/u;
const offlineInstallBypassParameter = "__coherence_offline_install";

export type OfflineAudioRuntimeMode =
  | Readonly<{ kind: "coherence-reader" }>
  | Readonly<{
      buildId: string;
      kind: "publisher-embedded";
    }>
  | Readonly<{ kind: "unavailable" }>;

export type PublisherEmbeddedOfflineRuntimeAuthority = Readonly<{
  buildId: string;
  kind: "publisher-embedded";
  schemaVersion: typeof publisherEmbeddedAuthoritySchemaVersion;
}>;

export type OfflineAudioPack = {
  volumeId: string;
  title: string;
  numberLabel: string;
  href: string;
  packageVersion: string;
  sectionCount: number;
  audioClipCount: number;
  urls: string[];
  publisherDocumentHrefs?: string[];
  publisherRuntimeAuthority?: PublisherEmbeddedOfflineRuntimeAuthority;
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

type OfflineAudioPackRecordV2 = {
  volumeId: string;
  href: string;
  packageVersion: string;
  cacheName: string;
  urls: string[];
  savedAt: string;
};

export type OfflineAudioPackRecord = OfflineAudioPackRecordV2 & {
  publisherRuntimeAuthority: PublisherEmbeddedOfflineRuntimeAuthority;
  schemaVersion: typeof publisherEmbeddedAuthoritySchemaVersion;
};

type ReadableOfflineAudioPackRecord =
  | OfflineAudioPackRecordV2
  | OfflineAudioPackRecord;

type LegacyOfflineAudioPackRecord = {
  volumeId: string;
  urls: string[];
  savedAt: string;
};

const offlinePackRecordPrefix = "https://coherence.invalid/__offline-pack__/";

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function packRecordKey(volumeId: string): string {
  return `${offlinePackRecordPrefix}${encodeURIComponent(volumeId)}`;
}

function isOfflinePackRecordV2(
  value: unknown,
): value is OfflineAudioPackRecordV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if ("schemaVersion" in value || "publisherRuntimeAuthority" in value) {
    return false;
  }
  if (
    !exactKeys(value, [
      "cacheName",
      "href",
      "packageVersion",
      "savedAt",
      "urls",
      "volumeId",
    ])
  ) {
    return false;
  }
  const record = value as Partial<OfflineAudioPackRecordV2>;
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

function isPublisherRuntimeAuthority(
  value: unknown,
): value is PublisherEmbeddedOfflineRuntimeAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const authority = value as Partial<PublisherEmbeddedOfflineRuntimeAuthority>;
  return (
    exactKeys(value, ["buildId", "kind", "schemaVersion"]) &&
    authority.schemaVersion === publisherEmbeddedAuthoritySchemaVersion &&
    authority.kind === "publisher-embedded" &&
    typeof authority.buildId === "string" &&
    sha256Identity.test(authority.buildId)
  );
}

function isOfflinePackRecord(value: unknown): value is OfflineAudioPackRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    exactKeys(value, [
      "cacheName",
      "href",
      "packageVersion",
      "publisherRuntimeAuthority",
      "savedAt",
      "schemaVersion",
      "urls",
      "volumeId",
    ]) &&
    (() => {
      const record = value as OfflineAudioPackRecord;
      return isOfflinePackRecordV2({
        cacheName: record.cacheName,
        href: record.href,
        packageVersion: record.packageVersion,
        savedAt: record.savedAt,
        urls: record.urls,
        volumeId: record.volumeId,
      });
    })() &&
    (value as Partial<OfflineAudioPackRecord>).schemaVersion ===
      publisherEmbeddedAuthoritySchemaVersion &&
    isPublisherRuntimeAuthority(
      (value as Partial<OfflineAudioPackRecord>).publisherRuntimeAuthority,
    )
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
): Promise<ReadableOfflineAudioPackRecord | null> {
  const cache = await caches.open(offlineReaderMetadataCacheName);
  const value = await readRecordResponse(cache, volumeId);
  return isOfflinePackRecord(value) || isOfflinePackRecordV2(value)
    ? value
    : null;
}

async function readAllPackRecords(): Promise<ReadableOfflineAudioPackRecord[]> {
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
            return isOfflinePackRecord(value) || isOfflinePackRecordV2(value)
              ? value
              : null;
          } catch {
            return null;
          }
        }),
    );
    return records
      .filter(
        (record): record is ReadableOfflineAudioPackRecord => record !== null,
      )
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

async function writePackRecord(
  record: ReadableOfflineAudioPackRecord,
): Promise<void> {
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
  publisherRuntimeAuthorityBuildId?: string;
  readerVersion: string;
  volumes: OutlineVolume[];
  sections: ProgressSectionData[];
  manifest: AudioClipManifest;
}): OfflineAudioPack[] {
  if (
    input.publisherRuntimeAuthorityBuildId !== undefined &&
    !sha256Identity.test(input.publisherRuntimeAuthorityBuildId)
  ) {
    throw new TypeError(
      "Publisher embedded offline authority must be one lowercase SHA-256 identity.",
    );
  }
  const publisherRuntimeAuthority =
    input.publisherRuntimeAuthorityBuildId === undefined
      ? undefined
      : Object.freeze({
          buildId: input.publisherRuntimeAuthorityBuildId,
          kind: "publisher-embedded" as const,
          schemaVersion: publisherEmbeddedAuthoritySchemaVersion,
        });
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
    const legacyPackageVersion = packageFingerprint([
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
    const packageVersion = publisherRuntimeAuthority === undefined
      ? legacyPackageVersion
      : `v3:${legacyPackageVersion}:${publisherRuntimeAuthority.buildId.slice("sha256:".length)}`;
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
      ...(publisherRuntimeAuthority === undefined
        ? {}
        : {
            publisherDocumentHrefs: routeUrls,
            publisherRuntimeAuthority,
          }),
    };
  });
}

function cleanCacheNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function stagingCacheNonce(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {
    // A privacy mode may expose crypto while refusing randomUUID. The fallback
    // still prevents same-millisecond staging collisions between reader tabs.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function stagingCacheName(pack: OfflineAudioPack, nonce: string): string {
  return `${offlineReaderPackCachePrefix}-${cleanCacheNamePart(pack.volumeId)}-${pack.packageVersion}-${nonce}`;
}

function isSignedUrl(url: URL): boolean {
  return [...url.searchParams.keys()].some((key) =>
    /^(?:signature|sig|token|expires|policy|key-pair-id|x-amz-)/iu.test(key)
  );
}

function installFetchUrl(value: string, nonce: string): string {
  try {
    const origin =
      typeof window === "undefined"
        ? "https://coherence.invalid"
        : window.location.origin;
    const url = new URL(value, origin);
    if (url.origin !== origin || isSignedUrl(url)) return value;
    url.searchParams.set(offlineInstallBypassParameter, nonce);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
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

async function responseHasExactPublisherRuntimeMarker(
  response: Response,
  authority: PublisherEmbeddedOfflineRuntimeAuthority,
): Promise<boolean> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") || typeof DOMParser === "undefined") {
    return false;
  }
  const document = new DOMParser().parseFromString(
    await response.clone().text(),
    "text/html",
  );
  const roots = document.querySelectorAll(
    "[data-coherence-publisher-transition-root]",
  );
  const authorities = document.querySelectorAll(
    "[data-coherence-publisher-runtime-build-id]",
  );
  if (roots.length !== 1 || authorities.length !== 1) return false;
  const root = roots.item(0);
  return (
    root !== null &&
    root === authorities.item(0) &&
    root.getAttribute("data-coherence-publisher-transition-root") === "true" &&
    root.getAttribute("data-coherence-publisher-runtime-build-id") ===
      authority.buildId
  );
}

function publisherDocumentHrefs(pack: OfflineAudioPack): readonly string[] {
  if (pack.publisherRuntimeAuthority === undefined) {
    if (pack.publisherDocumentHrefs !== undefined) {
      throw new TypeError(
        "Publisher embedded offline package documents require exact authority.",
      );
    }
    return [];
  }
  if (
    !isPublisherRuntimeAuthority(pack.publisherRuntimeAuthority) ||
    !Array.isArray(pack.publisherDocumentHrefs) ||
    pack.publisherDocumentHrefs.length === 0 ||
    pack.publisherDocumentHrefs.some(
      (href) => typeof href !== "string" || !pack.urls.includes(href),
    )
  ) {
    throw new TypeError("Publisher embedded offline package authority is invalid.");
  }
  return uniqueUrls(pack.publisherDocumentHrefs);
}

async function verifyStagedPublisherDocuments(
  cache: Cache,
  pack: OfflineAudioPack,
): Promise<void> {
  const authority = pack.publisherRuntimeAuthority;
  if (authority === undefined) return;
  for (const href of publisherDocumentHrefs(pack)) {
    const response = await cache.match(href);
    if (
      response === undefined ||
      !(await responseHasExactPublisherRuntimeMarker(response, authority))
    ) {
      throw new Error(
        `Publisher embedded offline document does not match the current runtime authority: ${href}`,
      );
    }
  }
}

async function verifyCurrentPublisherVolume(
  pack: OfflineAudioPack,
  installNonce: string,
): Promise<void> {
  const authority = pack.publisherRuntimeAuthority;
  if (authority === undefined) return;
  const response = await fetch(installFetchUrl(pack.href, installNonce), {
    cache: "reload",
    credentials: "omit",
  });
  if (
    !response.ok ||
    !(await responseHasExactPublisherRuntimeMarker(response, authority))
  ) {
    throw new Error(
      "Publisher embedded offline authority changed before package activation.",
    );
  }
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
    const publisherAuthoritySuperseded =
      pack.publisherRuntimeAuthority !== undefined &&
      (!isOfflinePackRecord(record) ||
        record.publisherRuntimeAuthority.buildId !==
          pack.publisherRuntimeAuthority.buildId);
    const superseded =
      publisherAuthoritySuperseded ||
      record.packageVersion !== pack.packageVersion;
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
  publisherDocumentHrefs(pack);

  const previous = await readPackRecord(pack.volumeId);
  const installNonce = stagingCacheNonce();
  const cacheName = stagingCacheName(pack, installNonce);
  const cache = await caches.open(cacheName);
  const queue = [...pack.urls];
  const queued = new Set(queue);
  let cached = 0;
  let activated = false;

  try {
    for (let index = 0; index < queue.length; index += 1) {
      const url = queue[index]!;
      const response = await fetch(installFetchUrl(url, installNonce), {
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
    await verifyStagedPublisherDocuments(cache, pack);
    await verifyCurrentPublisherVolume(pack, stagingCacheNonce());

    // This metadata write is the activation point. Until it succeeds, every
    // reader request continues to resolve against the previous complete cache.
    const record: ReadableOfflineAudioPackRecord = {
      volumeId: pack.volumeId,
      href: pack.href,
      packageVersion: pack.packageVersion,
      cacheName,
      urls: queue,
      savedAt: new Date().toISOString(),
      ...(pack.publisherRuntimeAuthority === undefined
        ? {}
        : {
            publisherRuntimeAuthority: pack.publisherRuntimeAuthority,
            schemaVersion: publisherEmbeddedAuthoritySchemaVersion,
          }),
    };
    await writePackRecord(record);
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
