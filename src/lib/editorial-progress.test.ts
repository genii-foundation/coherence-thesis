import { describe, expect, it } from "vitest";

import { deriveEditorialVolumeProgress } from "./editorial-progress";

const baseline = `# Opening

One opening sentence.

## A Note on Compression

One unresolved sentence.
`;

describe("deriveEditorialVolumeProgress", () => {
  it("separates rendered coverage from editorial settlement", () => {
    const progress = deriveEditorialVolumeProgress(
      "volume-01",
      baseline,
      new Map([
        ["v01-opening", { status: "settled" }],
        ["v01-a-note-on-compression", { status: "open" }],
      ]),
    );

    expect(progress).toMatchObject({
      rendered: 2,
      settled: 1,
      open: 1,
      notStarted: 0,
      total: 2,
      renderedPercent: 100,
      settledPercent: 50,
    });
  });

  it("counts a missing record as not started", () => {
    const progress = deriveEditorialVolumeProgress(
      "volume-01",
      baseline,
      new Map([["v01-opening", { status: "settled" }]]),
    );

    expect(progress).toMatchObject({
      rendered: 1,
      settled: 1,
      open: 0,
      notStarted: 1,
      renderedPercent: 50,
      settledPercent: 50,
    });
  });
});
