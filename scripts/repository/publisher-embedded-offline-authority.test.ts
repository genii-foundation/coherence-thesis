import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { repoRoot } from "./paths";
import {
  auditCoherencePublisherEmbeddedOfflineAuthority,
  coherencePublisherEmbeddedHostSourcesBuildId,
  projectCoherencePublisherEmbeddedHostSources,
} from "./publisher-embedded-offline-authority";

const requiredSources = [
  ".nvmrc",
  "package-lock.json",
  "package.json",
  "public/offline-sw.js",
  "src/app/globals.css",
  "src/app/reset.css",
  "src/components/AudioPlayerIsland.tsx",
  "src/components/CoherenceSiteFrame.tsx",
  "src/components/LegacyFragmentRedirectIsland.tsx",
  "src/components/OfflineSupportIsland.tsx",
  "src/components/ReaderAudioWordInteractionIsland.tsx",
  "src/components/ReaderEngagementIsland.tsx",
  "src/components/SiteShell.tsx",
  "src/components/ToolbarProgressIsland.tsx",
  "src/lib/audio-offline-cache.ts",
  "src/lib/reader-bookmarks.ts",
  "src/lib/reader-preferences.ts",
  "src/lib/reader-progress-store.ts",
  "src/lib/reader-sync.ts",
  "src/publisher/application-config.ts",
  "src/publisher/application.ts",
  "src/publisher/coherence-theme.ts",
  "src/publisher/embedded-offline-authority.ts",
  "src/publisher/embedded-reader-appearance.ts",
  "src/publisher/legacy-audio-word-bridge-client.tsx",
  "src/publisher/legacy-audio-word-bridge.ts",
  "src/publisher/legacy-fragment-continuity.ts",
  "src/publisher/legacy-reader-bookmark-bridge-client.tsx",
  "src/publisher/legacy-reader-bookmark-bridge.ts",
  "src/publisher/legacy-reader-progress-bridge.ts",
  "src/publisher/runtime-artifact-validation.ts",
  "src/publisher/transition-page.tsx",
  "src/publisher/transition-preview-application.ts",
  "tsconfig.json",
] as const;

type WorkerFetchEvent = Readonly<{
  request: Request;
  respondWith(response: Promise<Response>): void;
}>;

function evaluateOfflineServiceWorker(input: Readonly<{
  cachesOpen?: (name: string) => Promise<unknown>;
  fetch?: (request: Request) => Promise<Response>;
}> = {}) {
  const listeners = new Map<string, (event: WorkerFetchEvent) => void>();
  const cachesOpen = input.cachesOpen ?? vi.fn(async () => ({
    keys: async () => [],
    match: async () => undefined,
    put: async () => undefined,
  }));
  const context: Record<string, unknown> = {
    URL,
    caches: {
      delete: async () => true,
      open: cachesOpen,
    },
    fetch: input.fetch ?? (async () => new Response("network")),
    Response,
    self: {
      addEventListener: (
        name: string,
        listener: (event: WorkerFetchEvent) => void,
      ) => listeners.set(name, listener),
      clients: { claim: async () => undefined },
      location: { origin: "https://coherence.test" },
      skipWaiting: async () => undefined,
    },
  };
  runInNewContext(
    fs.readFileSync(path.join(repoRoot, "public", "offline-sw.js"), "utf8"),
    context,
  );
  return {
    cachesOpen,
    fetchListener: listeners.get("fetch"),
    isPackRecord: context.isPackRecord as (value: unknown) => boolean,
    matchActivePackage: context.matchActivePackage as (
      request: Request,
    ) => Promise<Response | undefined>,
  };
}

