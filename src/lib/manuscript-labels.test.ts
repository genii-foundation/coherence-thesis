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

  it("uses the volume identity when an internal grouping needs a fallback label", () => {
    const volume = {
      title: "Humanity's Most Viable Future",
      parts: [frontMatterPart, authoredPart],
    };

    expect(authoredPartCount(volume)).toBe(1);
    expect(displayPartTitle(frontMatterPart, volume)).toBe(
      "Humanity's Most Viable Future",
    );
    expect(displayPartKicker(frontMatterPart)).toBe("Manuscript");
    expect(displayPartRouteSegment(frontMatterPart, volume)).toBe("opening");
    expect(displayPartCountLabel(volume)).toBe("1 part");
  });

  it("keeps the legacy contents route for an unpartitioned manuscript", () => {
    const volume = { title: "The Cardinal Scale", parts: [frontMatterPart] };

    expect(authoredPartCount(volume)).toBe(0);
    expect(displayPartTitle(frontMatterPart, volume)).toBe("The Cardinal Scale");
    expect(displayPartKicker(frontMatterPart)).toBe("Manuscript");
    expect(displayPartRouteSegment(frontMatterPart, volume)).toBe("contents");
    expect(displayPartCountLabel(volume)).toBe("Unpartitioned");
  });
});
