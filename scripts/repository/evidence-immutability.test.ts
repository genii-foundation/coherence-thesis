import { describe, expect, it } from "vitest";

import {
  findEvidenceImmutabilityViolations,
  reviewBatchFromPath,
} from "./evidence-immutability";

describe("evidence immutability", () => {
  it("resolves volume and corpus review batches", () => {
    expect(
      reviewBatchFromPath(
        "editorial/evidence/reviews/volumes/volume-01/wave-one/review.json",
      ),
    ).toBe(
      "editorial/evidence/reviews/volumes/volume-01/wave-one",
    );
    expect(
      reviewBatchFromPath(
        "editorial/evidence/reviews/corpus/nine-volume/summary.md",
      ),
    ).toBe("editorial/evidence/reviews/corpus/nine-volume");
  });

  it("rejects changes to batches present at the branch base", () => {
    expect(
      findEvidenceImmutabilityViolations([
        {
          batch: "editorial/evidence/reviews/volumes/volume-01/wave-one",
          changedInCommits: true,
          changedInWorktree: false,
          existedAtBase: true,
          existsAtHead: true,
          touchingCommits: 1,
        },
      ]),
    ).toEqual([
      {
        batch: "editorial/evidence/reviews/volumes/volume-01/wave-one",
        reason: "changed-after-base",
      },
    ]);
  });

  it("allows a new batch to be assembled before its first commit", () => {
    expect(
      findEvidenceImmutabilityViolations([
        {
          batch: "editorial/evidence/reviews/corpus/new-audit",
          changedInCommits: false,
          changedInWorktree: true,
          existedAtBase: false,
          existsAtHead: false,
          touchingCommits: 0,
        },
      ]),
    ).toEqual([]);
  });

  it("rejects later commits and worktree edits to a new committed batch", () => {
    expect(
      findEvidenceImmutabilityViolations([
        {
          batch: "editorial/evidence/reviews/corpus/new-audit",
          changedInCommits: true,
          changedInWorktree: true,
          existedAtBase: false,
          existsAtHead: true,
          touchingCommits: 2,
        },
      ]),
    ).toEqual([
      {
        batch: "editorial/evidence/reviews/corpus/new-audit",
        reason: "changed-after-commit",
      },
      {
        batch: "editorial/evidence/reviews/corpus/new-audit",
        reason: "changed-in-multiple-commits",
      },
    ]);
  });
});
