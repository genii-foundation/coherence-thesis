import { describe, expect, it } from "vitest";
import { buildSections, findStart, startMarkers } from "./import-markdown";
import { readVolumeConfigs } from "./shared";

describe("reader start boundaries", () => {
  it("accepts the current and revised opening headings", () => {
    expect(
      findStart(["# First, the Story"], "architecting-providence"),
    ).toBe(0);
    expect(
      findStart(["# Power Without Coordination"], "architecting-providence"),
    ).toBe(0);
    expect(findStart(["## Part I"], "presencing-genius")).toBe(0);
    expect(
      findStart(["## Part I: The Argument, Arrived"], "presencing-genius"),
    ).toBe(0);
  });

  it("fails closed when every configured marker disappears", () => {
    expect(() =>
      findStart(["# A Changed Opening"], "architecting-providence"),
    ).toThrow(/No reader start marker was found/);
  });

  it("defines a marker for every configured volume", () => {
    for (const config of readVolumeConfigs()) {
      expect(startMarkers[config.volumeId]?.length).toBeGreaterThan(0);
    }
  });

  it.each([
    {
      volumeId: "architecting-providence",
      firstTitle: "First, the Story",
      excludedIds: ["v04-architecting-providence", "v04-book-iv-architecting-providence"],
    },
    {
      volumeId: "presencing-genius",
      firstTitle: "The Argument, Arrived",
      excludedIds: ["v07-the-argument-arrived-2"],
    },
    {
      volumeId: "cardinal-scale",
      firstTitle: "A note on the register of this volume",
      excludedIds: ["v09-opening"],
    },
  ])(
    "keeps title and contents matter outside the $volumeId reader",
    ({ volumeId, firstTitle, excludedIds }) => {
      const config = readVolumeConfigs().find(
        (candidate) => candidate.volumeId === volumeId,
      );
      expect(config).toBeDefined();

      const sections = buildSections(config!);
      expect(sections[0]?.frontmatter.title).toBe(firstTitle);
      const sectionIds = sections.map((section) => section.frontmatter.sectionId);
      for (const excludedId of excludedIds) {
        expect(sectionIds).not.toContain(excludedId);
      }
    },
  );
});
