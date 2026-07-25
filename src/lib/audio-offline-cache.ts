import { audioTimingsHref, type AudioClipManifest } from "@/lib/audio-manifest";
import type { ProgressSectionData, OutlineVolume } from "@/lib/reader-data";

export const offlineAudioCacheName = "coherence-offline-v1";

export type OfflineAudioPack = {
  volumeId: string;
  title: string;
  numberLabel: string;
  href: string;
  sectionCount: number;
  audioClipCount: number;
  urls: string[];
};

export type OfflineAudioPackStatus = {
  cachedCount: number;
  totalCount: number;
  complete: boolean;
  // A newer recording has been published since this volume was downloaded.
  // The clips already on the device still play; they are simply no longer
  // what the manifest points at.
  superseded: boolean;
  supersededCount: number;
};

export type OfflineAudioDownloadProgress = OfflineAudioPackStatus & {
  currentUrl?: string;
};

// What a volume actually pulled down, written after a successful download.
// Comparing it against the current pack is how a superseded recording is
// recognised, and it is the only reliable source for which cached objects
// belong to a previous recording of this volume.
export type OfflineAudioPackRecord = {
  volumeId: string;
  urls: string[];
  savedAt: string;
};

const offlinePackRecordPrefix = "https://coherence.invalid/__offline-pack__/";

function packRecordKey(volumeId: string): string {
  return `${offlinePackRecordPrefix}${encodeURIComponent(volumeId)}`;
}

async function readPackRecord(
  cache: Cache,
  volumeId: string,
): Promise<OfflineAudioPackRecord | null> {
  try {
    const response = await cache.match(packRecordKey(volumeId));
    if (!response) return null;
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") return null;
    const record = value as Partial<OfflineAudioPackRecord>;
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
  cache: Cache,
  record: OfflineAudioPackRecord,
): Promise<void> {
  await cache.put(
    packRecordKey(record.volumeId),
    new Response(JSON.stringify(record), {
      headers: { "content-type": "application/json" },
    }),
  );
}

// Objects this volume cached previously that the current pack no longer
// references, and that are still taking up space on the device.
async function supersededUrls(
  cache: Cache,
  pack: OfflineAudioPack,
): Promise<string[]> {
  const record = await readPackRecord(cache, pack.volumeId);
  if (!record) return [];
  const current = new Set(pack.urls);
  const candidates = record.urls.filter((url) => !current.has(url));
  const present = await Promise.all(
    candidates.map((url) =>
      cache.match(url).then((response) => (response ? url : null)),
    ),
  );
  return present.filter((url): url is string => url !== null);
}

const sharedOfflineUrls = [
  "/",
  "/data/audio-manifest.json",
  "/data/progress-sections.json",
  "/data/reader-sections.json",
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

export function buildOfflineAudioPacks(input: {
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
      clipCountByVersion.set(
        key,
        (clipCountByVersion.get(key) ?? 0) + 1,
      );
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
    return {
      volumeId: volumeIdFromHref(volume.href),
      title: volume.title,
      numberLabel: volume.numberLabel,
      href: volume.href,
      sectionCount: sections.length,
      audioClipCount: sections.reduce(
        (total, section) =>
          total +
          (clipCountByVersion.get(
            clipVersionKey(section.sectionId, section.audioVersionId),
          ) ?? 0),
        0,
      ),
      urls: uniqueUrls([
        ...sharedOfflineUrls,
        volume.href,
        ...sections.map((section) => section.href),
        ...clipUrls,
      ]),
    };
  });
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
  const cache = await caches.open(offlineAudioCacheName);
  const cached = await Promise.all(
    pack.urls.map((url) => cache.match(url).then((response) => Boolean(response))),
  );
  const cachedCount = cached.filter(Boolean).length;
  const stale = await supersededUrls(cache, pack);
  return {
    cachedCount,
    totalCount: pack.urls.length,
    complete:
      pack.audioClipCount > 0 &&
      pack.urls.length > 0 &&
      cachedCount === pack.urls.length,
    superseded: stale.length > 0,
    supersededCount: stale.length,
  };
}

export async function cacheOfflineAudioPack(
  pack: OfflineAudioPack,
  onProgress: (progress: OfflineAudioDownloadProgress) => void,
): Promise<OfflineAudioPackStatus> {
  if (!("caches" in globalThis)) {
    throw new Error("Offline downloads are not supported by this browser.");
  }
  const cache = await caches.open(offlineAudioCacheName);
  // Superseded clips are identified up front but deliberately kept until the
  // replacements are safely on the device. A reader who downloaded a volume
  // before a flight must never be left with the old recording deleted and the
  // new one not yet fetched, so nothing is pruned before this loop finishes.
  const stale = await supersededUrls(cache, pack);
  let cachedCount = 0;
  for (const url of pack.urls) {
    const existing = await cache.match(url);
    if (!existing) {
      const response = await fetch(url, {
        cache: "reload",
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`Unable to download ${url}: ${response.status}`);
      }
      await cache.put(url, response.clone());
    }
    cachedCount += 1;
    onProgress({
      cachedCount,
      totalCount: pack.urls.length,
      complete: false,
      superseded: stale.length > 0,
      supersededCount: stale.length,
      currentUrl: url,
    });
  }

  // Every replacement is now cached. Only now is the previous recording
  // released, and the record rewritten to describe what is actually held.
  const settled = await inspectOfflineAudioPack(pack);
  if (settled.cachedCount === pack.urls.length) {
    await Promise.all(stale.map((url) => cache.delete(url)));
    await writePackRecord(cache, {
      volumeId: pack.volumeId,
      urls: pack.urls,
      savedAt: new Date().toISOString(),
    });
  }

  const status = await inspectOfflineAudioPack(pack);
  onProgress(status);
  return status;
}
