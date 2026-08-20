import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  writeHostArtifact,
  type ArtifactDestination,
  type ArtifactWriteResult,
} from "@genii-foundation/publisher/node";
import {
  PublisherReaderBuildError,
  createPublisherReaderArtifacts,
  createPublisherReaderBuild,
  runPublisherReaderBuild,
  type PublisherReaderBuildPaths,
} from "./reader-build";

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

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Publisher Reader build", () => {
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
