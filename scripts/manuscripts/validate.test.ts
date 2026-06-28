import { describe, expect, it } from "vitest";
import type { CompiledCatalog } from "./shared";
import { catalogForStaleCheck } from "./validate";

function catalogWithRevision(gitRevision: string): CompiledCatalog {
  return {
    siteTitle: "The Coherence Thesis",
    generatedFrom: "canonical markdown",
    gitRevision,
    stats: {
      volumeCount: 1,
      partCount: 1,
      chapterCount: 1,
      sectionCount: 1,
      wordCount: 10,
      readingMinutes: 1,
    },
    volumes: [],
    sections: [],
    overview: {
      title: "The Coherence Thesis",
      subtitle: "A five minute map.",
      readingMinutes: 5,
      nodes: [],
    },
  };
}

describe("manuscript validation stale catalog comparison", () => {
  it("ignores volatile git revision drift", () => {
    expect(catalogForStaleCheck(catalogWithRevision("old"))).toEqual(
      catalogForStaleCheck(catalogWithRevision("new")),
    );
  });

  it("keeps manuscript-derived data in the comparison", () => {
    const changed = catalogWithRevision("old");
    changed.stats.sectionCount = 2;

    expect(catalogForStaleCheck(changed)).not.toEqual(
      catalogForStaleCheck(catalogWithRevision("old")),
    );
  });
});
