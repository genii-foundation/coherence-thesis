import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPublisherManifestSet,
  readPublisherManifestSources,
  runPublisherManifestGeneration,
  type PublisherManifestSet,
  type PublisherManifestSources,
} from "./manifests";
import {
  editorialVolumeIds,
  repoRoot as canonicalRepoRoot,
} from "../repository/paths";

const temporaryRoots: string[] = [];

let canonicalSources: PublisherManifestSources;
let canonicalSet: PublisherManifestSet;

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withSourceOverrides(
  overrides: Partial<PublisherManifestSources>,
): PublisherManifestSources {
  return {
    ...canonicalSources,
    ...overrides,
  };
}

function copyAuthority(root: string, relativePath: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(canonicalRepoRoot, relativePath), target);
}

function createAuthorityFixture(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "publisher-manifest-generation-"),
  );
  temporaryRoots.push(root);

  for (const editorialId of editorialVolumeIds) {
    copyAuthority(
      root,
      `editorial/sources/volumes/${editorialId}/volume.json`,
    );
    copyAuthority(
      root,
      `editorial/sources/volumes/${editorialId}/manuscript.md`,
    );
  }
  copyAuthority(root, "generated/manuscripts/catalog.json");
  copyAuthority(root, "publishing/continuity/section-lineage.json");
  copyAuthority(
    root,
    "publishing/continuity/historical-section-mappings.json",
  );
  return root;
}

function treeFingerprint(root: string): readonly string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const entries: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        entries.push(`directory:${relativePath}`);
        visit(absolutePath);
      } else if (entry.isFile()) {
        const digest = crypto
          .createHash("sha256")
          .update(fs.readFileSync(absolutePath))
          .digest("hex");
        entries.push(`file:${relativePath}:${digest}`);
      } else {
        entries.push(`other:${relativePath}`);
      }
    }
  };
  visit(root);
  return entries;
}

function manifestSection(sectionId: string) {
  const section = canonicalSet.works
    .flatMap((work) => work.sections ?? [])
    .find((candidate) => candidate.id === sectionId);
  expect(section, `Missing manifest section ${sectionId}`).toBeDefined();
  return section!;
}

beforeAll(() => {
  canonicalSources = readPublisherManifestSources();
  canonicalSet = createPublisherManifestSet(canonicalSources);
});

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("Publisher manifest projection", () => {
  it("emits one deterministic canonical manifest set for the full corpus", () => {
    const repeated = createPublisherManifestSet(canonicalSources);

    expect(canonicalSet.counts).toEqual({
      works: 9,
      sections: 525,
      files: 10,
    });
    expect(canonicalSet.files.map((file) => file.relativePath)).toEqual([
      "publication.json",
      "publisher/works/humanitys-most-viable-future.json",
      "publisher/works/wielding-intelligence.json",
      "publisher/works/providence-imperative.json",
      "publisher/works/architecting-providence.json",
      "publisher/works/purposeful.json",
      "publisher/works/smallest-nest.json",
      "publisher/works/presencing-genius.json",
      "publisher/works/misanthropic-artifice.json",
      "publisher/works/cardinal-scale.json",
    ]);
    expect(repeated.files.map((file) => file.text)).toEqual(
      canonicalSet.files.map((file) => file.text),
    );
    expect(canonicalSet.files.every((file) => file.text.endsWith("\n"))).toBe(
      true,
    );
    expect(canonicalSet.publication.boundaries.sourceRoots).toEqual([
      "editorial",
      "publisher",
      "publishing",
    ]);
  });

  it("uses an exact document selector and global block occurrences", () => {
    expect(manifestSection("v01-orientation").start).toEqual({
      kind: "document",
    });
    expect(manifestSection("v02-toward-humane-technology-2").start).toEqual({
      kind: "block",
      blockKind: "paragraph",
      text: "TOWARD HUMANE TECHNOLOGY",
      occurrence: 2,
    });
  });

  it("preserves every section route, continuity record, and source order", () => {
    const declarations = canonicalSet.works.flatMap(
      (work) => work.sections ?? [],
    );
    expect(declarations.map((section) => section.id)).toEqual(
      canonicalSources.catalog.sections.map((section) => section.sectionId),
    );

    for (const [index, declaration] of declarations.entries()) {
      const source = canonicalSources.catalog.sections[index]!;
      expect(declaration.route).toBe(source.href);
      expect(declaration.continuity).toEqual({
        id: source.continuityId,
        legacyIds: source.legacyContinuityIds,
        progressGroups: source.progressContinuityGroups,
        historicalSectionIds: source.legacySectionIds,
      });
      expect(declaration.metadata?.readerHref).toBe(source.readerHref);
    }

    for (const work of canonicalSet.works) {
      const starts = (work.sections ?? []).map((section) =>
        Number(section.metadata?.sourceParagraphStart),
      );
      expect(starts.every((value) => Number.isInteger(value))).toBe(true);
      expect(starts.every((value, index) => index === 0 || value > starts[index - 1]!)).toBe(
        true,
      );
    }
  });

  it("rejects a stale catalog source hash", () => {
    const catalog = cloneJson(canonicalSources.catalog);
    catalog.sections[0]!.sourceHash = "0".repeat(64);

    expect(() =>
      createPublisherManifestSet(withSourceOverrides({ catalog })),
    ).toThrow(/Catalog source hash is stale for "v01-orientation"/);
  });

  it("rejects catalog and lineage disagreements", () => {
    const catalog = cloneJson(canonicalSources.catalog);
    catalog.volumes[0]!.title = "A stale catalog title";
    expect(() =>
      createPublisherManifestSet(withSourceOverrides({ catalog })),
    ).toThrow(/Volume manifest and catalog disagree for order 1/);

    const sectionLineage = cloneJson(canonicalSources.sectionLineage);
    sectionLineage.sections[0]!.continuityIds = ["stale-continuity-id"];
    expect(() =>
      createPublisherManifestSet(withSourceOverrides({ sectionLineage })),
    ).toThrow(
      /Catalog and section lineage disagree on the continuity ID for "v01-orientation"/,
    );
  });

  it("rejects a missing reviewed historical mapping", () => {
    const clonedMappings = cloneJson(
      canonicalSources.historicalSectionMappings,
    );
    const historicalSectionMappings = {
      ...clonedMappings,
      mappings: clonedMappings.mappings.slice(1),
    };

    expect(() =>
      createPublisherManifestSet(
        withSourceOverrides({ historicalSectionMappings }),
      ),
    ).toThrow(/requires exactly 34 reviewed historical section mappings/);
  });

  it("refuses a canonical manuscript reached through a symbolic ancestor", () => {
    const root = createAuthorityFixture();
    const externalRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "publisher-manifest-external-"),
    );
    temporaryRoots.push(externalRoot);
    const externalManuscriptPath = path.join(externalRoot, "manuscript.md");
    fs.copyFileSync(
      path.join(
        root,
        "editorial/sources/volumes/volume-01/manuscript.md",
      ),
      externalManuscriptPath,
    );
    const symbolicDirectoryPath = path.join(
      root,
      "editorial/sources/volumes/symbolic-volume",
    );
    fs.symlinkSync(externalRoot, symbolicDirectoryPath, "dir");
    const volumeManifestPath = path.join(
      root,
      "editorial/sources/volumes/volume-01/volume.json",
    );
    const volumeManifest = JSON.parse(
      fs.readFileSync(volumeManifestPath, "utf8"),
    ) as { sourcePath: string };
    volumeManifest.sourcePath =
      "editorial/sources/volumes/symbolic-volume/manuscript.md";
    fs.writeFileSync(
      volumeManifestPath,
      `${JSON.stringify(volumeManifest, null, 2)}\n`,
    );

    expect(() => readPublisherManifestSources({ repoRoot: root })).toThrow(
      /Canonical manuscript must not cross a symbolic link/u,
    );
  });

  it("refuses JSON authority reached through a symbolic file", () => {
    const root = createAuthorityFixture();
    const catalogPath = path.join(root, "generated/manuscripts/catalog.json");
    const externalRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "publisher-manifest-external-"),
    );
    temporaryRoots.push(externalRoot);
    const externalCatalogPath = path.join(externalRoot, "catalog.json");
    fs.copyFileSync(catalogPath, externalCatalogPath);
    fs.rmSync(catalogPath);
    fs.symlinkSync(externalCatalogPath, catalogPath, "file");

    expect(() => readPublisherManifestSources({ repoRoot: root })).toThrow(
      /generated manuscript catalog must not cross a symbolic link/u,
    );
  });
});

