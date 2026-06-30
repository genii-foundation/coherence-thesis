import { describe, expect, it } from "vitest";
import {
  allSections,
  breadcrumbRoutes,
  partById,
  sectionNavigation,
  sectionsStartingAt,
} from "./manuscript-data";

describe("manuscript data", () => {
  it("returns the canonical playback suffix from a section", () => {
    const sections = allSections();
    const start = sections[2];

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
});
