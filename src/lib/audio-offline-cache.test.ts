import { afterEach, describe, expect, it } from "vitest";
import { emptyAudioClipManifest } from "@/lib/audio-manifest";
import {
  buildOfflineAudioPacks,
  cacheOfflineAudioPack,
  inspectOfflineAudioPack,
  offlineManuscriptHrefs,
  offlineAudioCacheName,
  offlineReaderMetadataCacheName,
} from "@/lib/audio-offline-cache";
import type { OutlineVolume, ProgressSectionData } from "@/lib/reader-data";

const volumes: OutlineVolume[] = [
  {
    title: "Volume One",
    subtitle: "",
    coverImage: "/art/volume-one.png",
    href: "/manuscripts/volume-one/",
    numberLabel: "I",
    wordCount: 100,
    chapters: [],
    parts: [
      {
        title: "Part",
        href: "/manuscripts/volume-one/part/",
        wordCount: 100,
        chapters: [
          {
            title: "Chapter",
            href: "/manuscripts/volume-one/part/chapter/",
            wordCount: 100,
          },
        ],
      },
    ],
  },
  {
    title: "Volume Two",
    subtitle: "",
    coverImage: "/art/volume-two.png",
    href: "/manuscripts/volume-two/",
    numberLabel: "II",
    wordCount: 100,
    chapters: [],
    parts: [],
  },
];

const sections: ProgressSectionData[] = [
  {
    sectionId: "one-a",
    continuityId: "one-a",
    legacyContinuityIds: [],
    progressContinuityGroups: [["one-a"]],
    legacySectionIds: [],
    contentHash: "a",
    title: "One A",
    href: "/manuscripts/volume-one/part/chapter/one-a/",
    chapterHref: "/manuscripts/volume-one/part/chapter/",
    readerHref: "/manuscripts/volume-one/part/chapter/#one-a",
    wordCount: 40,
    audioVersionId: "one-a-a",
  },
  {
    sectionId: "one-b",
    continuityId: "one-b",
    legacyContinuityIds: [],
    progressContinuityGroups: [["one-b"]],
    legacySectionIds: [],
    contentHash: "b",
    title: "One B",
    href: "/manuscripts/volume-one/part/chapter/one-b/",
    chapterHref: "/manuscripts/volume-one/part/chapter/",
    readerHref: "/manuscripts/volume-one/part/chapter/#one-b",
    wordCount: 60,
    audioVersionId: "one-b-b",
  },
  {
    sectionId: "two-a",
    continuityId: "two-a",
    legacyContinuityIds: [],
    progressContinuityGroups: [["two-a"]],
    legacySectionIds: [],
    contentHash: "c",
    title: "Two A",
    href: "/manuscripts/volume-two/part/chapter/two-a/",
    chapterHref: "/manuscripts/volume-two/part/chapter/",
    readerHref: "/manuscripts/volume-two/part/chapter/#two-a",
    wordCount: 100,
    audioVersionId: "two-a-c",
  },
];

