import { describe, expect, it } from "vitest";
import {
  auditTrackedPaths,
  classifyTrackedPath,
  formatSourceBoundaryFailure,
  normalizeTrackedPath,
} from "./source-boundary";

const durableTrackedPaths = [
  "sources/manuscripts/coherence-thesis-vol1.md",
  "content/series/aliases.json",
  "content/series/historical-section-mappings.json",
  "content/series/route-aliases.json",
  "content/series/route-ledger.json",
  "content/series/section-ledger.json",
  "content/series/section-lineage.json",
  "content/series/version-provenance.json",
  "content/series/volumes.json",
  "public/data/audio-manifest.json",
];

describe("manuscript source boundary classification", () => {
  it.each([
    "content/manuscripts/volume/section.md",
    "src/generated/manuscripts/catalog.ts",
    "public/data/breadcrumbs/routes.json",
    "public/data/outline.json",
    "public/data/pdf-downloads.json",
    "public/data/progress-sections.json",
    "public/data/reader-sections.json",
    "public/data/search-index.json",
  ])("classifies %s as disposable generated output", (filePath) => {
    expect(classifyTrackedPath(filePath)).toBe("disposable-generated");
  });

  it("distinguishes canonical source from durable publication records", () => {
    expect(classifyTrackedPath("sources/manuscripts/volume-one.md")).toBe(
      "canonical-manuscript-source",
    );
    expect(classifyTrackedPath("content/series/section-ledger.json")).toBe(
      "durable-series-metadata",
    );
    expect(classifyTrackedPath("public/data/audio-manifest.json")).toBe(
      "durable-audio-manifest",
    );
  });

  it("does not reject unrelated files with similar names", () => {
    expect(classifyTrackedPath("public/data/audio-manifest.json.backup")).toBe(
      "other-tracked-file",
    );
    expect(classifyTrackedPath("public/data/outlines.json")).toBe("other-tracked-file");
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

describe("manuscript tracked source boundary audit", () => {
  it("passes when durable paths are tracked and disposable paths are absent", () => {
    expect(auditTrackedPaths(durableTrackedPaths)).toEqual({
      disposablePaths: [],
      missingRequirements: [],
    });
  });

  it("reports every tracked disposable path in stable order", () => {
    const audit = auditTrackedPaths([
      ...durableTrackedPaths,
      "public/data/search-index.json",
      "content/manuscripts/volume/section.md",
      "public/data/search-index.json",
    ]);

    expect(audit.disposablePaths).toEqual([
      "content/manuscripts/volume/section.md",
      "public/data/search-index.json",
    ]);
    expect(audit.missingRequirements).toEqual([]);
  });

  it("requires source manuscripts, the audio manifest, and each durable series file", () => {
    const audit = auditTrackedPaths(["README.md", "content/series/volumes.json"]);

    expect(audit.missingRequirements).toEqual([
      expect.objectContaining({ id: "canonical-manuscript-sources" }),
      expect.objectContaining({
        id: "audio-manifest",
        pathspec: "public/data/audio-manifest.json",
      }),
      expect.objectContaining({
        id: "series-metadata",
        pathspec: "content/series/aliases.json",
      }),
      expect.objectContaining({
        id: "series-metadata",
        pathspec: "content/series/historical-section-mappings.json",
      }),
      expect.objectContaining({
        id: "series-metadata",
        pathspec: "content/series/route-aliases.json",
      }),
      expect.objectContaining({
        id: "series-metadata",
        pathspec: "content/series/route-ledger.json",
      }),
      expect.objectContaining({
        id: "series-metadata",
        pathspec: "content/series/section-ledger.json",
      }),
      expect.objectContaining({
        id: "series-metadata",
        pathspec: "content/series/section-lineage.json",
      }),
      expect.objectContaining({
        id: "series-metadata",
        pathspec: "content/series/version-provenance.json",
      }),
    ]);
  });

  it("formats failures with concrete recovery commands", () => {
    const failure = formatSourceBoundaryFailure(
      auditTrackedPaths(["content/manuscripts/volume/section.md"]),
    );

    expect(failure).toContain("git rm --cached -- <path>");
    expect(failure).toContain("git add -- <path>");
    expect(failure).toContain("content/manuscripts/volume/section.md");
    expect(failure).toContain("public/data/audio-manifest.json");
  });
});