describe("Publisher manifest materialization", () => {
  it("writes exact files, reports stale files, and repairs reviewed output", () => {
    const root = createAuthorityFixture();
    const written = runPublisherManifestGeneration({
      mode: "write",
      paths: { repoRoot: root },
    });
    expect(written.writtenFiles).toHaveLength(10);

    const checked = runPublisherManifestGeneration({
      mode: "check",
      paths: { repoRoot: root },
    });
    expect(checked.checkedFiles).toEqual(written.checkedFiles);
    expect(checked.writtenFiles).toEqual([]);

    fs.writeFileSync(path.join(root, "publication.json"), "{}\n");
    expect(() =>
      runPublisherManifestGeneration({
        mode: "check",
        paths: { repoRoot: root },
      }),
    ).toThrow(/Stale: publication\.json/);

    const repaired = runPublisherManifestGeneration({
      mode: "write",
      paths: { repoRoot: root },
    });
    expect(repaired.writtenFiles).toEqual(["publication.json"]);
    expect(JSON.parse(fs.readFileSync(path.join(root, "publication.json"), "utf8")))
      .toEqual(repaired.manifestSet.publication);
  });

  it("refuses unexpected work entries in check and write modes", () => {
    const root = createAuthorityFixture();
    runPublisherManifestGeneration({
      mode: "write",
      paths: { repoRoot: root },
    });
    const unexpectedPath = path.join(
      root,
      "publisher/works/unexpected.json",
    );
    fs.writeFileSync(unexpectedPath, "{}\n");

    for (const mode of ["check", "write"] as const) {
      expect(() =>
        runPublisherManifestGeneration({
          mode,
          paths: { repoRoot: root },
        }),
      ).toThrow(/Unexpected Publisher work entry must be reviewed manually/);
    }
    expect(fs.readFileSync(unexpectedPath, "utf8")).toBe("{}\n");
  });

  it.each(["editorial", "publishing"])(
    "refuses writes below %s without changing its authority tree",
    (protectedRoot) => {
      const root = createAuthorityFixture();
      const authorityRoot = path.join(root, protectedRoot);
      const before = treeFingerprint(authorityRoot);

      expect(() =>
        runPublisherManifestGeneration({
          mode: "write",
          paths: {
            repoRoot: root,
            publisherRoot: path.join(protectedRoot, "publisher"),
            worksRoot: path.join(protectedRoot, "publisher/works"),
          },
        }),
      ).toThrow(/must not write below editorial or publishing/);
      expect(treeFingerprint(authorityRoot)).toEqual(before);
      expect(fs.existsSync(path.join(root, "publication.json"))).toBe(false);
    },
  );
});
