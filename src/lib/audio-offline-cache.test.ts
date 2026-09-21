import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyAudioClipManifest } from "@/lib/audio-manifest";
import {
  buildOfflineAudioPacks,
  cacheOfflineAudioPack,
  inspectOfflineAudioPack,
  offlineManuscriptHrefs,
  offlineAudioCacheName,
  offlineReaderMetadataCacheName,
  type OfflineAudioPack,
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
    expect(packs[0]!.packageVersion).toBe("ok9p9r");
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

  it("domain separates Publisher packages while preserving the legacy shape", () => {
    const publisherBuildId =
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const legacy = buildOfflineAudioPacks({
      readerVersion: "reader-one",
      volumes,
      sections,
      manifest: emptyAudioClipManifest,
    })[0]!;
    const publisher = buildOfflineAudioPacks({
      publisherRuntimeAuthorityBuildId: publisherBuildId,
      readerVersion: "reader-one",
      volumes,
      sections,
      manifest: emptyAudioClipManifest,
    })[0]!;

    expect(Object.hasOwn(legacy, "publisherDocumentHrefs")).toBe(false);
    expect(Object.hasOwn(legacy, "publisherRuntimeAuthority")).toBe(false);
    expect(publisher.packageVersion).toBe(
      `v3:${legacy.packageVersion}:${publisherBuildId.slice("sha256:".length)}`,
    );
    expect(publisher.publisherRuntimeAuthority).toEqual({
      buildId: publisherBuildId,
      kind: "publisher-embedded",
      schemaVersion: 3,
    });
    expect(publisher.publisherDocumentHrefs).toEqual(
      expect.arrayContaining([
        "/manuscripts/volume-one/",
        "/manuscripts/volume-one/part/chapter/one-a/",
      ]),
    );
  });
});

type StoredResponse = Readonly<{
  body: string;
  headers: readonly (readonly [string, string])[];
  redirected: boolean;
  status: number;
  url: string;
}>;

type CacheStubOptions = Readonly<{
  cacheDeleteFailures?: ReadonlySet<string>;
  failMetadataPut?: boolean;
}>;

function storedResponse(body: string, url: string): StoredResponse {
  return {
    body,
    headers: [[
      "content-type",
      body.trimStart().startsWith("<")
        ? "text/html; charset=utf-8"
        : "application/json",
    ]],
    redirected: false,
    status: 200,
    url: new URL(url, "https://coherence.test").href,
  };
}

// CacheStorage is modeled with independent stores and complete response
// metadata. Publisher activation depends on cached HTML headers and body bytes.
function installCacheStub(
  seed: Record<string, Record<string, string>> = {},
  options: CacheStubOptions = {},
) {
  const stores = new Map(
    Object.entries(seed).map(([name, entries]) => [
      name,
      new Map<string, StoredResponse>(
        Object.entries(entries).map(([key, body]) => [
          key,
          storedResponse(body, key),
        ]),
      ),
    ]),
  );
  const events: string[] = [];
  const keyFor = (key: RequestInfo | URL) =>
    typeof key === "string" ? key : key instanceof URL ? key.href : key.url;
  const open = (name: string) => {
    events.push(`open:${name}`);
    const store = stores.get(name) ?? new Map<string, StoredResponse>();
    stores.set(name, store);
    return {
      match: (key: RequestInfo | URL) => {
        const stored = store.get(keyFor(key));
        if (stored === undefined) return Promise.resolve(undefined);
        const response = new Response(stored.body, {
          status: stored.status,
          headers: stored.headers as HeadersInit,
        });
        Object.defineProperties(response, {
          redirected: { configurable: true, value: stored.redirected },
          url: { configurable: true, value: stored.url },
        });
        return Promise.resolve(response);
      },
      put: async (key: RequestInfo | URL, response: Response) => {
        const resolvedKey = keyFor(key);
        if (
          options.failMetadataPut &&
          name === offlineReaderMetadataCacheName
        ) {
          throw new TypeError("metadata write failed");
        }
        store.set(resolvedKey, {
          body: await response.text(),
          headers: [...response.headers.entries()],
          redirected: response.redirected,
          status: response.status,
          url: response.url,
        });
        events.push(`put:${name}:${resolvedKey}`);
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
      delete: (name: string) => {
        events.push(`delete:${name}`);
        return options.cacheDeleteFailures?.has(name)
          ? Promise.reject(new TypeError("cache cleanup failed"))
          : Promise.resolve(stores.delete(name));
      },
    },
  });
  return { events, stores };
}

