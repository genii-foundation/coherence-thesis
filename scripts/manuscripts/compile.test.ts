import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPdfDownloads: vi.fn(async () => ({ sections: [], manuscripts: [] })),
  validateSectionLedger: vi.fn(),
  writeJson: vi.fn(),
}));

vi.mock("./shared", () => ({
  buildCatalog: () => ({
    stats: { sectionCount: 0, wordCount: 0 },
    sections: [],
    volumes: [],
  }),
  buildSearchIndex: () => [],
  breadcrumbsDir: "/repo/public/data/breadcrumbs",
  catalogPath: "/repo/src/generated/manuscripts/catalog.json",
  cleanDir: vi.fn(),
  ensureDir: vi.fn(),
  generatedRoot: "/repo/src/generated/manuscripts",
  outlineDataPath: "/repo/public/data/outline.json",
  progressSectionsPath: "/repo/public/data/progress-sections.json",
  publicDataRoot: "/repo/public/data",
  readerSectionsPath: "/repo/public/data/reader-sections.json",
  repoRoot: "/repo",
  searchIndexPath: "/repo/public/data/search-index.json",
  writeJson: mocks.writeJson,
}));

vi.mock("./pdf", () => ({
  buildPdfDownloads: mocks.buildPdfDownloads,
  pdfManifestPath: "/repo/public/data/pdf-downloads.json",
}));

vi.mock("./validate", () => ({
  validateSectionLedger: mocks.validateSectionLedger,
}));

vi.mock("../../src/lib/manuscript-labels", () => ({
  displayPartTitle: () => "Part",
}));

vi.mock("../../src/lib/manuscript-data", () => ({
  toolbarOutline: () => [],
}));

import { compileManuscripts } from "./compile";

describe("manuscript compilation entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has no compilation side effects when imported", () => {
    expect(mocks.buildPdfDownloads).not.toHaveBeenCalled();
    expect(mocks.writeJson).not.toHaveBeenCalled();
  });

  it("validates historical routes without writing a durable ledger", async () => {
    await compileManuscripts();

    expect(mocks.validateSectionLedger).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      { checkStale: false },
    );
    expect(mocks.writeJson).not.toHaveBeenCalledWith(
      expect.stringContaining("section-ledger"),
      expect.anything(),
    );
  });
});
