import { describe, expect, it } from "vitest";
import type {
  CompiledCatalog,
  CompiledSection,
  SectionAlias,
  SectionLedger,
} from "./shared";
import { catalogForStaleCheck, validateSectionLedger } from "./validate";

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
    aliases: [],
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

function catalogWithRoutes(
  sections: Array<{ sectionId: string; href: string }>,
  aliases: Array<{ sourceHref: string; targetSectionId: string }> = [],
): CompiledCatalog {
  const catalog = catalogWithRevision("test");
  catalog.sections = sections as unknown as CompiledSection[];
  catalog.aliases = aliases as unknown as SectionAlias[];
  return catalog;
}

function ledger(routes: Array<{ sectionId: string; href: string }>): SectionLedger {
  return { version: 1, routes };
}

describe("section-ID drift gate", () => {
  const opts = { checkStale: false } as const;

  it("passes when every published route is still canonical", () => {
    const catalog = catalogWithRoutes([{ sectionId: "a", href: "/a/" }]);
    expect(() =>
      validateSectionLedger(catalog, ledger([{ sectionId: "a", href: "/a/" }]), opts),
    ).not.toThrow();
  });

  it("fails when a published route no longer resolves", () => {
    const catalog = catalogWithRoutes([{ sectionId: "a", href: "/a/" }]);
    const committed = ledger([
      { sectionId: "a", href: "/a/" },
      { sectionId: "gone", href: "/old/" },
    ]);
    expect(() => validateSectionLedger(catalog, committed, opts)).toThrow(
      /Published route '\/old\/'.*no longer resolves/,
    );
  });

  it("passes when a removed route is preserved by an alias", () => {
    const catalog = catalogWithRoutes(
      [{ sectionId: "a", href: "/a/" }],
      [{ sourceHref: "/old/", targetSectionId: "a" }],
    );
    const committed = ledger([
      { sectionId: "a", href: "/a/" },
      { sectionId: "gone", href: "/old/" },
    ]);
    expect(() => validateSectionLedger(catalog, committed, opts)).not.toThrow();
  });

  it("fails when an alias targets a section that no longer exists", () => {
    const catalog = catalogWithRoutes(
      [{ sectionId: "a", href: "/a/" }],
      [{ sourceHref: "/old/", targetSectionId: "missing" }],
    );
    expect(() =>
      validateSectionLedger(catalog, ledger([{ sectionId: "a", href: "/a/" }]), opts),
    ).toThrow(/alias points at a section that no longer exists/);
  });
});