describe("offline audio packs", () => {
  it("groups sections by manuscript and includes shared reader data", () => {
    const packs = buildOfflineAudioPacks({
      readerVersion: "reader-one",
      volumes,
      sections,
      manifest: emptyAudioClipManifest,
    });

    expect(packs).toHaveLength(2);
    expect(packs[0]).toMatchObject({
      volumeId: "volume-one",
      title: "Volume One",
      numberLabel: "I",
      sectionCount: 2,
      audioClipCount: 0,
    });
    expect(packs[0]!.urls).toEqual(
      expect.arrayContaining([
        "/",
        "/data/audio-manifest.json",
        "/data/bookmark-sections.json",
        "/data/breadcrumbs/volume-one.json",
        "/data/outline.json",
        "/data/progress-sections.json",
        "/data/reader-sections.json",
        "/data/search-index.json",
        "/_next/image/?url=%2Fart%2Fvolume-one.png&w=640&q=75",
        "/_next/image/?url=%2Fart%2Fvolume-one.png&w=1080&q=75",
        "/manuscripts/volume-one/",
        "/manuscripts/volume-one/part/",
        "/manuscripts/volume-one/part/chapter/",
        "/manuscripts/volume-one/part/chapter/one-a/",
        "/manuscripts/volume-one/part/chapter/one-b/",
      ]),
    );
    expect(packs[0]!.packageVersion).not.toHaveLength(0);
  });

  it("changes the package version with the reader or manuscript", () => {
    const first = buildOfflineAudioPacks({
      readerVersion: "reader-one",
      volumes,
      sections,
      manifest: emptyAudioClipManifest,
    })[0]!;
    const newReader = buildOfflineAudioPacks({
      readerVersion: "reader-two",
      volumes,
      sections,
      manifest: emptyAudioClipManifest,
    })[0]!;
    const newManuscript = buildOfflineAudioPacks({
      readerVersion: "reader-one",
      volumes,
      sections: sections.map((section, index) =>
        index === 0 ? { ...section, contentHash: "revised" } : section,
      ),
      manifest: emptyAudioClipManifest,
    })[0]!;

    expect(newReader.packageVersion).not.toBe(first.packageVersion);
    expect(newManuscript.packageVersion).not.toBe(first.packageVersion);
  });

  it("adds all hosted clip urls for each manuscript", () => {
    const packs = buildOfflineAudioPacks({
      readerVersion: "reader-one",
      volumes,
      sections,
      manifest: {
        version: 1,
        voices: [
          {
            id: "fish-default",
            label: "Fish default",
            sections: [
              {
                sectionId: "one-a",
                audioVersionId: "one-a-a",
                href: "/audio/fish-default/one-a.mp3",
                timingsByteSize: 128,
              },
              {
                sectionId: "one-b",
                audioVersionId: "one-b-b",
                href: "/audio/fish-default/one-b.mp3",
              },
              {
                sectionId: "two-a",
                audioVersionId: "two-a-c",
                href: "/audio/fish-default/two-a.mp3",
              },
            ],
          },
          {
            id: "second",
            label: "Second",
            sections: [
              {
                sectionId: "one-a",
                audioVersionId: "one-a-a",
                href: "/audio/second/one-a.mp3",
              },
            ],
          },
        ],
      },
    });

    expect(packs[0]!.audioClipCount).toBe(3);
    expect(packs[0]!.urls).toEqual(
      expect.arrayContaining([
        "/audio/fish-default/one-a.mp3",
        "/audio/fish-default/one-a.timings.json",
        "/audio/fish-default/one-b.mp3",
        "/audio/second/one-a.mp3",
      ]),
    );
    expect(packs[1]!.audioClipCount).toBe(1);
    expect(packs[1]!.urls).toEqual(
      expect.arrayContaining(["/audio/fish-default/two-a.mp3"]),
    );
  });

  it("excludes clips whose audio version no longer matches the section", () => {
    const packs = buildOfflineAudioPacks({
      readerVersion: "reader-one",
      volumes,
      sections,
      manifest: {
        version: 1,
        voices: [
          {
            id: "fish-default",
            label: "Fish default",
            sections: [
              {
                sectionId: "one-a",
                audioVersionId: "one-a-stale",
                href: "/audio/fish-default/one-a-stale.mp3",
                timingsByteSize: 128,
              },
              {
                sectionId: "one-b",
                audioVersionId: "one-b-b",
                href: "/audio/fish-default/one-b-current.mp3",
              },
            ],
          },
        ],
      },
    });

    expect(packs[0]!.audioClipCount).toBe(1);
    expect(packs[0]!.urls).toContain("/audio/fish-default/one-b-current.mp3");
    expect(packs[0]!.urls).not.toContain("/audio/fish-default/one-a-stale.mp3");
    expect(packs[0]!.urls).not.toContain(
      "/audio/fish-default/one-a-stale.timings.json",
    );
  });
});

