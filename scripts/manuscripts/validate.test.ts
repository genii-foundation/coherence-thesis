import { describe, expect, it } from "vitest";
import type {
  CompiledCatalog,
  CompiledSection,
  SectionAlias,
  RouteLedger,
  SectionLedger,
} from "./shared";
import { buildRouteLedger, validateSectionLineageConfig } from "./shared";
import {
  catalogForStaleCheck,
  validateRouteLedger,
  validateSectionLedger,
} from "./validate";

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
    routeAliases: [],
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

describe("technical section lineage", () => {
  it("rejects one continuity identity owned by two current sections", () => {
    const catalog = catalogWithRoutes([
      { sectionId: "a", href: "/a/" },
      { sectionId: "b", href: "/b/" },
    ]);
    expect(() =>
      validateSectionLineageConfig(catalog, {
        version: 1,
        sections: [
          {
            currentSectionId: "a",
            continuityIds: ["shared"],
            historicalSectionIds: [],
          },
          {
            currentSectionId: "b",
            continuityIds: ["shared"],
            historicalSectionIds: [],
          },
        ],
      }),
    ).toThrow(/owned by both/);
  });

  it("requires every current section to have a lineage entry", () => {
    const catalog = catalogWithRoutes([{ sectionId: "a", href: "/a/" }]);
    expect(() =>
      validateSectionLineageConfig(catalog, { version: 1, sections: [] }),
    ).toThrow(/missing 1 current section/);
  });
});

