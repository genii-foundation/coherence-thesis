import { describe, expect, it } from "vitest";
import { buildSections, findStart, startMarkers } from "./import-markdown";
import { readVolumeConfigs } from "./shared";

describe("reader start boundaries", () => {
  it("fails closed when a configured marker disappears", () => {
    expect(() =>
      findStart(["# A Changed Opening"], "architecting-providence"),
    ).toThrow(/Reader start marker 'Power Without Coordination' was not found/);
  });

  it("defines a marker for every configured volume", () => {
    for (const config of readVolumeConfigs()) {
      expect(startMarkers[config.volumeId]).toBeTruthy();
    }
  });

  it.each([
    {
      volumeId: "architecting-providence",
      firstTitle: "Power Without Coordination",
      excludedIds: ["v04-architecting-providence", "v04-book-iv-architecting-providence"],
    },
    {
      volumeId: "presencing-genius",
      firstTitle: "The Argument, Arrived",
      excludedIds: ["v07-the-argument-arrived-2"],
    },
    {
      volumeId: "cardinal-scale",
      firstTitle: "A Note on the Register",
      excludedIds: ["v09-opening", "v09-a-note-on-the-register-of-this-volume"],
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
