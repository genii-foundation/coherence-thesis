import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const renderEmbeddedPage = vi.fn(async () => null);
  const resolveRoute = vi.fn(() => ({ status: "not-found" as const }));
  const reader = {
    routes: {
      redirects: [
        {
          from: "/manuscripts/1/old/",
          status: 308,
          to: "/manuscripts/1/current/",
        },
      ],
    },
  };
  const fullApplication = Object.defineProperties(Object.create(null), {
    reader: { enumerable: true, value: reader },
    ReaderPrepaint: {
      enumerable: true,
      get(): never {
        throw new TypeError("ReaderPrepaint must not escape the loader");
      },
    },
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
    RootPage: {
      enumerable: true,
      get(): never {
        throw new TypeError("RootPage must not escape the loader");
      },
    },
    renderPage: {
      enumerable: true,
      get(): never {
        throw new TypeError("renderPage must not escape the loader");
      },
    },
    renderEmbeddedPage: { enumerable: true, value: renderEmbeddedPage },
    resolveRoute: { enumerable: true, value: resolveRoute },
    unexpectedFullApplicationKey: { enumerable: true, value: true },
  });
  return {
    createPublicationNextApplication: vi.fn(async () => ({
      valid: true as const,
      value: fullApplication,
    })),
    createCoherencePublisherApplicationOptions: vi.fn(({ reader }) =>
      Object.freeze({ reader }),
    ),
    fullApplication,
    reader,
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
    renderEmbeddedPage,
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

import { coherencePublisherTransitionPreviewBoundary } from "./transition-preview-application";

describe("Coherence Publisher application loader", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createPublicationNextApplication.mockClear();
    mocks.createCoherencePublisherApplicationOptions.mockClear();
    mocks.readFileSync.mockClear();
    mocks.validateCoherencePublisherRuntimeMigrationArtifacts.mockClear();
    mocks.reader.routes.redirects = [
      {
        from: "/manuscripts/1/old/",
        status: 308,
        to: "/manuscripts/1/current/",
      },
    ];
  });

  it("caches the exact redirect index and returns only the transition facade", async () => {
    const {
      loadCoherencePublisherApplication,
      resolveCoherencePublisherApplicationRedirect,
    } = await import("./application");
    const application = await loadCoherencePublisherApplication();

    expect(Reflect.ownKeys(application)).toEqual(
      coherencePublisherTransitionPreviewBoundary.exposedApplicationKeys,
    );
    expect("ReaderProviders" in application).toBe(false);
    expect("RootLayout" in application).toBe(false);
    expect("reader" in application).toBe(false);
    expect("ReaderPrepaint" in application).toBe(false);
    expect("RootPage" in application).toBe(false);
    expect("renderPage" in application).toBe(false);
    expect(application.renderEmbeddedPage).toBe(mocks.renderEmbeddedPage);
    expect(application.resolveRoute).toBe(mocks.resolveRoute);
    expect(Object.isFrozen(application)).toBe(true);
    await expect(loadCoherencePublisherApplication()).resolves.toBe(
      application,
    );

    await expect(
      resolveCoherencePublisherApplicationRedirect(
        "/manuscripts/1/old/",
      ),
    ).resolves.toEqual({
      status: 308,
      targetHref: "/manuscripts/1/current/",
    });
    const redirect = await resolveCoherencePublisherApplicationRedirect(
      "/manuscripts/1/old/",
    );
    expect(Object.isFrozen(redirect)).toBe(true);
    await expect(
      resolveCoherencePublisherApplicationRedirect("/manuscripts/1/old"),
    ).resolves.toBeNull();
    await expect(
      resolveCoherencePublisherApplicationRedirect(
        "/manuscripts/1/missing/",
      ),
    ).resolves.toBeNull();

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

  it("fails closed when explicit redirect sources are duplicated", async () => {
    mocks.reader.routes.redirects = [
      {
        from: "/manuscripts/1/old/",
        status: 308,
        to: "/manuscripts/1/current/",
      },
      {
        from: "/manuscripts/1/old/",
        status: 308,
        to: "/manuscripts/1/other/",
      },
    ];
    const { loadCoherencePublisherApplication } = await import("./application");

    await expect(loadCoherencePublisherApplication()).rejects.toThrow(
      "duplicate explicit redirect source: /manuscripts/1/old/",
    );
  });

  it("fails closed when an explicit redirect is not permanent", async () => {
    mocks.reader.routes.redirects = [
      {
        from: "/manuscripts/1/old/",
        status: 307,
        to: "/manuscripts/1/current/",
      },
    ];
    const { resolveCoherencePublisherApplicationRedirect } = await import(
      "./application"
    );

    await expect(
      resolveCoherencePublisherApplicationRedirect(
        "/manuscripts/1/old/",
      ),
    ).rejects.toThrow(
      "preview supports only explicit 308 redirects: /manuscripts/1/old/",
    );
  });
});
