import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalizeJson,
  hashCanonicalJson,
  sha256,
} from "@genii-foundation/publisher-content";
import {
  writeHostArtifact,
  type ArtifactDestination,
  type ArtifactWriteResult,
  type BuiltPublicationReader,
} from "@genii-foundation/publisher/node";
import { createPublisherNextRoutePlan } from "@genii-foundation/publisher-next/config";
import type {
  JSONValue,
  UpdatesEnvelope,
} from "@genii-foundation/publisher-schema";
import {
  PublisherReaderBuildError,
  createCoherencePublisherRuntimeArtifacts,
  createPublisherReaderArtifacts,
  createPublisherReaderBuild,
  defaultPublisherReaderBuildPaths,
  runPublisherReaderBuild,
  writePublisherReaderArtifactSet,
  type PublisherReaderBuildPaths,
} from "./reader-build";
import {
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
  COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION,
  type CoherenceReaderStateMigrationProjection,
} from "../../src/publisher/reader-state-migration-extension-contract";
import {
  COHERENCE_READER_STATE_MIGRATION_HREF,
  COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION,
  type CoherenceReaderStateMigrationArtifact,
} from "../../src/publisher/reader-state-migration-schema";
import type {
  MaterializedCoherenceReaderStateMigrationArtifact,
} from "./reader-state-migration-artifact";

const temporaryRoots: string[] = [];

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createPublicationFixture(): PublisherReaderBuildPaths {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "coherence-publisher-reader-"),
  );
  temporaryRoots.push(root);
  const workRoot = path.join(root, "publication", "works", "sample");
  fs.mkdirSync(workRoot, { recursive: true });
  fs.writeFileSync(
    path.join(workRoot, "manuscript.md"),
    "# A measured beginning\n\nThe rain arrived before the bell.\n",
    "utf8",
  );
  writeJson(path.join(workRoot, "work.json"), {
    $schema: "https://publisher.genii.foundation/schemas/work.schema.json",
    schemaVersion: "1.0",
    id: "sample",
    title: "A Measured Beginning",
    language: "en",
    publicationState: "published",
    route: "/works/sample/",
    manuscript: "manuscript.md",
  });
  writeJson(path.join(root, "publication.json"), {
    $schema:
      "https://publisher.genii.foundation/schemas/publication.schema.json",
    schemaVersion: "1.0",
    publication: {
      id: "reader-build-fixture",
      title: "Reader Build Fixture",
      language: "en",
      publisher: { name: "GENII Foundation" },
    },
    engine: { compatibility: "0.1.0-alpha.0" },
    layout: { mode: "canonical" },
    works: [{ id: "sample" }],
    routes: { home: "/", work: "/works/{workId}/" },
    boundaries: {
      sourceRoots: ["publication"],
      outputRoots: [".publisher"],
    },
    attribution: {
      placement: "footer",
      copyright: "Copyright 2026 GENII Foundation",
      text: "Published with GENII Publisher",
      url: "https://publisher.genii.foundation",
      sourceCodeUrl: "https://github.com/genii-foundation/coherence-thesis",
    },
  });
  return {
    publicationRoot: root,
    hostRoot: path.join(root, "generated-host"),
    protectedRoots: [path.join(root, "publication")],
  };
}

