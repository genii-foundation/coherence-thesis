import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const ReaderPrepaint = vi.fn();
  const RootPage = vi.fn(async () => null);
  const renderPage = vi.fn(async () => null);
  const resolveRoute = vi.fn(() => ({ status: "not-found" as const }));
  const fullApplication = Object.defineProperties(Object.create(null), {
    ReaderPrepaint: { enumerable: true, value: ReaderPrepaint },
    ReaderProviders: {
      enumerable: true,
      get(): never {
        throw new TypeError("ReaderProviders must not escape the loader");
      },
    },
    RootLayout: {
      enumerable: true,
      get(): never {
        throw new TypeError("RootLayout must not escape the loader");
      },
    },
    RootPage: { enumerable: true, value: RootPage },
    renderPage: { enumerable: true, value: renderPage },
    resolveRoute: { enumerable: true, value: resolveRoute },
    unexpectedFullApplicationKey: { enumerable: true, value: true },
  });
  return {
    ReaderPrepaint,
    RootPage,
    createPublicationNextApplication: vi.fn(async () => ({
      valid: true as const,
      value: fullApplication,
    })),
    createCoherencePublisherApplicationOptions: vi.fn(({ reader }) =>
      Object.freeze({ reader }),
    ),
    fullApplication,
    readFileSync: vi.fn((filePath: string) => {
      if (filePath.endsWith("publication-reader.json")) {
        return '{"buildId":"reader-build"}';
      }
      if (filePath.endsWith("publication-extensions.json")) {
        return '{"schema":"extension-data"}';
      }
      if (filePath.endsWith("coherence-reader-state-migration.json")) {
        return '{"schema":"migration"}';
      }
      throw new TypeError(`Unexpected application artifact: ${filePath}`);
    }),
    renderPage,
    resolveRoute,
    validateCoherencePublisherRuntimeMigrationArtifacts: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("node:fs", () => ({
  default: { readFileSync: mocks.readFileSync },
}));
vi.mock("@genii-foundation/publisher-next/host", () => ({
  PUBLISHER_NEXT_EXTENSION_DATA_PATH: "publication-extensions.json",
  PUBLISHER_NEXT_READER_DATA_PATH: "publication-reader.json",
}));
vi.mock("@genii-foundation/publisher-next/server", () => ({
  createPublicationNextApplication: mocks.createPublicationNextApplication,
}));
vi.mock("@/publisher/application-config", () => ({
  createCoherencePublisherApplicationOptions:
    mocks.createCoherencePublisherApplicationOptions,
}));
vi.mock("@/publisher/runtime-artifact-validation", () => ({
  validateCoherencePublisherRuntimeMigrationArtifacts:
    mocks.validateCoherencePublisherRuntimeMigrationArtifacts,
}));
vi.mock("@/publisher/reader-state-migration-schema", () => ({
  COHERENCE_READER_STATE_MIGRATION_HREF:
    "/publisher/coherence-reader-state-migration.json",
}));

import { loadCoherencePublisherApplication } from "./application";
import { coherencePublisherTransitionPreviewBoundary } from "./transition-preview-application";

describe("Coherence Publisher application loader", () => {
  it("caches and returns only the exact transition preview facade", async () => {
    const application = await loadCoherencePublisherApplication();

    expect(Reflect.ownKeys(application)).toEqual(
      coherencePublisherTransitionPreviewBoundary.exposedApplicationKeys,
    );
    expect("ReaderProviders" in application).toBe(false);
    expect("RootLayout" in application).toBe(false);
    expect(application.ReaderPrepaint).toBe(mocks.ReaderPrepaint);
    expect(application.RootPage).toBe(mocks.RootPage);
    expect(application.renderPage).toBe(mocks.renderPage);
    expect(application.resolveRoute).toBe(mocks.resolveRoute);
    expect(Object.isFrozen(application)).toBe(true);
    await expect(loadCoherencePublisherApplication()).resolves.toBe(
      application,
    );

    expect(mocks.createPublicationNextApplication).toHaveBeenCalledOnce();
    expect(
      mocks.createCoherencePublisherApplicationOptions,
    ).toHaveBeenCalledExactlyOnceWith({
      reader: { buildId: "reader-build" },
    });
    expect(
      mocks.validateCoherencePublisherRuntimeMigrationArtifacts,
    ).toHaveBeenCalledExactlyOnceWith({
      reader: { buildId: "reader-build" },
      extensionData: { schema: "extension-data" },
      migrationText: '{"schema":"migration"}',
    });
    expect(mocks.readFileSync).toHaveBeenCalledTimes(3);
  });
});