describe("Publisher embedded offline authority validator", () => {
  it("binds the exact tracked candidate and conservative production source closure", () => {
    const audit = auditCoherencePublisherEmbeddedOfflineAuthority();
    const paths = audit.sources.map(({ path }) => path);

    expect(audit.issues).toEqual([]);
    expect(audit.candidateBuildId).toBe(
      "sha256:520f8850edf46a0e83f326f9eb04b80467461310822781d5dba7f27ee912c2cc",
    );
    expect(audit.hostSourcesBuildId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(audit.sourceCount).toBe(124);
    expect(audit.sources).toHaveLength(124);
    expect(audit.sourceBytes).toBe(1_615_141);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual(expect.arrayContaining([...requiredSources]));
    expect(paths).not.toContain("generated/manuscripts/catalog.json");
    expect(paths).not.toContain(
      "src/publisher/embedded-offline-candidate.json",
    );
    expect(paths).not.toContain(
      "src/publisher/embedded-offline-host-identity.ts",
    );
    expect(
      paths.some(
        (sourcePath) =>
          sourcePath.startsWith("/") ||
          sourcePath === ".." ||
          sourcePath.startsWith("../"),
      ),
    ).toBe(false);
    expect(paths.some((sourcePath) => sourcePath.includes(".test."))).toBe(false);
  });

  it("changes the source identity for any covered byte change", () => {
    const sources = projectCoherencePublisherEmbeddedHostSources();
    const current = coherencePublisherEmbeddedHostSourcesBuildId(sources);
    const changed = sources.map((source, index) =>
      index === 0
        ? { ...source, sha256: `sha256:${"f".repeat(64)}` }
        : source
    );

    expect(coherencePublisherEmbeddedHostSourcesBuildId(changed)).not.toBe(
      current,
    );
  });

  it("makes the service worker ignore reserved package-install requests", () => {
    const { cachesOpen, fetchListener } = evaluateOfflineServiceWorker();
    expect(fetchListener).toBeDefined();
    const bypassRespondWith = vi.fn();
    fetchListener!({
      request: new Request(
        "https://coherence.test/manuscripts/one/?__coherence_offline_install=unique",
      ),
      respondWith: bypassRespondWith,
    });
    expect(bypassRespondWith).not.toHaveBeenCalled();
    expect(cachesOpen).not.toHaveBeenCalled();

    const ordinaryRespondWith = vi.fn();
    fetchListener!({
      request: new Request("https://coherence.test/manuscripts/one/"),
      respondWith: ordinaryRespondWith,
    });
    expect(ordinaryRespondWith).toHaveBeenCalledOnce();
  });

  it("accepts only exact v2 and v3 metadata record shapes in the worker", () => {
    const { isPackRecord } = evaluateOfflineServiceWorker();
    const v2 = {
      cacheName: "pack-current",
      href: "/manuscripts/one/",
      packageVersion: "legacy-version",
      savedAt: "2026-08-31T00:00:00.000Z",
      urls: ["/manuscripts/one/"],
      volumeId: "one",
    };
    const publisherRuntimeAuthority = {
      buildId: `sha256:${"a".repeat(64)}`,
      kind: "publisher-embedded",
      schemaVersion: 3,
    };
    const v3 = {
      ...v2,
      publisherRuntimeAuthority,
      schemaVersion: 3,
    };

    expect(isPackRecord(v2)).toBe(true);
    expect(isPackRecord(v3)).toBe(true);
    for (const malformed of [
      { ...v2, schemaVersion: 3 },
      { ...v3, publisherRuntimeAuthority: undefined },
      {
        ...v3,
        publisherRuntimeAuthority: {
          ...publisherRuntimeAuthority,
          buildId: "sha256:bad",
        },
      },
      { ...v3, unexpected: true },
      { ...v2, urls: [42] },
    ]) {
      expect(isPackRecord(malformed)).toBe(false);
    }
  });

  it("never serves a cache selected by malformed hybrid metadata", async () => {
    const recordKey =
      "https://coherence.invalid/__offline-pack__/volume-one";
    const request = new Request("https://coherence.test/manuscripts/one/");
    const validV3 = {
      cacheName: "publisher-pack",
      href: "/manuscripts/one/",
      packageVersion: `v3:legacy:${"a".repeat(64)}`,
      publisherRuntimeAuthority: {
        buildId: `sha256:${"a".repeat(64)}`,
        kind: "publisher-embedded",
        schemaVersion: 3,
      },
      savedAt: "2026-08-31T00:00:00.000Z",
      schemaVersion: 3,
      urls: ["/manuscripts/one/"],
      volumeId: "one",
    };
    const evaluateRecord = (record: unknown) => {
      const packMatch = vi.fn(async () => new Response("cached package"));
      const cachesOpen = vi.fn(async (name: string) =>
        name === "coherence-offline-metadata-v2"
          ? {
              keys: async () => [new Request(recordKey)],
              match: async () => new Response(JSON.stringify(record)),
            }
          : { match: packMatch }
      );
      return {
        packMatch,
        worker: evaluateOfflineServiceWorker({ cachesOpen }),
      };
    };

    const malformed = evaluateRecord({
      ...validV3,
      publisherRuntimeAuthority: undefined,
    });
    await expect(
      malformed.worker.matchActivePackage(request),
    ).resolves.toBeUndefined();
    expect(malformed.packMatch).not.toHaveBeenCalled();

    const valid = evaluateRecord(validV3);
    const response = await valid.worker.matchActivePackage(request);
    await expect(response?.text()).resolves.toBe("cached package");
    expect(valid.packMatch).toHaveBeenCalledOnce();
  });
});
