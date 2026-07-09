import { describe, expect, it } from "vitest";
import {
  allSections,
  breadcrumbRoutes,
  manuscriptPathParams,
  partById,
  sectionNavigation,
  sectionByHrefOrAlias,
  sectionsStartingAt,
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

  it("uses the part as the parent for singleton chapter sections", () => {
    const section = allSections().find(
      (candidate) =>
        candidate.href ===
        "/manuscripts/providence-imperative/the-reckoning/the-central-wound/v03-the-central-wound/",
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
        "/manuscripts/providence-imperative/the-reckoning/the-central-wound/v03-the-central-wound/",
    );

    expect(route?.crumbs.map((crumb) => crumb.label)).toEqual([
      "The Reckoning",
      "The Central Wound",
    ]);
    expect(route?.crumbs.map((crumb) => crumb.href)).toEqual([
      "/manuscripts/providence-imperative/the-reckoning/",
      "/manuscripts/providence-imperative/the-reckoning/the-central-wound/v03-the-central-wound/",
    ]);
  });

  it("resolves collapsed canonical section hrefs and old duplicate aliases", () => {
    const canonical =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-seed/v01-the-seed/";
    const oldDuplicate =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/";

    expect(sectionByHrefOrAlias(canonical)?.section.sectionId).toBe("v01-the-seed");
    expect(sectionByHrefOrAlias(oldDuplicate)?.alias?.targetHref).toBe(canonical);
  });

  it("resolves skipped part opener aliases to content sections", () => {
    const opener =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil/";
    const target =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-seed/v01-the-seed/";
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

  it("resolves skipped chapter opener aliases to content sections", () => {
    const opener =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-the-sprout/";
    const target =
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-sprout/v01-why-this-is-happening-and-why-it-changes-everything/";
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
        "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-seed/v01-the-seed/",
    );

    expect(route?.crumbs.map((crumb) => crumb.label)).toEqual([
      "Seed, Sprout, Stem & Soil",
      "The Seed",
    ]);
    expect(route?.crumbs.map((crumb) => crumb.href)).toEqual([
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/",
      "/manuscripts/humanitys-most-viable-future/seed-sprout-stem-and-soil/the-seed/v01-the-seed/",
    ]);
  });

  it("points multi-section chapters at one reader page with section anchors", () => {
    const sections = allSections().filter((section) =>
      section.chapterHref.endsWith(
        "/architecting-providence/the-governance-architecture/the-amendment-architecture/",
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

    expect(
      keys.has(
        "humanitys-most-viable-future/seed-sprout-stem-and-soil/the-seed/v01-the-seed",
      ),
    ).toBe(true);
    expect(
      keys.has(
        "humanitys-most-viable-future/seed-sprout-stem-and-soil/seed-sprout-stem-and-soil/v01-seed-sprout-stem-and-soil",
      ),
    ).toBe(true);
  });
});
