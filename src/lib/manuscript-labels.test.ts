import { describe, expect, it } from "vitest";
import {
  authoredPartCount,
  displayPartCountLabel,
  displayPartKicker,
  displayPartRouteSegment,
  displayPartTitle,
  isSyntheticFrontMatterPart,
} from "./manuscript-labels";

const frontMatterPart = {
  partId: "front-matter",
  title: "Front Matter",
  order: 0,
};

const authoredPart = {
  partId: "the-diagnosis",
  title: "The Diagnosis",
  order: 1,
};

describe("manuscript labels", () => {
  it("treats order zero front matter as a generated grouping", () => {
    expect(isSyntheticFrontMatterPart(frontMatterPart)).toBe(true);
    expect(isSyntheticFrontMatterPart(authoredPart)).toBe(false);
  });

  it("labels leading generated material as opening when authored parts exist", () => {
    const volume = { parts: [frontMatterPart, authoredPart] };

    expect(authoredPartCount(volume)).toBe(1);
    expect(displayPartTitle(frontMatterPart, volume)).toBe("Opening");
    expect(displayPartKicker(frontMatterPart, volume)).toBe("Opening");
    expect(displayPartRouteSegment(frontMatterPart, volume)).toBe("opening");
    expect(displayPartCountLabel(volume)).toBe("1 part");
  });

  it("labels a single generated grouping as contents instead of a part", () => {
    const volume = { parts: [frontMatterPart] };

    expect(authoredPartCount(volume)).toBe(0);
    expect(displayPartTitle(frontMatterPart, volume)).toBe("Contents");
    expect(displayPartKicker(frontMatterPart, volume)).toBe("Manuscript");
    expect(displayPartRouteSegment(frontMatterPart, volume)).toBe("contents");
    expect(displayPartCountLabel(volume)).toBe("Unpartitioned");
  });
});