describe("published route drift gate", () => {
  const routeLedger = (
    routes: Array<{
      href: string;
      kind: "volume" | "part" | "chapter" | "section";
      targetContinuityIds: string[];
    }>,
  ): RouteLedger => ({ version: 2, routes });
  const opts = { checkStale: false } as const;

  it("passes when a historical chapter route is preserved by an alias", () => {
    const catalog = catalogWithRoutes(
      [{ sectionId: "new", href: "/new/" }],
      [{ sourceHref: "/old/chapter/", targetSectionId: "new" }],
    );
    catalog.volumes = [];
    expect(() =>
      validateRouteLedger(
        catalog,
        routeLedger([
          {
            href: "/old/chapter/",
            kind: "chapter",
            targetContinuityIds: ["new"],
          },
        ]),
        opts,
      ),
    ).not.toThrow();
  });

  it("fails when a historical part route disappears without an alias", () => {
    const catalog = catalogWithRoutes([{ sectionId: "new", href: "/new/" }]);
    catalog.volumes = [];
    expect(() =>
      validateRouteLedger(
        catalog,
        routeLedger([
          {
            href: "/old/part/",
            kind: "part",
            targetContinuityIds: ["old"],
          },
        ]),
        opts,
      ),
    ).toThrow(/Published part route/);
  });

  it("fails when a historical path is reused by unrelated lineage", () => {
    const catalog = catalogWithRoutes([{ sectionId: "new", href: "/same/" }]);
    expect(() =>
      validateRouteLedger(
        catalog,
        routeLedger([
          {
            href: "/same/",
            kind: "section",
            targetContinuityIds: ["old"],
          },
        ]),
        opts,
      ),
    ).toThrow(/unrelated lineage/);
  });

  it("records runtime section precedence for singleton chapter paths", () => {
    const catalog = catalogWithRoutes([
      { sectionId: "only", href: "/manuscripts/1/part/chapter/" },
    ]);
    catalog.volumes = [
      {
        volumeId: "volume",
        title: "Volume",
        subtitle: "",
        order: 1,
        numberLabel: "I",
        planet: "Sun",
        coverImage: "cover.png",
        coverAlt: "Cover",
        href: "/manuscripts/1/",
        sectionIds: ["only"],
        wordCount: 1,
        parts: [
          {
            partId: "part",
            title: "Part",
            order: 1,
            href: "/manuscripts/1/part/",
            sectionIds: ["only"],
            wordCount: 1,
            chapters: [
              {
                chapterId: "chapter",
                title: "Chapter",
                order: 1,
                href: "/manuscripts/1/part/chapter/",
                sectionIds: ["only"],
                wordCount: 1,
              },
            ],
          },
        ],
      },
    ];
    const built = buildRouteLedger(
      catalog,
      { version: 2, routes: [] },
      { version: 1, routes: [] },
    );
    const pathEntries = built.routes.filter(
      (entry) => entry.href === "/manuscripts/1/part/chapter/",
    );
    expect(pathEntries).toEqual([
      {
        href: "/manuscripts/1/part/chapter/",
        kind: "section",
        targetContinuityIds: ["only"],
      },
    ]);
  });

  it("records section aliases and reader fragments", () => {
    const catalog = catalogWithRoutes(
      [{ sectionId: "current", href: "/manuscripts/1/part/current/" }],
      [{ sourceHref: "/manuscripts/1/part/old/", targetSectionId: "current" }],
    );
    const section = catalog.sections[0]!;
    section.readerHref = "/manuscripts/1/part/#current";
    const built = buildRouteLedger(
      catalog,
      { version: 2, routes: [] },
      { version: 1, routes: [] },
    );
    expect(built.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/manuscripts/1/part/old/",
          kind: "section-alias",
          targetContinuityIds: ["current"],
        }),
        expect.objectContaining({
          href: "/manuscripts/1/part/#current",
          kind: "reader",
          targetContinuityIds: ["current"],
        }),
      ]),
    );
  });

  it("retains distinct historical owners for the same path", () => {
    const catalog = catalogWithRoutes([{ sectionId: "new", href: "/same/" }]);
    const built = buildRouteLedger(
      catalog,
      {
        version: 2,
        routes: [
          { href: "/same/", kind: "section", targetContinuityIds: ["old"] },
        ],
      },
      { version: 1, routes: [] },
    );
    expect(built.routes.filter((entry) => entry.href === "/same/")).toHaveLength(2);
  });

  it("allows a reviewed structural alias to choose one split successor", () => {
    const catalog = catalogWithRoutes([
      { sectionId: "primary", href: "/manuscripts/1/new/" },
    ]);
    catalog.routeAliases = [
      {
        sourceHref: "/manuscripts/1/old/",
        targetHref: "/manuscripts/1/new/",
      },
    ];
    expect(() =>
      validateRouteLedger(
        catalog,
        {
          version: 2,
          routes: [
            {
              href: "/manuscripts/1/old/",
              kind: "chapter",
              targetContinuityIds: ["primary", "other-predecessor"],
            },
          ],
        },
        opts,
      ),
    ).not.toThrow();
  });

  it("allows a published structural alias membership to evolve", () => {
    const catalog = catalogWithRoutes([
      { sectionId: "primary", href: "/manuscripts/1/new/" },
    ]);
    catalog.routeAliases = [
      {
        sourceHref: "/manuscripts/1/old/",
        targetHref: "/manuscripts/1/new/",
      },
    ];
    expect(() =>
      validateRouteLedger(
        catalog,
        {
          version: 2,
          routes: [
            {
              href: "/manuscripts/1/old/",
              kind: "route-alias",
              targetContinuityIds: ["primary", "lost-reviewed-lineage"],
            },
          ],
        },
        opts,
      ),
    ).not.toThrow();
  });

  it("allows volume membership to evolve when related lineage remains", () => {
    const catalog = catalogWithRoutes([
      { sectionId: "remaining", href: "/manuscripts/1/remaining/" },
    ]);
    catalog.volumes = [
      {
        volumeId: "volume",
        title: "Volume",
        subtitle: "",
        order: 1,
        numberLabel: "I",
        planet: "Sun",
        coverImage: "cover.png",
        coverAlt: "Cover",
        href: "/manuscripts/1/",
        sectionIds: ["remaining"],
        wordCount: 1,
        parts: [],
      },
    ];

    expect(() =>
      validateRouteLedger(
        catalog,
        {
          version: 2,
          routes: [
            {
              href: "/manuscripts/1/",
              kind: "volume",
              targetContinuityIds: ["remaining", "moved-to-another-volume"],
            },
          ],
        },
        opts,
      ),
    ).not.toThrow();
  });

  it("rejects a volume route reused by entirely unrelated lineage", () => {
    const catalog = catalogWithRoutes([
      { sectionId: "replacement", href: "/manuscripts/1/replacement/" },
    ]);
    catalog.volumes = [
      {
        volumeId: "volume",
        title: "Volume",
        subtitle: "",
        order: 1,
        numberLabel: "I",
        planet: "Sun",
        coverImage: "cover.png",
        coverAlt: "Cover",
        href: "/manuscripts/1/",
        sectionIds: ["replacement"],
        wordCount: 1,
        parts: [],
      },
    ];

    expect(() =>
      validateRouteLedger(
        catalog,
        {
          version: 2,
          routes: [
            {
              href: "/manuscripts/1/",
              kind: "volume",
              targetContinuityIds: ["former-lineage"],
            },
          ],
        },
        opts,
      ),
    ).toThrow(/unrelated lineage/);
  });
});
