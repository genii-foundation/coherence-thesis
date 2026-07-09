import { describe, expect, it } from "vitest";
import {
  allSections,
  breadcrumbRoutes,
  chapterByHref,
  manuscriptPathParams,
  partByHref,
  partById,
  sectionNavigation,
  sectionByHrefOrAlias,
  sectionsStartingAt,
  volumeByRouteSegment,
} from "./manuscript-data";

describe("manuscript data", () => {
  it("returns the canonical playback suffix from a section", () => {
    const sections = allSections();
    const start = sections[2]!;

    expect(sectionsStartingAt(start.sectionId).map((section) => section.sectionId)).toEqual(
      sections.slice(2).map((section) => section.sectionId),
    );
  });

  it("returns no playback sections for an unknown section", () => {
    expect(sectionsStartingAt("missing-section")).toEqual([]);
  });

  it("resolves numeric volume routes without renaming stable volume IDs", () => {
    const volume = volumeByRouteSegment("2");

    expect(volume?.volumeId).toBe("wielding-intelligence");
    expect(volume?.href).toBe("/manuscripts/2/");
    expect(volumeByRouteSegment("wielding-intelligence")?.href).toBe(volume?.href);
  });

  it("uses the part as the parent for singleton chapter sections", () => {
    const section = allSections().find(
      (candidate) =>
        candidate.href ===
        "/manuscripts/3/the-reckoning/the-central-wound/",
    );
    expect(section).toBeDefined();
    const part = partById(section!.volumeId, section!.partId);
    const navigation = sectionNavigation(section!);

    expect(navigation?.parent).toEqual({
      title: part?.title,
      href: part?.href,
    });
  });

  it("omits the duplicate chapter crumb for singleton chapter sections", () => {
    const route = breadcrumbRoutes().find(
      (candidate) =>
        candidate.href ===
        "/manuscripts/3/the-reckoning/the-central-wound/",
    );

    expect(route?.crumbs.map((crumb) => crumb.label)).toEqual([
      "The Reckoning",
      "The Central Wound",
    ]);
    expect(route?.crumbs.map((crumb) => crumb.href)).toEqual([
      "/manuscripts/3/the-reckoning/",
      "/manuscripts/3/the-reckoning/the-central-wound/",
    ]);
  });

  it("omits repeated breadcrumb labels for self-titled sections", () => {
    const route = breadcrumbRoutes().find(
      (candidate) => candidate.href === "/manuscripts/2/main/wielding-intelligence/",
    );

    expect(route?.crumbs.map((crumb) => crumb.label)).toEqual([
      "Wielding Intelligence",
    ]);
  });

  it("resolves collapsed canonical section hrefs and old duplicate aliases", () => {
    const canonical = "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/";
    const oldDuplicate =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/";

    expect(sectionByHrefOrAlias(canonical)?.section.sectionId).toBe("v01-the-seed");
    expect(sectionByHrefOrAlias(oldDuplicate)?.alias?.targetHref).toBe(canonical);
  });

  it("resolves skipped part opener aliases to content sections", () => {
    const opener =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/";
    const target = "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/";
    const keys = new Set(
      manuscriptPathParams().map((param) => `${param.volumeId}/${param.route.join("/")}`),
    );

    expect(sectionByHrefOrAlias(opener)?.section.sectionId).toBe("v01-the-seed");
    expect(sectionByHrefOrAlias(opener)?.alias?.targetHref).toBe(target);
    expect(
      keys.has(
        "humanitys-most-viable-future/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil",
      ),
    ).toBe(true);
  });

  it("publishes clean synthetic opening and contents routes", () => {
    const opening = partByHref("/manuscripts/1/opening/");
    const contents = partByHref("/manuscripts/8/contents/");
    const openingSection = sectionByHrefOrAlias("/manuscripts/1/opening/orientation/");
    const contentsSection = sectionByHrefOrAlias(
      "/manuscripts/8/contents/prologue-two-scenes/start/",
    );

    expect(opening?.part.partId).toBe("front-matter");
    expect(opening?.part.title).toBe("Front Matter");
    expect(contents?.part.partId).toBe("front-matter");
    expect(contents?.part.title).toBe("Front Matter");
    expect(openingSection?.section.sectionId).toBe("v01-orientation");
    expect(contentsSection?.section.sectionId).toBe("v08-prologue-two-scenes");
  });

  it("keeps legacy front matter routes available as aliases", () => {
    const legacyOpeningPart = partByHref(
      "/manuscripts/humanitys-most-viable-future/front-matter/",
    );
    const legacyContentsPart = partByHref(
      "/manuscripts/misanthropic-artifice/front-matter/",
    );
    const legacyChapter = chapterByHref(
      "/manuscripts/misanthropic-artifice/front-matter/prologue-two-scenes/",
    );
    const legacySection = sectionByHrefOrAlias(
      "/manuscripts/misanthropic-artifice/front-matter/prologue-two-scenes/v08-prologue-two-scenes/",
    );
    const keys = new Set(
      manuscriptPathParams().map((param) => `${param.volumeId}/${param.route.join("/")}`),
    );

    expect(legacyOpeningPart?.part.href).toBe(
      "/manuscripts/1/opening/",
    );
    expect(legacyContentsPart?.part.href).toBe("/manuscripts/8/contents/");
    expect(legacyChapter?.chapter.href).toBe(
      "/manuscripts/8/contents/prologue-two-scenes/",
    );
    expect(legacySection?.section.href).toBe(
      "/manuscripts/8/contents/prologue-two-scenes/start/",
    );
    expect(legacySection?.alias?.targetHref).toBe(
      "/manuscripts/8/contents/prologue-two-scenes/start/",
    );
    expect(keys.has("humanitys-most-viable-future/front-matter")).toBe(true);
    expect(keys.has("misanthropic-artifice/front-matter/prologue-two-scenes")).toBe(true);
  });

  it("resolves skipped chapter opener aliases to content sections", () => {
    const opener =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-the-sprout/";
    const target =
      "/manuscripts/1/seed-sprout-stem-and-soil/the-sprout/why-this-is-happening-and-why-it-changes-everything/";
    const keys = new Set(
      manuscriptPathParams().map((param) => `${param.volumeId}/${param.route.join("/")}`),
    );

    expect(sectionByHrefOrAlias(opener)?.section.sectionId).toBe(
      "v01-why-this-is-happening-and-why-it-changes-everything",
    );
    expect(sectionByHrefOrAlias(opener)?.alias?.targetHref).toBe(target);
    expect(
      keys.has(
        "humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-the-sprout",
      ),
    ).toBe(true);
  });

  it("keeps duplicate part and chapter labels out of collapsed breadcrumbs", () => {
    const route = breadcrumbRoutes().find(
      (candidate) =>
        candidate.href ===
        "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    );

    expect(route?.crumbs.map((crumb) => crumb.label)).toEqual([
      "Seed, Sprout, Stem & Soil",
      "The Seed",
    ]);
    expect(route?.crumbs.map((crumb) => crumb.href)).toEqual([
      "/manuscripts/1/seed-sprout-stem-and-soil/",
      "/manuscripts/1/seed-sprout-stem-and-soil/the-seed/",
    ]);
  });

  it("points multi-section chapters at one reader page with section anchors", () => {
    const sections = allSections().filter((section) =>
      section.chapterHref.endsWith(
        "/4/the-governance-architecture/the-amendment-architecture/",
      ),
    );
    const sectionIds = sections.map((section) => section.sectionId);

    expect(sectionIds).toEqual([
      "v04-the-amendment-architecture",
      "v04-the-deeper-inquiry-9",
      "v04-what-remains-open-9",
    ]);
    expect(sections.map((section) => section.readerHref)).toEqual([
      `${sections[0]!.chapterHref}#v04-the-amendment-architecture`,
      `${sections[0]!.chapterHref}#v04-the-deeper-inquiry-9`,
      `${sections[0]!.chapterHref}#v04-what-remains-open-9`,
    ]);

    const oldChildRoute = breadcrumbRoutes().find(
      (candidate) => candidate.href === sections[0]!.href,
    );

    expect(oldChildRoute?.crumbs.map((crumb) => crumb.label)).toEqual([
      "The Governance Architecture",
      "The Amendment Architecture",
    ]);
  });

  it("generates static params for canonical and aliased section paths", () => {
    const keys = new Set(
      manuscriptPathParams().map((param) => `${param.volumeId}/${param.route.join("/")}`),
    );

    expect(keys.has("1/seed-sprout-stem-and-soil/the-seed")).toBe(true);
    expect(
      keys.has(
        "humanitys-most-viable-future/seed-sprout-stem-and-soil/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil",
      ),
    ).toBe(true);
  });
});
