import { describe, expect, it } from "vitest";
import { manuscriptPdfHref, sectionPdfHref } from "./pdf";
import { buildCatalog, slugify, wordCount } from "./shared";

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

    expect(section?.href).toBe(
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-seed/v01-the-seed/",
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
      "/manuscripts/humanitys-most-viable-future/opening/orientation/v01-orientation/",
    );
    expect(opening?.readerHref).toBe(opening?.href);
    expect(contents?.href).toBe(
      "/manuscripts/misanthropic-artifice/contents/prologue-two-scenes/v08-prologue-two-scenes/",
    );
    expect(contents?.readerHref).toBe(
      "/manuscripts/misanthropic-artifice/contents/prologue-two-scenes/#v08-prologue-two-scenes",
    );
    expect(openingPart?.href).toBe(
      "/manuscripts/humanitys-most-viable-future/opening/",
    );
    expect(contentsPart?.href).toBe("/manuscripts/misanthropic-artifice/contents/");
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
      targetHref:
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-seed/v01-the-seed/",
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
      targetHref:
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-seed/v01-the-seed/",
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
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-why-this-is-happening-and-why-it-changes-everything/",
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
});
