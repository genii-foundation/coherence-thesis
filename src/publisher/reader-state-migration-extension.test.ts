import { createHash, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createReaderProgressStorageKey } from "@genii-foundation/publisher-reader/progress";

import {
  createCoherenceReaderStateMigrationExtensionRegistration,
  type CoherenceReaderStateMigrationProjection,
} from "./reader-state-migration-extension";
import {
  COHERENCE_READER_STATE_MIGRATION_RECEIPT_KEY,
  migrateCoherenceReaderStateInBrowser,
  type CoherenceReaderStateMigrationBrowserEnvironment,
} from "./reader-state-migration-extension-client";
import type { CoherenceReaderStateMigrationArtifact } from "./reader-state-migration-schema";

const sha = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

const artifact: CoherenceReaderStateMigrationArtifact = Object.freeze({
  schemaVersion: "1.0",
  publicationId: "publication",
  readerBuildId: sha("a"),
  href: "/publisher/coherence-reader-state-migration.json",
  legacyProgressStorageKeys: Object.freeze([
    "coherence-reader-progress-v2",
    "coherence-reader-progress-v1",
  ] as const),
  legacyBookmarksStorageKeys: Object.freeze([
    "coherence-reader-bookmarks-v2",
    "coherence-reader-bookmarks-v1",
  ] as const),
  sections: Object.freeze([
    Object.freeze({
      workId: "work",
      sectionId: "section",
      sectionContinuityId: "continuity",
      acceptedLegacySectionIds: Object.freeze(["section"]),
      acceptedLegacyContinuityIds: Object.freeze(["continuity"]),
      href: "/work/section/",
      legacyContentHash: "0123456789abcdef",
      contentHash: sha("b"),
      paragraphs: Object.freeze([]),
    }),
  ]),
  buildId: sha("d"),
});

function fixture(): Readonly<{
  environment: CoherenceReaderStateMigrationBrowserEnvironment;
  projection: CoherenceReaderStateMigrationProjection;
  storage: Map<string, string>;
}> {
  const bytes = new TextEncoder().encode(JSON.stringify(artifact));
  const href = "https://publication.test/publisher/coherence-reader-state-migration.json";
  const response = new Response(bytes, {
    status: 200,
    headers: {
      "content-length": String(bytes.byteLength),
      "content-type": "application/json; charset=utf-8",
    },
  });
  Object.defineProperty(response, "url", { value: href });
  const storage = new Map<string, string>();
  storage.set("coherence-reader-progress-v2", JSON.stringify({
    sections: {
      continuity: {
        sectionId: "section",
        contentHash: "0123456789abcdef",
        continuityIds: ["continuity"],
        readAt: 500,
        percent: 100,
        activeSeconds: 12,
      },
    },
  }));
  return Object.freeze({
    projection: Object.freeze({
      schemaVersion: "1.0",
      publicationId: "publication",
      artifact: Object.freeze({
        href: artifact.href,
        readerBuildId: artifact.readerBuildId,
        buildId: artifact.buildId,
        byteSize: bytes.byteLength,
        sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      }),
    }),
    storage,
    environment: Object.freeze({
      origin: "https://publication.test",
      fetch: async () => {
        const next = response.clone();
        Object.defineProperty(next, "url", { value: href });
        return next;
      },
      crypto: webcrypto as unknown as Crypto,
      now: () => 1_000,
      readStorage: (key: string) => storage.get(key) ?? null,
      writeStorage: (key: string, value: string) => {
        storage.set(key, value);
      },
    }),
  });
}

describe("Coherence Reader state migration extension", () => {
  it("projects only the bound browser artifact identity", () => {
    const { projection } = fixture();
    const registration = createCoherenceReaderStateMigrationExtensionRegistration(
      projection,
    );
    expect(registration.capabilities).toEqual([
      "content.project",
      "renderer.client",
    ]);
    expect(registration.implementation.project?.({
      content: { publicationId: "publication" },
      config: {},
      payloads: [],
    } as never)).toEqual({
      valid: true,
      value: {
        clientData: projection,
        offlineResources: [{
          href: projection.artifact.href,
          kind: "data",
          byteSize: projection.artifact.byteSize,
        }],
      },
      diagnostics: [],
    });
    expect(() => registration.implementation.project?.({
      content: { publicationId: "other" },
      config: {},
      payloads: [],
    } as never)).toThrow(/publication identity drifted/u);
  });

  it("writes native Publisher state once and preserves every legacy key", async () => {
    const { environment, projection, storage } = fixture();
    const legacy = storage.get("coherence-reader-progress-v2");
    const result = await migrateCoherenceReaderStateInBrowser(
      projection,
      environment,
    );
    expect(result).toMatchObject({
      progressWritten: true,
      bookmarksWritten: false,
      progressAccepted: 1,
      progressRefused: 0,
    });
    expect(storage.get("coherence-reader-progress-v2")).toBe(legacy);
    expect(storage.get(createReaderProgressStorageKey("publication")))
      .toContain("continuity");
    expect(storage.get(COHERENCE_READER_STATE_MIGRATION_RECEIPT_KEY))
      .toContain(artifact.buildId);

    const nativeState = storage.get(createReaderProgressStorageKey("publication"));
    const repeated = await migrateCoherenceReaderStateInBrowser(
      projection,
      environment,
    );
    expect(repeated.progressWritten).toBe(false);
    expect(storage.get(createReaderProgressStorageKey("publication")))
      .toBe(nativeState);
  });

  it("rejects artifact digest and structural drift before storage writes", async () => {
    const { environment, projection, storage } = fixture();
    const before = new Map(storage);
    await expect(migrateCoherenceReaderStateInBrowser({
      ...projection,
      artifact: { ...projection.artifact, sha256: sha("f") },
    }, environment)).rejects.toThrow(/digest drifted/u);
    expect(storage).toEqual(before);
  });
});
