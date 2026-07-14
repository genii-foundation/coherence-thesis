import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { manuscriptPdfHref, sectionPdfHref } from "./pdf";
import {
  aliasConfigPath,
  buildCatalog,
  resolvePublishedRoute,
  slugify,
  wordCount,
} from "./shared";
import type { RouteLedger } from "./types";

describe("manuscript compiler helpers", () => {
  it("creates stable URL slugs", () => {
    expect(slugify("The Currency of Presence")).toBe("the-currency-of-presence");
    expect(slugify("Why Providence Is Not Social Credit")).toBe(
      "why-providence-is-not-social-credit",
    );
  });

  it("counts words from markdown bodies", () => {
    expect(wordCount("*Presence* coordinates **trust**.")).toBe(3);
  });

  it("creates stable PDF download URLs", () => {
    const catalog = buildCatalog();
    const firstVolume = catalog.volumes[0];
    const firstSection = catalog.sections[0]!;
    const structureSection = catalog.sections.find(
      (section) => section.sectionId === "v01-how-this-book-is-structured",
    );

    expect(firstVolume).toBeDefined();
    expect(firstSection).toBeDefined();
    expect(structureSection).toBeDefined();

    expect(sectionPdfHref(firstSection!, firstVolume!)).toBe(
      "/downloads/sections/The Coherence Thesis - 01.001 - Orientation.pdf",
    );
    expect(sectionPdfHref(structureSection!, firstVolume!)).toBe(
      "/downloads/sections/The Coherence Thesis - 01.004 - How This Book Is Structured.pdf",
    );
    expect(manuscriptPdfHref(firstVolume!)).toBe(
      "/downloads/manuscripts/The Coherence Thesis - 01 - Humanity's Most Viable Future.pdf",
    );
  });

  it("builds the current catalog from canonical markdown", () => {
    const catalog = buildCatalog();
    const section = catalog.sections[0]!;

    expect(catalog.stats.volumeCount).toBe(9);
    expect(catalog.stats.sectionCount).toBeGreaterThan(500);
    expect(section.sectionId).toBe("v01-orientation");
    expect(section.versionHash).toBe(section.contentHash);
    expect(section.versionDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(section.versionUrl).toMatch(
      /^https:\/\/github\.com\/providence-collective\/coherence-thesis\/pull\/\d+$/,
    );
    expect(section.audioVersionId).toBe(`${section.sectionId}-${section.contentHash}`);
    expect(catalog.overview.nodes.length).toBe(9);
  });

  it("collapses duplicate part and chapter slugs in canonical section routes", () => {
    const catalog = buildCatalog();
    const section = catalog.sections.find(
      (candidate) => candidate.sectionId === "v01-the-seed",
    );
    const secondVolume = catalog.volumes.find(
      (candidate) => candidate.volumeId === "wielding-intelligence",
    );

    expect(secondVolume?.href).toBe("/manuscripts/2/");
    expect(section?.href).toBe(
      "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    );
    const hrefs = catalog.volumes.flatMap((volume) => [
      volume.href,
      ...volume.parts.flatMap((part) => [
        part.href,
        ...part.chapters.map((chapter) => chapter.href),
      ]),
    ]);
    hrefs.push(...catalog.sections.map((candidate) => candidate.href));

    expect(
      hrefs.filter((href) => {
        const segments = href.split("/").filter(Boolean);
        return segments.some((segment, index) => segment === segments[index - 1]);
      }),
    ).toEqual([]);
    expect(hrefs.filter((href) => /\/v\d+-/.test(href))).toEqual([]);
  });

  it("publishes clean routes for synthetic front matter groups", () => {
    const catalog = buildCatalog();
    const opening = catalog.sections.find(
      (candidate) => candidate.sectionId === "v01-orientation",
    );
    const contents = catalog.sections.find(
      (candidate) => candidate.sectionId === "v08-prologue-two-scenes",
    );
    const openingPart = catalog.volumes
      .find((volume) => volume.volumeId === "humanitys-most-viable-future")
      ?.parts.find((part) => part.partId === "front-matter");
    const contentsPart = catalog.volumes
      .find((volume) => volume.volumeId === "misanthropic-artifice")
      ?.parts.find((part) => part.partId === "front-matter");

    expect(opening?.href).toBe(
      "/manuscripts/1/opening/orientation/",
    );
    expect(opening?.readerHref).toBe(opening?.href);
    expect(contents?.href).toBe(
      "/manuscripts/8/contents/prologue-two-scenes/start/",
    );
    expect(contents?.readerHref).toBe(
      "/manuscripts/8/contents/prologue-two-scenes/#v08-prologue-two-scenes",
    );
    expect(openingPart?.href).toBe("/manuscripts/1/opening/");
    expect(contentsPart?.href).toBe("/manuscripts/8/contents/");
  });

  it("preserves old duplicate section routes as generated aliases", () => {
    const catalog = buildCatalog();
    const alias = catalog.aliases.find(
      (candidate) =>
        candidate.sourceHref ===
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/",
    );

    expect(alias).toMatchObject({
      targetSectionId: "v01-the-seed",
      targetHref: "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    });
  });

  it("removes low-content structural part openers from every catalog surface", () => {
    const catalog = buildCatalog();
    const removedIds = [
      "v02-the-diagnosis",
      "v02-wielding-intelligence",
      "v03-the-reckoning",
      "v03-the-innovation",
      "v03-the-mechanism",
      "v03-the-living-reality",
      "v03-the-governance",
      "v03-the-sovereign-architecture",
      "v03-the-earth-compact",
      "v03-the-invitation",
    ];
    const publishedIds = new Set(catalog.sections.map((section) => section.sectionId));
    const nestedIds = new Set(
      catalog.volumes.flatMap((volume) =>
        volume.parts.flatMap((part) =>
          part.chapters.flatMap((chapter) => chapter.sectionIds),
        ),
      ),
    );

    for (const sectionId of removedIds) {
      expect(publishedIds.has(sectionId)).toBe(false);
      expect(nestedIds.has(sectionId)).toBe(false);
    }

    expect(
      catalog.aliases.find(
        (alias) =>
          alias.sourceHref ===
          "/manuscripts/wielding-intelligence/v02-wielding-intelligence/",
      ),
    ).toMatchObject({
      targetSectionId: "v02-builders-of-the-coherent-civilization",
      targetHref:
        "/manuscripts/2/main/builders-of-the-coherent-civilization/",
    });
    expect(
      catalog.aliases.find(
        (alias) => alias.sourceHref === "/manuscripts/3/the-reckoning/start/",
      ),
    ).toMatchObject({
      targetSectionId: "v03-the-central-wound",
      targetHref: "/manuscripts/3/the-reckoning/the-central-wound/",
    });
  });

  it("aliases subtitle-only part openers to their first content sections", () => {
    const catalog = buildCatalog();
    const alias = catalog.aliases.find(
      (candidate) =>
        candidate.sourceHref ===
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/",
    );

    expect(
      catalog.sections.some(
        (section) => section.sectionId === "v01-seed-sprout-stem-and-soil",
      ),
    ).toBe(false);
    expect(alias).toMatchObject({
      targetSectionId: "v01-the-seed",
      targetHref: "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    });
  });

  it("aliases subtitle-only chapter openers to their first content sections", () => {
    const catalog = buildCatalog();
    const alias = catalog.aliases.find(
      (candidate) =>
        candidate.sourceHref ===
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-the-sprout/",
    );

    expect(
      catalog.sections.some((section) => section.sectionId === "v01-the-sprout"),
    ).toBe(false);
    expect(alias).toMatchObject({
      targetSectionId: "v01-why-this-is-happening-and-why-it-changes-everything",
      targetHref:
        "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/why-this-is-happening-and-why-it-changes-everything/",
    });
  });

  it("does not publish subtitle-only structural openers anywhere in the catalog", () => {
    const catalog = buildCatalog();
    const partSections = new Map<string, typeof catalog.sections>();
    const chapterSections = new Map<string, typeof catalog.sections>();
    const isSubtitleOnly = (section: (typeof catalog.sections)[number]) => {
      const words = section.text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
      return words > 0 && words <= 8 && !/[.!?]$/.test(section.text.trim());
    };

    for (const section of catalog.sections) {
      const partKey = `${section.volumeId}:${section.partId}`;
      const chapterKey = `${section.volumeId}:${section.partId}:${section.chapterId}`;
      partSections.set(partKey, [...(partSections.get(partKey) ?? []), section]);
      chapterSections.set(chapterKey, [
        ...(chapterSections.get(chapterKey) ?? []),
        section,
      ]);
    }

    const publishedOpeners = [
      ...[...partSections.values()].flatMap((sections) => {
        const first = sections[0];
        return first &&
          sections.length > 1 &&
          first.title === first.partTitle &&
          isSubtitleOnly(first)
          ? [first.sectionId]
          : [];
      }),
      ...[...chapterSections.values()].flatMap((sections) => {
        const first = sections[0];
        return first &&
          sections.length > 1 &&
          first.title === first.chapterTitle &&
          isSubtitleOnly(first)
          ? [first.sectionId]
          : [];
      }),
    ];

    expect(publishedOpeners).toEqual([]);
  });

  it("derives a historical reader path from unique continuity ownership", () => {
    const sourceHref = "/manuscripts/1/retired-chapter/#retired-seed";
    const routeLedger: RouteLedger = {
      version: 2,
      routes: [
        {
          href: sourceHref,
          kind: "reader",
          targetContinuityIds: ["retired-seed"],
        },
      ],
    };
    const catalog = buildCatalog(undefined, {
      semanticReferences: "omit",
      aliasConfig: { version: 1, aliases: [] },
      routeAliasConfig: { version: 1, aliases: [] },
      sectionLineage: {
        version: 1,
        sections: [
          {
            currentSectionId: "v01-the-seed",
            continuityIds: ["v01-the-seed", "retired-seed"],
            historicalSectionIds: ["retired-seed"],
          },
        ],
      },
      routeLedger,
    });

    expect(
      catalog.aliases.find(
        (alias) => alias.sourceHref === "/manuscripts/1/retired-chapter/",
      ),
    ).toMatchObject({
      targetSectionId: "v01-the-seed",
      note: "Generated from reviewed continuity ownership in the route ledger.",
    });
    expect(resolvePublishedRoute(catalog, sourceHref)).toMatchObject({
      kind: "reader",
      targetContinuityIds: expect.arrayContaining([
        "v01-the-seed",
        "retired-seed",
      ]),
    });
  });

  it("resolves a legacy reader fragment through its current canonical base", () => {
    const baseHref =
      "/manuscripts/1/seed-sprout-stem-and-soil/between-sprout-and-stem/";
    const sourceHref = `${baseHref}#retired-reductionism`;
    const catalog = buildCatalog(undefined, {
      semanticReferences: "omit",
      aliasConfig: { version: 1, aliases: [] },
      routeAliasConfig: { version: 1, aliases: [] },
      sectionLineage: {
        version: 1,
        sections: [
          {
            currentSectionId: "v01-on-reductionism",
            continuityIds: ["v01-on-reductionism", "retired-reductionism"],
            historicalSectionIds: ["retired-reductionism"],
          },
        ],
      },
      routeLedger: {
        version: 2,
        routes: [
          {
            href: sourceHref,
            kind: "reader",
            targetContinuityIds: ["retired-reductionism"],
          },
        ],
      },
    });

    expect(catalog.aliases.some((alias) => alias.sourceHref === baseHref)).toBe(
      false,
    );
    expect(resolvePublishedRoute(catalog, sourceHref)).toMatchObject({
      kind: "reader",
      targetContinuityIds: expect.arrayContaining([
        "v01-on-reductionism",
        "retired-reductionism",
      ]),
      targetHref: `${baseHref}#v01-on-reductionism`,
    });
  });

  it("keeps a configured alias authoritative over ledger derivation", () => {
    const sourceHref = "/manuscripts/1/reviewed-replacement/";
    const catalog = buildCatalog(undefined, {
      semanticReferences: "omit",
      aliasConfig: {
        version: 1,
        aliases: [
          {
            sourceHref,
            targetSectionId: "v01-orientation",
            note: "Reviewed by an editor.",
          },
        ],
      },
      routeAliasConfig: { version: 1, aliases: [] },
      sectionLineage: {
        version: 1,
        sections: [
          {
            currentSectionId: "v01-the-seed",
            continuityIds: ["v01-the-seed", "retired-seed"],
            historicalSectionIds: ["retired-seed"],
          },
        ],
      },
      routeLedger: {
        version: 2,
        routes: [
          {
            href: sourceHref,
            kind: "section",
            targetContinuityIds: ["retired-seed"],
          },
        ],
      },
    });

    expect(
      catalog.aliases.filter((alias) => alias.sourceHref === sourceHref),
    ).toEqual([
      expect.objectContaining({
        targetSectionId: "v01-orientation",
        note: "Reviewed by an editor.",
      }),
    ]);
  });

  it("does not guess a historical route whose lineage has split", () => {
    const sourceHref = "/manuscripts/1/split-predecessor/";
    const equivalentSourceHref =
      "/manuscripts/humanitys-most-viable-future/split-predecessor/";
    const catalog = buildCatalog(undefined, {
      semanticReferences: "omit",
      aliasConfig: { version: 1, aliases: [] },
      routeAliasConfig: { version: 1, aliases: [] },
      sectionLineage: {
        version: 1,
        sections: [
          {
            currentSectionId: "v01-orientation",
            continuityIds: ["v01-orientation", "split-left"],
            historicalSectionIds: ["split-left"],
          },
          {
            currentSectionId: "v01-the-seed",
            continuityIds: ["v01-the-seed", "split-right"],
            historicalSectionIds: ["split-right"],
          },
        ],
      },
      routeLedger: {
        version: 2,
        routes: [
          {
            href: sourceHref,
            kind: "section",
            targetContinuityIds: ["split-left"],
          },
          {
            href: equivalentSourceHref,
            kind: "section-alias",
            targetContinuityIds: ["split-right"],
          },
        ],
      },
    });

    expect(
      catalog.aliases.some(
        (alias) =>
          alias.sourceHref === sourceHref ||
          alias.sourceHref === equivalentSourceHref,
      ),
    ).toBe(false);
  });

  it("never writes generated historical aliases to the reviewed config", () => {
    const before = fs.readFileSync(aliasConfigPath, "utf8");
    buildCatalog(undefined, {
      aliasConfig: { version: 1, aliases: [] },
      routeAliasConfig: { version: 1, aliases: [] },
      routeLedger: {
        version: 2,
        routes: [
          {
            href: "/manuscripts/1/runtime-only-alias/",
            kind: "section-alias",
            targetContinuityIds: ["v01-the-seed"],
          },
        ],
      },
    });

    expect(fs.readFileSync(aliasConfigPath, "utf8")).toBe(before);
  });
});