async function createRuntimeArtifactFixture(
  paths: PublisherReaderBuildPaths,
  artifactPaths?: NonNullable<PublisherReaderBuildPaths["artifactPaths"]>,
): Promise<Readonly<{
  artifacts: ReturnType<typeof createCoherencePublisherRuntimeArtifacts>;
  built: BuiltPublicationReader;
  stateMigrationArtifact: MaterializedCoherenceReaderStateMigrationArtifact;
  updatesData: UpdatesEnvelope;
  updatesDataText: string;
}>> {
  const rawBuilt = (await createPublisherReaderBuild(paths)).built;
  const migrationBasis = Object.freeze({
    schemaVersion: COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION,
    publicationId: rawBuilt.reader.publicationId,
    readerBuildId: rawBuilt.reader.buildId,
    href: COHERENCE_READER_STATE_MIGRATION_HREF,
    legacyProgressStorageKeys: Object.freeze([
      "coherence-reader-progress-v2",
      "coherence-reader-progress-v1",
    ] as const),
    legacyBookmarksStorageKeys: Object.freeze([
      "coherence-reader-bookmarks-v2",
      "coherence-reader-bookmarks-v1",
    ] as const),
    sections: Object.freeze([]),
  });
  const migrationArtifact: CoherenceReaderStateMigrationArtifact =
    Object.freeze({
      ...migrationBasis,
      buildId: hashCanonicalJson(migrationBasis as unknown as JSONValue),
    });
  const migrationText = canonicalizeJson(
    migrationArtifact as unknown as JSONValue,
  );
  const projection: CoherenceReaderStateMigrationProjection = Object.freeze({
    schemaVersion: COHERENCE_READER_STATE_MIGRATION_SCHEMA_VERSION,
    publicationId: rawBuilt.reader.publicationId,
    artifact: Object.freeze({
      href: COHERENCE_READER_STATE_MIGRATION_HREF,
      readerBuildId: rawBuilt.reader.buildId,
      buildId: migrationArtifact.buildId,
      byteSize: Buffer.byteLength(migrationText, "utf8"),
      sha256: sha256(migrationText),
    }),
  });
  const extensionEntry = Object.freeze({
    id: COHERENCE_READER_STATE_MIGRATION_EXTENSION_ID,
    package: COHERENCE_READER_STATE_MIGRATION_EXTENSION_PACKAGE,
    version: COHERENCE_READER_STATE_MIGRATION_EXTENSION_VERSION,
    capabilities: COHERENCE_READER_STATE_MIGRATION_EXTENSION_CAPABILITIES,
    config: Object.freeze({}),
    clientData: projection,
    offlineResources: Object.freeze([
      Object.freeze({
        href: COHERENCE_READER_STATE_MIGRATION_HREF,
        kind: "data" as const,
        byteSize: Buffer.byteLength(migrationText, "utf8"),
      }),
    ]),
  });
  const extensionBasis = Object.freeze({
    schemaVersion: "1.0" as const,
    publicationId: rawBuilt.reader.publicationId,
    engineVersion: rawBuilt.reader.engineVersion,
    readerBuildId: rawBuilt.reader.buildId,
    extensions: Object.freeze([extensionEntry]),
  });
  const extensionData = Object.freeze({
    ...extensionBasis,
    buildId: hashCanonicalJson(extensionBasis as unknown as JSONValue),
  });
  const built = Object.freeze({
    ...rawBuilt,
    extensions: Object.freeze({
      envelope: extensionData,
      text: `${canonicalizeJson(extensionData as unknown as JSONValue)}\n`,
    }),
  }) as unknown as BuiltPublicationReader;
  const stateMigrationArtifact = Object.freeze({
    artifact: migrationArtifact,
    text: migrationText,
    byteSize: Buffer.byteLength(migrationText, "utf8"),
    sha256: sha256(migrationText),
  });
  const updatesData: UpdatesEnvelope = Object.freeze({
    $schema:
      "https://publisher.genii.foundation/schemas/updates-envelope.schema.json",
    schemaVersion: "1.0",
    publicationId: rawBuilt.reader.publicationId,
    engineVersion: rawBuilt.reader.engineVersion,
    buildId: rawBuilt.reader.buildId,
    source: Object.freeze({
      adapter: Object.freeze({ package: "reader-build-fixture" }),
      catalogPath: "updates/catalog.json",
      catalogSha256: `sha256:${"0".repeat(64)}`,
    }),
    views: Object.freeze([
      Object.freeze({
        id: "all",
        title: "Updates",
        entries: Object.freeze([]),
      }),
    ]),
  });
  const updatesDataText = `${canonicalizeJson(
    updatesData as unknown as JSONValue,
  )}\n`;
  return Object.freeze({
    artifacts: createCoherencePublisherRuntimeArtifacts({
      built,
      stateMigrationArtifact,
      updatesData,
      updatesDataText,
      ...(artifactPaths === undefined ? {} : { paths: artifactPaths }),
    }),
    built,
    stateMigrationArtifact,
    updatesData,
    updatesDataText,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Publisher Reader build", () => {
  it("maps the established host to private server data and public client data", () => {
    expect(defaultPublisherReaderBuildPaths.hostRoot).toBe(
      defaultPublisherReaderBuildPaths.publicationRoot,
    );
    expect(defaultPublisherReaderBuildPaths.artifactPaths).toEqual({
      reader: "generated/publisher/host/publication-reader.json",
      search: "public/publication-reader-search.json",
      progress: "public/publication-reader-progress.json",
      publicIdentity:
        "generated/publisher/host/publication-public-identity.json",
      extensionData:
        "generated/publisher/host/publication-extensions.json",
      stateMigration:
        "public/publisher/coherence-reader-state-migration.json",
      updatesData:
        "generated/publisher/host/publication-updates.json",
    });
  });

  it("materializes Reader artifacts before every application runtime entry", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(defaultPublisherReaderBuildPaths.publicationRoot, "package.json"),
        "utf8",
      ),
    ) as { scripts: Record<string, string> };

    for (const lifecycle of [
      "predev",
      "predev:e2e",
      "prebuild",
      "prestart",
      "prepreview:production",
    ]) {
      expect(manifest.scripts[lifecycle]).toBe(
        "npm run publisher:reader:materialize",
      );
    }
    expect(manifest.scripts["prepublisher:reader:materialize"]).toBe(
      "npm run publisher:manifests:check",
    );
    expect(manifest.scripts["publisher:reader:materialize"]).toBe(
      "tsx scripts/publisher/reader-build.ts --write",
    );
  });

  it("constructs the exact four ordered artifacts from validated projections", async () => {
    const paths = createPublicationFixture();
    const built = (await createPublisherReaderBuild(paths)).built;
    const artifacts = createPublisherReaderArtifacts({
      reader: built.reader,
      search: built.search.index,
      progress: built.progress.catalog,
    });

    expect(artifacts.map(({ hostRelativePath }) => hostRelativePath)).toEqual([
      "publication-reader.json",
      "public/publication-reader-search.json",
      "public/publication-reader-progress.json",
      "publication-public-identity.json",
    ]);
    expect(artifacts.map(({ text }) => text)).toEqual([
      built.text,
      built.search.text,
      built.progress.text,
      built.publicIdentity.text,
    ]);
    expect(Object.isFrozen(artifacts)).toBe(true);
    expect(artifacts.every((artifact) => Object.isFrozen(artifact))).toBe(true);
  });

  it("constructs one exact seven-artifact adapted runtime bundle with Reader last", async () => {
    const paths = createPublicationFixture();
    const fixture = await createRuntimeArtifactFixture(paths);

    expect(
      fixture.artifacts.map(({ hostRelativePath }) => hostRelativePath),
    ).toEqual([
      "public/publisher/coherence-reader-state-migration.json",
      "public/publication-reader-search.json",
      "public/publication-reader-progress.json",
      "publication-public-identity.json",
      "publication-extensions.json",
      "publication-updates.json",
      "publication-reader.json",
    ]);
    expect(fixture.artifacts.map(({ text }) => text)).toEqual([
      fixture.stateMigrationArtifact.text,
      fixture.built.search.text,
      fixture.built.progress.text,
      fixture.built.publicIdentity.text,
      fixture.built.extensions?.text,
      fixture.updatesDataText,
      fixture.built.text,
    ]);
    expect(Object.isFrozen(fixture.artifacts)).toBe(true);
    expect(
      fixture.artifacts.every((artifact) => Object.isFrozen(artifact)),
    ).toBe(true);
  });

  it("refuses a drifted migration artifact before materialization", async () => {
    const paths = createPublicationFixture();
    const fixture = await createRuntimeArtifactFixture(paths);

    expect(() =>
      createCoherencePublisherRuntimeArtifacts({
        built: fixture.built,
        stateMigrationArtifact: {
          ...fixture.stateMigrationArtifact,
          text: `${fixture.stateMigrationArtifact.text} `,
        },
        updatesData: fixture.updatesData,
        updatesDataText: fixture.updatesDataText,
      })
    ).toThrow(/migration artifact/u);
  });

  it("requires exact Reader binding and canonical Updates text", async () => {
    const paths = createPublicationFixture();
    const fixture = await createRuntimeArtifactFixture(paths);

    expect(() =>
      createCoherencePublisherRuntimeArtifacts({
        built: fixture.built,
        stateMigrationArtifact: fixture.stateMigrationArtifact,
        updatesData: {
          ...fixture.updatesData,
          buildId: `sha256:${"f".repeat(64)}`,
        },
        updatesDataText: fixture.updatesDataText,
      })
    ).toThrow(/does not match the exact Reader build/u);
    expect(() =>
      createCoherencePublisherRuntimeArtifacts({
        built: fixture.built,
        stateMigrationArtifact: fixture.stateMigrationArtifact,
        updatesData: fixture.updatesData,
        updatesDataText: `${fixture.updatesDataText} `,
      })
    ).toThrow(/does not match the exact Reader build/u);
  });

  it("keeps the exact Updates payload dormant while the Reader has no Updates route", async () => {
    const paths = createPublicationFixture();
    const fixture = await createRuntimeArtifactFixture(paths);
    const withoutUpdates = createPublisherNextRoutePlan(
      fixture.built.reader,
      undefined,
      fixture.built.extensions?.envelope,
    );
    const withUpdates = createPublisherNextRoutePlan(
      fixture.built.reader,
      fixture.updatesData,
      fixture.built.extensions?.envelope,
    );

    expect(withoutUpdates.valid).toBe(true);
    expect(withUpdates).toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "next.updates.view_undeclared",
          path: "/updatesData/views/0/id",
        },
      ],
    });
  });

  it("refuses missing home and mismatched projection identities", async () => {
    const paths = createPublicationFixture();
    const built = (await createPublisherReaderBuild(paths)).built;
    const create = (
      overrides: Partial<Parameters<typeof createPublisherReaderArtifacts>[0]>,
    ) =>
      createPublisherReaderArtifacts({
        reader: built.reader,
        search: built.search.index,
        progress: built.progress.catalog,
        ...overrides,
      });
    const readerWithoutHome = {
      ...built.reader,
      routes: {
        ...built.reader.routes,
        active: built.reader.routes.active.filter(
          ({ target }) => target.kind !== "home",
        ),
      },
    };

    expect(() => create({ reader: readerWithoutHome })).toThrow(
      /exactly one active home route/u,
    );
    expect(() =>
      create({
        search: {
          ...built.search.index,
          readerBuildId: `sha256:${"a".repeat(64)}`,
        },
      }),
    ).toThrow(/search identity does not match/u);
    expect(() =>
      create({
        progress: {
          ...built.progress.catalog,
          publicationId: "another-publication",
        },
      }),
    ).toThrow(/progress identity does not match/u);
    expect(() =>
      create({
        search: {
          ...built.search.index,
          entries: built.search.index.entries.map((entry, index) =>
            index === 0 ? { ...entry, href: "/same-identity-drift/" } : entry,
          ),
        },
      }),
    ).toThrow(/search projection does not exactly match/u);
    expect(() =>
      create({
        progress: {
          ...built.progress.catalog,
          entries: built.progress.catalog.entries.map((entry, index) =>
            index === 0 ? { ...entry, order: entry.order + 1 } : entry,
          ),
        },
      }),
    ).toThrow(/progress projection does not exactly match/u);
  });

  it("validates a complete build without writing host artifacts", async () => {
    const paths = createPublicationFixture();
    const result = await runPublisherReaderBuild({ mode: "validate", paths });

    expect(result.summary).toMatchObject({
      workCount: 1,
      sectionCount: 1,
      routeCount: 2,
      staticParamCount: 2,
      redirectCount: 0,
      slashPolicy: "trailing",
    });
    expect(result.summary.buildId).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.artifacts.map(({ hostRelativePath }) => hostRelativePath)).toEqual(
      [
        "publication-reader.json",
        "public/publication-reader-search.json",
        "public/publication-reader-progress.json",
        "publication-public-identity.json",
      ],
    );
    expect(result.writes).toEqual([]);
    expect(fs.existsSync(paths.hostRoot)).toBe(false);
  });

  it("materializes four exact build-bound files and skips identical rewrites", async () => {
    const paths = createPublicationFixture();
    const expected = await createPublisherReaderBuild(paths);
    const first = await runPublisherReaderBuild({ mode: "write", paths });
    const second = await runPublisherReaderBuild({ mode: "write", paths });

    expect(first.writes.map(({ outcome }) => outcome)).toEqual([
      "written",
      "written",
      "written",
      "written",
    ]);
    expect(second.writes.map(({ outcome }) => outcome)).toEqual([
      "current",
      "current",
      "current",
      "current",
    ]);
    for (const artifact of expected.artifacts) {
      expect(
        fs.readFileSync(
          path.join(paths.hostRoot, artifact.hostRelativePath),
          "utf8",
        ),
      ).toBe(artifact.text);
    }
    const publicIdentity = JSON.parse(
      fs.readFileSync(
        path.join(paths.hostRoot, "publication-public-identity.json"),
        "utf8",
      ),
    ) as { buildId: string };
    expect(publicIdentity.buildId).toBe(first.summary.buildId);
  });

  it("materializes one rollback-bound set across established-host output directories", async () => {
    const paths = createPublicationFixture();
    const establishedPaths: PublisherReaderBuildPaths = {
      ...paths,
      hostRoot: paths.publicationRoot,
      artifactPaths: {
        reader: "generated/publisher/host/publication-reader.json",
        search: "public/publication-reader-search.json",
        progress: "public/publication-reader-progress.json",
        publicIdentity:
          "generated/publisher/host/publication-public-identity.json",
      },
    };
    const result = await runPublisherReaderBuild({
      mode: "write",
      paths: establishedPaths,
    });

    expect(result.writes.map(({ outcome }) => outcome)).toEqual([
      "written",
      "written",
      "written",
      "written",
    ]);
    for (const artifact of result.artifacts) {
      expect(
        fs.readFileSync(
          path.join(establishedPaths.hostRoot, artifact.hostRelativePath),
          "utf8",
        ),
      ).toBe(artifact.text);
    }
  });

  it("restores all seven adapted runtime artifacts when the final Reader write fails", async () => {
    const paths = createPublicationFixture();
    const artifactPaths = {
      reader: "generated/publisher/host/publication-reader.json",
      search: "public/publication-reader-search.json",
      progress: "public/publication-reader-progress.json",
      publicIdentity:
        "generated/publisher/host/publication-public-identity.json",
      extensionData:
        "generated/publisher/host/publication-extensions.json",
      stateMigration:
        "public/publisher/coherence-reader-state-migration.json",
      updatesData:
        "generated/publisher/host/publication-updates.json",
    } as const;
    const establishedPaths: PublisherReaderBuildPaths = {
      ...paths,
      hostRoot: paths.publicationRoot,
      artifactPaths,
    };
    const fixture = await createRuntimeArtifactFixture(paths, artifactPaths);
    const initialWrites = writePublisherReaderArtifactSet({
      artifacts: fixture.artifacts,
      paths: establishedPaths,
    });
    expect(initialWrites.map(({ outcome }) => outcome)).toEqual([
      "written",
      "written",
      "written",
      "written",
      "written",
      "written",
      "written",
    ]);
    const firstDestination = path.join(
      establishedPaths.hostRoot,
      fixture.artifacts[0]!.hostRelativePath,
    );
    fs.writeFileSync(firstDestination, "stale migration artifact\n", "utf8");
    const before = Object.fromEntries(
      fixture.artifacts.map(({ hostRelativePath }) => [
        hostRelativePath,
        fs.readFileSync(
          path.join(establishedPaths.hostRoot, hostRelativePath),
          "utf8",
        ),
      ]),
    );
    let writeCount = 0;
    const failingWriter = (input: {
      destination: ArtifactDestination;
      text: string;
    }): ArtifactWriteResult => {
      writeCount += 1;
      if (writeCount === 7) {
        throw new Error("Synthetic final runtime artifact failure.");
      }
      return writeHostArtifact(input);
    };

    expect(() =>
      writePublisherReaderArtifactSet({
        artifactWriter: failingWriter,
        artifacts: fixture.artifacts,
        paths: establishedPaths,
      })
    ).toThrow("Synthetic final runtime artifact failure.");
    expect(writeCount).toBe(7);
    expect(
      Object.fromEntries(
        fixture.artifacts.map(({ hostRelativePath }) => [
          hostRelativePath,
          fs.readFileSync(
            path.join(establishedPaths.hostRoot, hostRelativePath),
            "utf8",
          ),
        ]),
      ),
    ).toEqual(before);
  });

  it("refuses an invalid publication with Publisher diagnostics", async () => {
    const paths = createPublicationFixture();
    fs.rmSync(path.join(paths.publicationRoot, "publication.json"));

    await expect(createPublisherReaderBuild(paths)).rejects.toBeInstanceOf(
      PublisherReaderBuildError,
    );
    expect(fs.existsSync(paths.hostRoot)).toBe(false);
  });

  it("refuses to materialize inside a protected source root", async () => {
    const paths = createPublicationFixture();
    const protectedHostRoot = path.join(paths.publicationRoot, "publication");

    await expect(
      runPublisherReaderBuild({
        mode: "write",
        paths: { ...paths, hostRoot: protectedHostRoot },
      }),
    ).rejects.toThrow(/protected/u);
    expect(
      fs.existsSync(path.join(protectedHostRoot, "publication-reader.json")),
    ).toBe(false);
  });

  it("refuses a symbolic output root before following it", async () => {
    const paths = createPublicationFixture();
    const protectedRoot = paths.protectedRoots[0]!;
    fs.symlinkSync(protectedRoot, paths.hostRoot, "dir");

    await expect(
      runPublisherReaderBuild({ mode: "write", paths }),
    ).rejects.toThrow(/must not cross a symbolic link/u);
    expect(
      fs.existsSync(path.join(protectedRoot, "publication-reader.json")),
    ).toBe(false);
  });

  it("restores the complete prior artifact set when a later write fails", async () => {
    const paths = createPublicationFixture();
    const initial = await runPublisherReaderBuild({ mode: "write", paths });
    const firstDestination = path.join(
      paths.hostRoot,
      initial.artifacts[0]!.hostRelativePath,
    );
    fs.writeFileSync(firstDestination, "stale first artifact\n", "utf8");
    const before = Object.fromEntries(
      initial.artifacts.map(({ hostRelativePath }) => [
        hostRelativePath,
        fs.readFileSync(path.join(paths.hostRoot, hostRelativePath), "utf8"),
      ]),
    );
    let writeCount = 0;
    const failingWriter = (input: {
      destination: ArtifactDestination;
      text: string;
    }): ArtifactWriteResult => {
      writeCount += 1;
      if (writeCount === 2) {
        throw new Error("Synthetic second artifact failure.");
      }
      return writeHostArtifact(input);
    };

    await expect(
      runPublisherReaderBuild({
        artifactWriter: failingWriter,
        mode: "write",
        paths,
      }),
    ).rejects.toThrow("Synthetic second artifact failure.");
    expect(writeCount).toBe(2);
    expect(
      Object.fromEntries(
        initial.artifacts.map(({ hostRelativePath }) => [
          hostRelativePath,
          fs.readFileSync(path.join(paths.hostRoot, hostRelativePath), "utf8"),
        ]),
      ),
    ).toEqual(before);
  });
});
