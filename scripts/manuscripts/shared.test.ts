import { describe, expect, it } from "vitest";
import { manuscriptPdfHref, sectionPdfHref } from "./pdf";
import {
  buildCatalog,
  currentPublishedRoutes,
  manuscriptRoot,
  slugify,
  wordCount,
} from "./shared";

let cachedCurrentCatalog: ReturnType<typeof buildCatalog> | undefined;

function currentCatalog(): ReturnType<typeof buildCatalog> {
  cachedCurrentCatalog ??= buildCatalog();
  return cachedCurrentCatalog;
}

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
    const catalog = currentCatalog();
    const firstVolume = catalog.volumes[0];
    const firstSection = catalog.sections[0]!;
    const structureSection = catalog.sections.find(
      (section) => section.sectionId === "v01-how-understanding-takes-root",
    );

    expect(firstVolume).toBeDefined();
    expect(firstSection).toBeDefined();
    expect(structureSection).toBeDefined();

    expect(sectionPdfHref(firstSection!, firstVolume!)).toBe(
      "/downloads/sections/The Coherence Thesis - 01.001 - Orientation.pdf",
    );
    expect(sectionPdfHref(structureSection!, firstVolume!)).toBe(
      "/downloads/sections/The Coherence Thesis - 01.004 - How Understanding Takes Root.pdf",
    );
    expect(manuscriptPdfHref(firstVolume!)).toBe(
      "/downloads/manuscripts/The Coherence Thesis - 01 - Humanity's Most Viable Future.pdf",
    );
  }, 20_000);

  it("builds the current catalog from canonical markdown", () => {
    const catalog = currentCatalog();
    const section = catalog.sections[0]!;
    const historicalRename = catalog.sections.find(
      (candidate) =>
        candidate.sectionId === "v03-coordination-failure",
    );
    const routeOnlyAncestor = catalog.sections.find(
      (candidate) => candidate.sectionId === "v01-the-seed",
    );

    expect(catalog.stats.volumeCount).toBe(9);
    expect(catalog.stats.sectionCount).toBeGreaterThan(500);
    expect(section.sectionId).toBe("v01-orientation");
    expect(section.versionHash).toBe(section.contentHash);
    expect(section.versionDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(section.versionUrl).toMatch(
      /^https:\/\/github\.com\/providence-collective\/coherence-thesis\/pull\/\d+$/,
    );
    expect(section.audioVersionId).toBe(`${section.sectionId}-${section.contentHash}`);
    expect(historicalRename?.progressContinuityGroups).toEqual([
      [
        "v03-on-the-meaning-of-coordination-failure",
        "the-central-wound-on-the-meaning-of-coordination-failure",
      ],
    ]);
    expect(routeOnlyAncestor?.legacyContinuityIds).toContain(
      "v01-seed-sprout-stem-and-soil",
    );
    expect(routeOnlyAncestor?.progressContinuityGroups).toEqual([
      ["v01-the-seed"],
    ]);
    expect(catalog.overview.nodes.length).toBe(9);
  });

  it("collapses duplicate part and chapter slugs in canonical section routes", () => {
    const catalog = currentCatalog();
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
    const catalog = currentCatalog();
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

  it("disambiguates an opening chapter that shares its part identity", () => {
    const catalog = currentCatalog();
    const section = catalog.sections.find(
      (candidate) => candidate.sectionId === "v04-the-sequence-problem",
    );

    expect(section?.chapterId).toBe(section?.partId);
    expect(section?.href).toBe(
      "/manuscripts/4/the-sequence-problem/chapter-start/the-sequence-problem/",
    );
  });

  it("gives every section in a single-chapter part a direct reader route", () => {
    const catalog = currentCatalog();
    const sections = catalog.sections.filter(
      (candidate) => candidate.partId === "the-internal-technologies",
    );

    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((section) => section.readerHref === section.href)).toBe(
      true,
    );
  });

  it("records every generated compatibility alias in published routes", () => {
    const catalog = currentCatalog();
    const published = new Set(
      currentPublishedRoutes(catalog).map((entry) => entry.href),
    );
    const missing = (catalog.routeAliases ?? [])
      .map((alias) => alias.sourceHref)
      .filter((href) => !published.has(href));

    expect(missing).toEqual([]);
  }, 40_000);

  it("preserves old duplicate section routes as generated aliases", () => {
    const catalog = currentCatalog();
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
    const catalog = currentCatalog();
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
    const catalog = currentCatalog();
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
    const catalog = currentCatalog();
    const alias = catalog.aliases.find(
      (candidate) =>
        candidate.sourceHref ===
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-the-sprout/",
    );

    expect(
      catalog.sections.some((section) => section.sectionId === "v01-the-sprout"),
    ).toBe(false);
    expect(alias).toMatchObject({
      targetSectionId: "v01-when-scale-outruns-regulation",
      targetHref:
        "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/when-scale-outruns-regulation/",
    });
  });

  it("does not publish subtitle-only structural openers anywhere in the catalog", () => {
    const catalog = currentCatalog();
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

  it("rejects equivalent alias variants with conflicting targets", () => {
    expect(() =>
      buildCatalog(manuscriptRoot, {
        routeAliasConfig: {
          version: 1,
          aliases: [
            {
              sourceHref: "/manuscripts/1/retired-route/",
              targetHref: "/manuscripts/1/opening/",
            },
            {
              sourceHref:
                "/manuscripts/humanitys-most-viable-future/retired-route/",
              targetHref: "/manuscripts/1/seed-sprout-stem-and-soil/",
            },
          ],
        },
      }),
    ).toThrow(/equivalent route alias source.*targets both/i);
  });

  it("rejects a section alias that occupies a canonical volume-name variant", () => {
    expect(() =>
      buildCatalog(manuscriptRoot, {
        aliasConfig: {
          version: 1,
          aliases: [
            {
              sourceHref:
                "/manuscripts/humanitys-most-viable-future/opening/orientation/",
              targetSectionId: "v01-how-understanding-takes-root",
            },
          ],
        },
      }),
    ).toThrow(/section alias sourceHref.*canonical route variant/i);
  });
});
