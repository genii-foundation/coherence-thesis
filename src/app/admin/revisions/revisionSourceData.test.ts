import { describe, expect, it } from "vitest";

import { extractOriginalSection } from "./revisionSourceData";

describe("revision source context", () => {
  it("preserves the complete original section through the next peer heading", () => {
    const markdown = `# Part One

## Taking Pause Between Seed and Sprout

Before moving on, it is worth pausing.

*The claim is intentionally narrow.*

.  :  .

### A nested thought

This remains part of the section.

---

## The Sprout

This belongs to the next section.`;

    expect(
      extractOriginalSection(
        markdown,
        "Taking Pause Between Seed and Sprout",
      ),
    ).toEqual([
      "Before moving on, it is worth pausing.",
      "*The claim is intentionally narrow.*",
      ".  :  .",
      "### A nested thought",
      "This remains part of the section.",
    ]);
  });

  it("returns no context when the original heading is absent", () => {
    expect(extractOriginalSection("# Another section", "Missing")).toEqual([]);
  });
});