type ParsedHtmlElement = Readonly<{
  getAttribute(name: string): string | undefined;
}>;
type ParsedHtmlDocument = Readonly<{
  querySelectorAll(selector: string): ParsedHtmlElement[];
}>;
const require = createRequire(import.meta.url);
const parseHtml = (
  require("next/dist/compiled/node-html-parser") as {
    parse(markup: string): ParsedHtmlDocument;
  }
).parse;

class TestDOMParser {
  parseFromString(markup: string): Document {
    const parsed = parseHtml(markup);
    const wrappers = new Map<ParsedHtmlElement, Element>();
    const wrap = (element: ParsedHtmlElement): Element => {
      const current = wrappers.get(element);
      if (current) return current;
      const wrapper = {
        getAttribute: (name: string) => element.getAttribute(name) ?? null,
      } as Element;
      wrappers.set(element, wrapper);
      return wrapper;
    };
    return {
      querySelectorAll(selector: string) {
        const elements = parsed.querySelectorAll(selector).map(wrap);
        Object.assign(elements, {
          item: (index: number) => elements[index] ?? null,
        });
        return elements;
      },
    } as unknown as Document;
  }
}

const publisherBuildId =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const otherPublisherBuildId =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function exactPublisherHtml(buildId = publisherBuildId): string {
  return `<!doctype html><html><body><div data-coherence-publisher-transition-root="true" data-coherence-publisher-runtime-build-id="${buildId}"></div></body></html>`;
}

