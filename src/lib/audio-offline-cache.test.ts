import { afterEach, describe, expect, it } from "vitest";
import { emptyAudioClipManifest } from "@/lib/audio-manifest";
import {
  buildOfflineAudioPacks,
  cacheOfflineAudioPack,
  inspectOfflineAudioPack,
} from "@/lib/audio-offline-cache";
import type { OutlineVolume, ProgressSectionData } from "@/lib/reader-data";

const volumes: OutlineVolume[] = [
  {
    title: "Volume One",
    subtitle: "",
    href: "/manuscripts/volume-one/",
    numberLabel: "I",
    wordCount: 100,
    parts: [],
  },
  {
    title: "Volume Two",
    subtitle: "",
    href: "/manuscripts/volume-two/",
    numberLabel: "II",
    wordCount: 100,
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
    audioVersionId: "two-a-c",
  },
];

describe("offline audio packs", () => {
  it("groups sections by manuscript and includes shared reader data", () => {
    const packs = buildOfflineAudioPacks({
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
        "/data/progress-sections.json",
        "/data/reader-sections.json",
        "/manuscripts/volume-one/",
        "/manuscripts/volume-one/part/chapter/one-a/",
        "/manuscripts/volume-one/part/chapter/one-b/",
      ]),
    );
  });

  it("adds all hosted clip urls for each manuscript", () => {
    const packs = buildOfflineAudioPacks({
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
    expect(packs[0]!.urls).toContain(
      "/audio/fish-default/one-b-current.mp3",
    );
    expect(packs[0]!.urls).not.toContain(
      "/audio/fish-default/one-a-stale.mp3",
    );
    expect(packs[0]!.urls).not.toContain(
      "/audio/fish-default/one-a-stale.timings.json",
    );
  });
});

// A minimal CacheStorage stand-in. Keys are URL strings, values are bodies.
function installCacheStub(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const cache = {
    match: (key: string) =>
      Promise.resolve(
        store.has(key)
          ? ({ json: () => Promise.resolve(JSON.parse(store.get(key)!)) } as unknown as Response)
          : undefined,
      ),
    put: (key: string, response: Response) =>
      Promise.resolve(response.text?.() ?? Promise.resolve("{}")).then(
        (body: unknown) => {
          store.set(key, typeof body === "string" ? body : "{}");
        },
      ),
    delete: (key: string) => Promise.resolve(store.delete(key)),
  };
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { open: () => Promise.resolve(cache) },
  });
  return store;
}

describe("offline pack recording lifecycle", () => {
  const pack = {
    volumeId: "volume-one",
    title: "Volume One",
    numberLabel: "I",
    href: "/manuscripts/volume-one/",
    sectionCount: 1,
    audioClipCount: 1,
    urls: ["/new-clip.opus"],
  };
  const recordKey =
    "https://coherence.invalid/__offline-pack__/volume-one";

  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it("reports a superseded recording when the manifest moves on", async () => {
    installCacheStub({
      [recordKey]: JSON.stringify({
        volumeId: "volume-one",
        urls: ["/old-clip.mp3"],
        savedAt: "2026-07-08T00:00:00.000Z",
      }),
      "/old-clip.mp3": "{}",
    });

    const status = await inspectOfflineAudioPack(pack);
    expect(status.superseded).toBe(true);
    expect(status.supersededCount).toBe(1);
    expect(status.complete).toBe(false);
  });

  // The flight rule: a reader who downloaded a volume before travelling must
  // never end up with the old recording deleted and the new one not fetched.
  it("keeps the previous recording when the refresh download fails", async () => {
    const store = installCacheStub({
      [recordKey]: JSON.stringify({
        volumeId: "volume-one",
        urls: ["/old-clip.mp3"],
        savedAt: "2026-07-08T00:00:00.000Z",
      }),
      "/old-clip.mp3": "{}",
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: () => Promise.resolve({ ok: false, status: 503 } as Response),
    });

    await expect(
      cacheOfflineAudioPack(pack, () => undefined),
    ).rejects.toThrow(/Unable to download/);

    expect(store.has("/old-clip.mp3")).toBe(true);
    expect(store.has(recordKey)).toBe(true);
  });

  it("releases the previous recording only after the new one is cached", async () => {
    const store = installCacheStub({
      [recordKey]: JSON.stringify({
        volumeId: "volume-one",
        urls: ["/old-clip.mp3"],
        savedAt: "2026-07-08T00:00:00.000Z",
      }),
      "/old-clip.mp3": "{}",
    });
    const fetchOrder: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        fetchOrder.push(url);
        // The superseded clip must still be present at fetch time.
        expect(store.has("/old-clip.mp3")).toBe(true);
        return Promise.resolve({
          ok: true,
          status: 200,
          clone: () => ({ text: () => Promise.resolve("{}") }),
        } as unknown as Response);
      },
    });

    const status = await cacheOfflineAudioPack(pack, () => undefined);

    expect(fetchOrder).toEqual(["/new-clip.opus"]);
    expect(store.has("/new-clip.opus")).toBe(true);
    expect(store.has("/old-clip.mp3")).toBe(false);
    expect(status.superseded).toBe(false);
    expect(JSON.parse(store.get(recordKey)!).urls).toEqual(["/new-clip.opus"]);
  });
});
