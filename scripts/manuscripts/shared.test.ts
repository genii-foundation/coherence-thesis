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
    expect(sectionPdfHref("v01-orientation")).toBe(
      "/downloads/sections/v01-orientation.pdf",
    );
    expect(manuscriptPdfHref("humanitys-most-viable-future")).toBe(
      "/downloads/manuscripts/humanitys-most-viable-future.pdf",
    );
  });

  it("builds the current catalog from canonical markdown", () => {
    const catalog = buildCatalog();
    const section = catalog.sections[0];

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
      (candidate) => candidate.sectionId === "v01-seed-sprout-stem-and-soil",
    );

    expect(section?.href).toBe(
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/",
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

  it("preserves old duplicate section routes as generated aliases", () => {
    const catalog = buildCatalog();
    const alias = catalog.aliases.find(
      (candidate) =>
        candidate.sourceHref ===
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/",
    );

    expect(alias).toMatchObject({
      targetSectionId: "v01-seed-sprout-stem-and-soil",
      targetHref:
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/",
    });
  });
});