function responseForPackUrl(url: string, html = exactPublisherHtml()): Response {
  const pathname = new URL(url, "https://coherence.invalid").pathname;
  return pathname === "/manuscripts/volume-one/"
    ? new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    : new Response("new audio", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
}

describe("offline pack recording lifecycle", () => {
  const pack: OfflineAudioPack = {
    volumeId: "volume-one",
    title: "Volume One",
    numberLabel: "I",
    href: "/manuscripts/volume-one/",
    packageVersion: "reader-one-volume-one",
    sectionCount: 1,
    audioClipCount: 1,
    urls: ["/new-clip.opus"],
  };
  const publisherPack: OfflineAudioPack = {
    ...pack,
    packageVersion: `v3:${pack.packageVersion}:${publisherBuildId.slice("sha256:".length)}`,
    urls: [pack.href, "/new-clip.opus"],
    publisherDocumentHrefs: [pack.href],
    publisherRuntimeAuthority: {
      buildId: publisherBuildId,
      kind: "publisher-embedded",
      schemaVersion: 3,
    },
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

  beforeEach(() => {
    Object.defineProperty(globalThis, "DOMParser", {
      configurable: true,
      value: TestDOMParser,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as { caches?: unknown }).caches;
    delete (globalThis as { fetch?: unknown }).fetch;
    delete (globalThis as { DOMParser?: unknown }).DOMParser;
  });

  it("reports a superseded recording when the legacy manifest moves on", async () => {
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
    const { stores } = installCacheStub({
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
    const { events, stores } = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "{}" },
    });
    const fetchOrder: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        fetchOrder.push(url);
        events.push(`fetch:${url}`);
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

    expect(fetchOrder).toHaveLength(1);
    expect(fetchOrder[0]).toMatch(
      /^\/new-clip\.opus\?__coherence_offline_install=/u,
    );
    const activeRecord = JSON.parse(
      stores.get(offlineReaderMetadataCacheName)!.get(recordKey)!.body,
    ) as { cacheName: string; urls: string[] };
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

  it("stores redirected bytes under the clean key without redirect identity", async () => {
    const { stores } = installCacheStub();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: () => {
        const response = new Response("redirected audio", {
          status: 200,
          headers: {
            "content-type": "audio/ogg",
            "x-content-build": "exact",
          },
        });
        Object.defineProperties(response, {
          redirected: { configurable: true, value: true },
          url: {
            configurable: true,
            value: "https://coherence.invalid/new-clip.opus/",
          },
        });
        return Promise.resolve(response);
      },
    });

    await cacheOfflineAudioPack(pack, () => undefined);

    const activeRecord = JSON.parse(
      stores.get(offlineReaderMetadataCacheName)!.get(recordKey)!.body,
    ) as { cacheName: string };
    const stored = stores.get(activeRecord.cacheName)!.get("/new-clip.opus")!;
    expect(stored).toMatchObject({
      body: "redirected audio",
      redirected: false,
      status: 200,
      url: "",
    });
    const storedHeaders = new Headers(Object.fromEntries(stored.headers));
    expect(storedHeaders.get("content-type")).toBe("audio/ogg");
    expect(storedHeaders.get("x-content-build")).toBe("exact");
  });

  it("supersedes v2 in Publisher mode even when its package version matches", async () => {
    const v2Record = JSON.stringify({
      volumeId: publisherPack.volumeId,
      href: publisherPack.href,
      packageVersion: publisherPack.packageVersion,
      cacheName: oldCacheName,
      urls: publisherPack.urls,
      savedAt: "2026-07-08T00:00:00.000Z",
    });
    installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: v2Record },
      [oldCacheName]: {
        [publisherPack.href]: exactPublisherHtml(),
        "/new-clip.opus": "audio",
      },
    });

    await expect(inspectOfflineAudioPack(publisherPack)).resolves.toMatchObject({
      complete: true,
      superseded: true,
      supersededCount: 1,
    });
  });

  it("recognizes only an exact current v3 authority record", async () => {
    const currentCacheName = "coherence-offline-pack-v2-volume-one-current";
    const record = (buildId: string) => JSON.stringify({
      volumeId: publisherPack.volumeId,
      href: publisherPack.href,
      packageVersion: publisherPack.packageVersion,
      cacheName: currentCacheName,
      urls: publisherPack.urls,
      savedAt: "2026-07-08T00:00:00.000Z",
      publisherRuntimeAuthority: {
        buildId,
        kind: "publisher-embedded",
        schemaVersion: 3,
      },
      schemaVersion: 3,
    });
    const currentCache = {
      [publisherPack.href]: exactPublisherHtml(),
      "/new-clip.opus": "audio",
    };

    installCacheStub({
      [offlineReaderMetadataCacheName]: {
        [recordKey]: record(publisherBuildId),
      },
      [currentCacheName]: currentCache,
    });
    await expect(inspectOfflineAudioPack(publisherPack)).resolves.toMatchObject({
      complete: true,
      superseded: false,
      supersededCount: 0,
    });

    installCacheStub({
      [offlineReaderMetadataCacheName]: {
        [recordKey]: record(otherPublisherBuildId),
      },
      [currentCacheName]: currentCache,
    });
    await expect(inspectOfflineAudioPack(publisherPack)).resolves.toMatchObject({
      complete: true,
      superseded: true,
      supersededCount: 1,
    });
  });

  it("rejects malformed v2 and v3 record hybrids instead of falling through", async () => {
    for (const hybrid of [
      { ...JSON.parse(oldRecord), schemaVersion: 3 },
      {
        ...JSON.parse(oldRecord),
        publisherRuntimeAuthority: {
          buildId: "sha256:bad",
          kind: "publisher-embedded",
          schemaVersion: 3,
        },
        schemaVersion: 3,
      },
    ]) {
      installCacheStub({
        [offlineReaderMetadataCacheName]: {
          [recordKey]: JSON.stringify(hybrid),
        },
        [oldCacheName]: { "/old-clip.mp3": "audio" },
      });

      await expect(inspectOfflineAudioPack(publisherPack)).resolves.toMatchObject({
        cachedCount: 0,
        complete: false,
        superseded: false,
      });
      await expect(offlineManuscriptHrefs()).resolves.toEqual([]);
    }
  });

  it("rejects both asymmetric Publisher pack shapes before fetching", async () => {
    installCacheStub();
    const fetchMock = vi.fn();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });
    const authorityOnly = { ...publisherPack };
    delete authorityOnly.publisherDocumentHrefs;
    const documentsOnly = { ...publisherPack };
    delete documentsOnly.publisherRuntimeAuthority;

    await expect(
      cacheOfflineAudioPack(authorityOnly, () => undefined),
    ).rejects.toThrow("package authority is invalid");
    await expect(
      cacheOfflineAudioPack(documentsOnly, () => undefined),
    ).rejects.toThrow("documents require exact authority");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("activates exact v3 only after cached markers and a fresh final recheck", async () => {
    const { events, stores } = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "{}" },
    });
    const fetchOrder: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        fetchOrder.push(url);
        events.push(`fetch:${url}`);
        expect(stores.get(oldCacheName)?.has("/old-clip.mp3")).toBe(true);
        return Promise.resolve(responseForPackUrl(url));
      },
    });

    const status = await cacheOfflineAudioPack(
      publisherPack,
      () => undefined,
    );
    const activeRecord = JSON.parse(
      stores.get(offlineReaderMetadataCacheName)!.get(recordKey)!.body,
    ) as {
      cacheName: string;
      publisherRuntimeAuthority: { buildId: string };
      schemaVersion: number;
      urls: string[];
    };
    const metadataPut = events.findIndex((event) =>
      event.startsWith(`put:${offlineReaderMetadataCacheName}:${recordKey}`)
    );
    const oldDelete = events.indexOf(`delete:${oldCacheName}`);
    const finalVolumeFetch = events.findLastIndex((event) =>
      event.startsWith("fetch:/manuscripts/volume-one/")
    );
    const installNonces = fetchOrder.map((url) =>
      new URL(url, "https://coherence.invalid").searchParams.get(
        "__coherence_offline_install",
      )
    );

    expect(fetchOrder).toHaveLength(3);
    expect(installNonces.every(Boolean)).toBe(true);
    expect(installNonces[0]).toBe(installNonces[1]);
    expect(installNonces[2]).not.toBe(installNonces[0]);
    expect(metadataPut).toBeGreaterThan(finalVolumeFetch);
    expect(oldDelete).toBeGreaterThan(metadataPut);
    expect(activeRecord.schemaVersion).toBe(3);
    expect(Object.keys(activeRecord).sort()).toEqual([
      "cacheName",
      "href",
      "packageVersion",
      "publisherRuntimeAuthority",
      "savedAt",
      "schemaVersion",
      "urls",
      "volumeId",
    ]);
    expect(activeRecord.publisherRuntimeAuthority.buildId).toBe(
      publisherBuildId,
    );
    expect(Object.keys(activeRecord.publisherRuntimeAuthority).sort()).toEqual([
      "buildId",
      "kind",
      "schemaVersion",
    ]);
    expect(activeRecord.urls).toEqual(publisherPack.urls);
    expect(stores.get(activeRecord.cacheName)?.has(publisherPack.href)).toBe(
      true,
    );
    expect(stores.has(oldCacheName)).toBe(false);
    expect(status).toMatchObject({ complete: true, superseded: false });
  });

  it.each([
    ["missing marker", "<!doctype html><html><body></body></html>"],
    [
      "script text spoof",
      `<script type="application/json">${JSON.stringify(exactPublisherHtml())}</script>`,
    ],
    ["wrong authority", exactPublisherHtml(otherPublisherBuildId)],
    ["duplicate root", `${exactPublisherHtml()}${exactPublisherHtml()}`],
    [
      "duplicate authority element",
      `${exactPublisherHtml()}<span data-coherence-publisher-runtime-build-id="${publisherBuildId}"></span>`,
    ],
    [
      "split attributes",
      `<div data-coherence-publisher-transition-root="true"></div><span data-coherence-publisher-runtime-build-id="${publisherBuildId}"></span>`,
    ],
    [
      "malformed root value",
      `<div data-coherence-publisher-transition-root="false" data-coherence-publisher-runtime-build-id="${publisherBuildId}"></div>`,
    ],
  ])("preserves the active pointer for %s", async (_label, html) => {
    const { events, stores } = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "old audio" },
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => Promise.resolve(responseForPackUrl(url, html)),
    });

    await expect(
      cacheOfflineAudioPack(publisherPack, () => undefined),
    ).rejects.toThrow("does not match the current runtime authority");

    expect(stores.get(offlineReaderMetadataCacheName)?.get(recordKey)?.body).toBe(
      oldRecord,
    );
    expect(stores.get(oldCacheName)?.has("/old-clip.mp3")).toBe(true);
    const stagingNames = events
      .filter((event) => event.startsWith("open:coherence-offline-pack-v2-"))
      .map((event) => event.slice("open:".length));
    expect(stagingNames).toHaveLength(1);
    expect(stores.has(stagingNames[0]!)).toBe(false);
  });

  it("preserves the active pointer when the final volume recheck changes", async () => {
    const { stores } = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "old audio" },
    });
    let volumeFetches = 0;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        const pathname = new URL(url, "https://coherence.invalid").pathname;
        if (pathname === publisherPack.href) volumeFetches += 1;
        return Promise.resolve(
          responseForPackUrl(
            url,
            volumeFetches === 1
              ? exactPublisherHtml()
              : exactPublisherHtml(otherPublisherBuildId),
          ),
        );
      },
    });

    await expect(
      cacheOfflineAudioPack(publisherPack, () => undefined),
    ).rejects.toThrow("authority changed before package activation");
    expect(volumeFetches).toBe(2);
    expect(stores.get(offlineReaderMetadataCacheName)?.get(recordKey)?.body).toBe(
      oldRecord,
    );
    expect(stores.get(oldCacheName)?.has("/old-clip.mp3")).toBe(true);
  });

  it("rejects a non-HTML Publisher document and deletes only staging", async () => {
    const { events, stores } = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "old audio" },
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        const pathname = new URL(url, "https://coherence.invalid").pathname;
        return Promise.resolve(
          new Response(
            pathname === publisherPack.href ? exactPublisherHtml() : "audio",
            {
              status: 200,
              headers: { "content-type": "application/octet-stream" },
            },
          ),
        );
      },
    });

    await expect(
      cacheOfflineAudioPack(publisherPack, () => undefined),
    ).rejects.toThrow("does not match the current runtime authority");
    const stagingName = events
      .find((event) => event.startsWith("open:coherence-offline-pack-v2-"))
      ?.slice("open:".length);
    expect(stagingName).toBeDefined();
    expect(stores.has(stagingName!)).toBe(false);
    expect(stores.get(offlineReaderMetadataCacheName)?.get(recordKey)?.body).toBe(
      oldRecord,
    );
    expect(stores.has(oldCacheName)).toBe(true);
  });

  it("bypasses stale service worker fallback for every local staging request", async () => {
    const { stores } = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "stale package A audio" },
    });
    const requested: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        requested.push(url);
        if (url.includes("__coherence_offline_install=")) {
          const pathname = new URL(url, "https://coherence.invalid").pathname;
          return pathname === publisherPack.href
            ? Promise.resolve(
                responseForPackUrl(url, exactPublisherHtml(publisherBuildId)),
              )
            : Promise.reject(new TypeError("network unavailable"));
        }
        return Promise.resolve(
          new Response("stale package A data", {
            headers: { "content-type": "application/octet-stream" },
          }),
        );
      },
    });

    await expect(
      cacheOfflineAudioPack(publisherPack, () => undefined),
    ).rejects.toThrow("network unavailable");
    expect(requested).toHaveLength(2);
    expect(requested.every((url) =>
      url.includes("__coherence_offline_install=")
    )).toBe(true);
    expect(stores.get(offlineReaderMetadataCacheName)?.get(recordKey)?.body).toBe(
      oldRecord,
    );
    expect(stores.get(oldCacheName)?.has("/old-clip.mp3")).toBe(true);
  });

  it("preserves external and signed URLs while nonce-bypassing local URLs", async () => {
    const mixedPack: OfflineAudioPack = {
      ...pack,
      urls: [
        "/local.opus",
        "https://cdn.example/audio.opus",
        "/signed.opus?signature=exact",
      ],
    };
    installCacheStub();
    const requested: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        requested.push(url);
        return Promise.resolve(responseForPackUrl(url));
      },
    });

    await cacheOfflineAudioPack(mixedPack, () => undefined);

    expect(requested[0]).toMatch(
      /^\/local\.opus\?__coherence_offline_install=/u,
    );
    expect(requested[1]).toBe("https://cdn.example/audio.opus");
    expect(requested[2]).toBe("/signed.opus?signature=exact");
  });

  it("preserves the previous pointer when metadata activation fails", async () => {
    const { events, stores } = installCacheStub(
      {
        [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
        [oldCacheName]: { "/old-clip.mp3": "old audio" },
      },
      { failMetadataPut: true },
    );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => Promise.resolve(responseForPackUrl(url)),
    });

    await expect(
      cacheOfflineAudioPack(publisherPack, () => undefined),
    ).rejects.toThrow("metadata write failed");
    const stagingName = events
      .find((event) => event.startsWith("open:coherence-offline-pack-v2-"))
      ?.slice("open:".length);
    expect(stores.has(stagingName!)).toBe(false);
    expect(stores.get(offlineReaderMetadataCacheName)?.get(recordKey)?.body).toBe(
      oldRecord,
    );
    expect(stores.has(oldCacheName)).toBe(true);
  });

  it("keeps the activated package when old-cache cleanup fails", async () => {
    const { stores } = installCacheStub(
      {
        [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
        [oldCacheName]: { "/old-clip.mp3": "old audio" },
      },
      { cacheDeleteFailures: new Set([oldCacheName]) },
    );
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => Promise.resolve(responseForPackUrl(url)),
    });

    await expect(
      cacheOfflineAudioPack(publisherPack, () => undefined),
    ).resolves.toMatchObject({ complete: true, superseded: false });
    const activeRecord = JSON.parse(
      stores.get(offlineReaderMetadataCacheName)!.get(recordKey)!.body,
    ) as { cacheName: string };
    expect(stores.has(activeRecord.cacheName)).toBe(true);
    expect(stores.has(oldCacheName)).toBe(true);
  });

  it("uses collision-proof fallback staging names across concurrent tabs", async () => {
    vi.stubGlobal("crypto", {});
    vi.spyOn(Date, "now").mockReturnValue(1234);
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValue(0.3);
    const { events, stores } = installCacheStub({
      [offlineReaderMetadataCacheName]: { [recordKey]: oldRecord },
      [oldCacheName]: { "/old-clip.mp3": "old audio" },
    });
    const concurrentPack = {
      ...pack,
      urls: ["/concurrent.opus"],
    };
    let releaseFirst: ((response: Response) => void) | undefined;
    let firstStarted: (() => void) | undefined;
    let fetchCount = 0;
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: (url: string) => {
        const pathname = new URL(url, "https://coherence.invalid").pathname;
        if (pathname === "/concurrent.opus") {
          fetchCount += 1;
        }
        if (fetchCount === 1) {
          firstStarted?.();
          return new Promise<Response>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return Promise.resolve(responseForPackUrl(url));
      },
    });

    const first = cacheOfflineAudioPack(concurrentPack, () => undefined);
    await firstStartedPromise;
    await cacheOfflineAudioPack(concurrentPack, () => undefined);
    releaseFirst?.(new Response("unavailable", { status: 503 }));
    await expect(first).rejects.toThrow("Unable to download");

    const activeRecord = JSON.parse(
      stores.get(offlineReaderMetadataCacheName)!.get(recordKey)!.body,
    ) as { cacheName: string; packageVersion: string };
    const stagingNames = events
      .filter((event) => event.startsWith("open:coherence-offline-pack-v2-"))
      .map((event) => event.slice("open:".length));
    expect(new Set(stagingNames).size).toBe(2);
    expect(activeRecord.packageVersion).toBe(concurrentPack.packageVersion);
    expect(stores.has(activeRecord.cacheName)).toBe(true);
  });
});
