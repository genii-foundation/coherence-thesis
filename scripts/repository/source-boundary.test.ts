import { describe, expect, it } from "vitest";
import {
  auditTrackedPaths,
  classifyTrackedPath,
  formatSourceBoundaryFailure,
  normalizeTrackedPath,
} from "./source-boundary";

const editorialSourcePaths = [
  "editorial/sources/corpus/master-ledger.md",
  "editorial/sources/corpus/semantic-links.json",
  "editorial/sources/overview/coherence-thesis.json",
  ...Array.from({ length: 9 }, (_, index) => {
    const editorialId = `volume-${String(index + 1).padStart(2, "0")}`;
    return [
      `editorial/sources/volumes/${editorialId}/manuscript.md`,
      `editorial/sources/volumes/${editorialId}/voice-card.md`,
      `editorial/sources/volumes/${editorialId}/volume.json`,
    ];
  }).flat(),
];

const publishingPaths = [
  "publishing/continuity/aliases.json",
  "publishing/continuity/historical-section-mappings.json",
  "publishing/continuity/route-aliases.json",
  "publishing/continuity/route-ledger.json",
  "publishing/continuity/section-ledger.json",
  "publishing/continuity/section-lineage.json",
  "publishing/continuity/version-provenance.json",
  "publishing/audio/manifest.json",
  "publishing/updates/snapshot.json",
];

const durableTrackedPaths = [...editorialSourcePaths, ...publishingPaths];

describe("repository source boundary classification", () => {
  it.each([
    "generated/manuscripts/sections/volume/section.md",
    "content/manuscripts/volume/section.md",
    "src/generated/manuscripts/catalog.json",
    "public/data/audio-manifest.json",
    "public/data/breadcrumbs/routes.json",
    "public/data/outline.json",
    "public/data/pdf-downloads.json",
    "public/data/progress-sections.json",
    "public/data/reader-sections.json",
    "public/data/search-index.json",
    "public/data/arbitrary/nested-payload.json",
    "public/downloads/manuscripts/volume-one.pdf",
    "public/downloads/sections/chapter/section.pdf",
  ])("classifies %s as disposable generated output", (filePath) => {
    expect(classifyTrackedPath(filePath)).toBe("disposable-generated");
  });

  it("distinguishes canonical sources from durable publication records", () => {
    expect(
      classifyTrackedPath(
        "editorial/sources/volumes/volume-01/manuscript.md",
      ),
    ).toBe("canonical-editorial-source");
    expect(
      classifyTrackedPath("publishing/continuity/section-ledger.json"),
    ).toBe("durable-publishing-state");
    expect(classifyTrackedPath("publishing/audio/manifest.json")).toBe(
      "durable-publishing-state",
    );
  });

  it("classifies retired locations as legacy layout", () => {
    expect(classifyTrackedPath("sources/manuscripts/volume-one.md")).toBe(
      "legacy-layout",
    );
    expect(classifyTrackedPath("content/series/section-ledger.json")).toBe(
      "legacy-layout",
    );
  });

  it("does not reject unrelated files with similar names", () => {
    expect(classifyTrackedPath("public/data/audio-manifest.json.backup")).toBe(
      "disposable-generated",
    );
    expect(classifyTrackedPath("public/data/outlines.json")).toBe(
      "disposable-generated",
    );
    expect(classifyTrackedPath("public/database/outline.json")).toBe(
      "other-tracked-file",
    );
    expect(classifyTrackedPath("public/data-old/outline.json")).toBe(
      "other-tracked-file",
    );
    expect(classifyTrackedPath("public/downloads-cache/volume.pdf")).toBe(
      "other-tracked-file",
    );
    expect(classifyTrackedPath("content/manuscript-notes/section.md")).toBe(
      "other-tracked-file",
    );
  });

  it("normalizes Git style relative paths before classification", () => {
    expect(normalizeTrackedPath(".\\public\\data\\search-index.json")).toBe(
      "public/data/search-index.json",
    );
  });
});

describe("repository tracked source boundary audit", () => {
  it("passes when durable paths are tracked and disposable paths are absent", () => {
    expect(auditTrackedPaths(durableTrackedPaths)).toEqual({
      disposablePaths: [],
      legacyPaths: [],
      missingRequirements: [],
    });
  });

  it("reports every tracked disposable path in stable order", () => {
    const audit = auditTrackedPaths([
      ...durableTrackedPaths,
      "public/data/search-index.json",
      "generated/manuscripts/sections/volume/section.md",
      "public/data/search-index.json",
    ]);

    expect(audit.disposablePaths).toEqual([
      "generated/manuscripts/sections/volume/section.md",
      "public/data/search-index.json",
    ]);
    expect(audit.legacyPaths).toEqual([]);
    expect(audit.missingRequirements).toEqual([]);
  });

  it("reports retired source locations", () => {
    const audit = auditTrackedPaths([
      ...durableTrackedPaths,
      "sources/manuscripts/volume-one.md",
    ]);

    expect(audit.legacyPaths).toEqual([
      "sources/manuscripts/volume-one.md",
    ]);
  });

  it("requires every editorial package and durable publishing file", () => {
    const audit = auditTrackedPaths(["README.md"]);

    expect(audit.missingRequirements).toHaveLength(39);
    expect(audit.missingRequirements).toContainEqual(
      expect.objectContaining({
        id: "canonical-editorial-source",
        pathspec: "editorial/sources/volumes/volume-01/manuscript.md",
      }),
    );
    expect(audit.missingRequirements).toContainEqual(
      expect.objectContaining({
        id: "durable-publishing-state",
        pathspec: "publishing/audio/manifest.json",
      }),
    );
    expect(audit.missingRequirements).toContainEqual(
      expect.objectContaining({
        id: "durable-publishing-state",
        pathspec: "publishing/updates/snapshot.json",
      }),
    );
  });

  it("formats failures with concrete recovery commands", () => {
    const failure = formatSourceBoundaryFailure(
      auditTrackedPaths(["generated/manuscripts/sections/volume/section.md"]),
    );

    expect(failure).toContain("git rm --cached -- <path>");
    expect(failure).toContain("git add -- <path>");
    expect(failure).toContain(
      "generated/manuscripts/sections/volume/section.md",
    );
    expect(failure).toContain("publishing/audio/manifest.json");
  });
});