// A small CacheStorage stand-in with independent named caches. Versioned
// package activation depends on that separation, so a single-map stub would
// certify behavior browsers do not actually have.
function installCacheStub(seed: Record<string, Record<string, string>> = {}) {
  const stores = new Map(
    Object.entries(seed).map(([name, entries]) => [
      name,
      new Map<string, string>(Object.entries(entries)),
    ]),
  );
  const keyFor = (key: RequestInfo | URL) =>
    typeof key === "string" ? key : key instanceof URL ? key.href : key.url;
  const open = (name: string) => {
    const store = stores.get(name) ?? new Map<string, string>();
    stores.set(name, store);
    return {
      match: (key: RequestInfo | URL) => {
        const body = store.get(keyFor(key));
        return Promise.resolve(
          body === undefined
            ? undefined
            : new Response(body, {
                headers: { "content-type": "application/json" },
              }),
        );
      },
      put: async (key: RequestInfo | URL, response: Response) => {
        store.set(keyFor(key), await response.text());
      },
      delete: (key: RequestInfo | URL) =>
        Promise.resolve(store.delete(keyFor(key))),
      keys: () =>
        Promise.resolve(
          [...store.keys()].map(
            (key) => new Request(new URL(key, "https://coherence.test").href),
          ),
        ),
    } as unknown as Cache;
  };
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      open: (name: string) => Promise.resolve(open(name)),
      delete: (name: string) => Promise.resolve(stores.delete(name)),
    },
  });
  return stores;
}

describe("offline pack recording lifecycle", () => {
  const pack = {
    volumeId: "volume-one",
    title: "Volume One",
    numberLabel: "I",
    href: "/manuscripts/volume-one/",
    packageVersion: "reader-one-volume-one",
    sectionCount: 1,
    audioClipCount: 1,
    urls: ["/new-clip.opus"],
  };
  const recordKey = "https://coherence.invalid/__offline-pack__/volume-one";
  const oldCacheName = "coherence-offline-pack-v2-volume-one-old";
  const oldRecord = JSON.stringify({
    volumeId: "volume-one",
    href: "/manuscripts/volume-one/",
    packageVersion: "old",
    cacheName: oldCacheName,
    urls: ["/old-clip.mp3"],
    savedAt: "2026-07-08T00:00:00.000Z",
  });

  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it("reports a superseded recording when the manifest moves on", async () => {
    installCacheStub({
      [offlineAudioCacheName]: {
        [recordKey]: JSON.stringify({
          volumeId: "volume-one",
          urls: ["/old-clip.mp3"],
          savedAt: "2026-07-08T00:00:00.000Z",
        }),
        "/old-clip.mp3": "{}",
      },
    });

    const status = await inspectOfflineAudioPack(pack);
    expect(status.superseded).toBe(true);
    expect(status.supersededCount).toBe(1);
    expect(status.complete).toBe(true);
    await expect(offlineManuscriptHrefs()).resolves.toEqual([
      "/manuscripts/volume-one/",
    ]);
  });

  // The flight rule: a reader who downloaded a volume before travelling must
  // never end up with the old recording deleted and the new one not fetched.
  it("keeps the previous recording when the refresh download fails", async () => {
    const stores = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "{}" },
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: () => Promise.resolve({ ok: false, status: 503 } as Response),
    });

    await expect(cacheOfflineAudioPack(pack, () => undefined)).rejects.toThrow(
      /Unable to download/,
    );

    expect(stores.get(oldCacheName)?.has("/old-clip.mp3")).toBe(true);
    expect(stores.get(offlineReaderMetadataCacheName)?.has(recordKey)).toBe(
      true,
    );
  });

  it("releases the previous recording only after the new one is cached", async () => {
    const stores = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "{}" },
    });
    const fetchOrder: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        fetchOrder.push(url);
        // The superseded clip must still be present at fetch time.
        expect(stores.get(oldCacheName)?.has("/old-clip.mp3")).toBe(true);
        return Promise.resolve(
          new Response("{}", {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          }),
        );
      },
    });

    const status = await cacheOfflineAudioPack(pack, () => undefined);

    expect(fetchOrder).toEqual(["/new-clip.opus"]);
    const activeRecord = JSON.parse(
      stores.get(offlineReaderMetadataCacheName)!.get(recordKey)!,
    );
    expect(stores.get(activeRecord.cacheName)?.has("/new-clip.opus")).toBe(
      true,
    );
    expect(stores.has(oldCacheName)).toBe(false);
    expect(status.superseded).toBe(false);
    expect(activeRecord.urls).toEqual(["/new-clip.opus"]);
    await expect(offlineManuscriptHrefs()).resolves.toEqual([
      "/manuscripts/volume-one/",
    ]);
  });
});
