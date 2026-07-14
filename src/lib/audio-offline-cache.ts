import type { AudioClipManifest } from "@/lib/audio-manifest";
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
};

export type OfflineAudioDownloadProgress = OfflineAudioPackStatus & {
  currentUrl?: string;
};

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
      if (clip.timingsHref) current.push(clip.timingsHref);
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
    };
  }
  const cache = await caches.open(offlineAudioCacheName);
  const cached = await Promise.all(
    pack.urls.map((url) => cache.match(url).then((response) => Boolean(response))),
  );
  const cachedCount = cached.filter(Boolean).length;
  return {
    cachedCount,
    totalCount: pack.urls.length,
    complete:
      pack.audioClipCount > 0 &&
      pack.urls.length > 0 &&
      cachedCount === pack.urls.length,
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
      currentUrl: url,
    });
  }
  const status = await inspectOfflineAudioPack(pack);
  onProgress(status);
  return status;
}
